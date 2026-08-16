// SoundEngine — the Web Audio mixer engine. Framework-independent (no React/store imports).
// Public API contract: docs/design/audio-engine.md §7.
//
// Per-placement node chain: source -> spatial (Panner[HRTF] | StereoPanner) -> gain -> master -> destination.
import type { NoiseColor, Placement, Sound } from '../data/types'
import { renderBinauralBuffer } from './binaural'
import { fadeTo } from './fade'
import { createAudioBufferLoader } from './loader'
import { NOISE_BUFFER_SECONDS, renderNoiseBuffer } from './noise'
import { MAX_DISTANCE, RAMP_SEC, REF_DISTANCE, angleToPosition, fallbackGain, fallbackPan, shouldApplyRamp } from './spatial'
import type {
  EngineAudioBuffer,
  EngineAudioContext,
  EngineBufferSourceNode,
  EngineGainNode,
  EnginePannerNode,
  EngineStereoPannerNode,
} from './web-audio-types'

export type PanQuality = 'hrtf' | 'stereo'

const NOISE_SECONDS = 10
const BINAURAL_SECONDS = 10
// audio-engine.md §5: individual placement onset should fade in too, not click straight to gain.
// Exported so tests can advance ctx.currentTime past it deliberately (sound-engine.test.ts).
export const FADE_IN_SEC = 0.2
// ponytail: no real mobile-WebView HRTF budget measurement yet (design doc §8 open question #2)
// — a flat active-placement-count heuristic is the cheap safety net. One-way (no upgrade back to
// HRTF once downgraded): hysteresis isn't worth the complexity for a rare "you piled on too many
// sounds" edge case.
const HRTF_AUTO_DOWNGRADE_THRESHOLD = 8

interface LoadedSound {
  buffer: EngineAudioBuffer
  loopStart?: number
  loopEnd?: number
  // Binaural beats bake hard L/R separation into the buffer itself — routing them through a
  // Panner/StereoPanner would collapse or reposition that separation, so they skip the spatial
  // node entirely (docs/design/audio-engine.md gap notes, E3 §6).
  panBypass?: boolean
}

interface PlacementNodes {
  source: EngineBufferSourceNode
  spatial: EnginePannerNode | EngineStereoPannerNode | null
  gain: EngineGainNode
  quality: PanQuality
  placement: Placement
  lastRampAt: number
  lastGain: number
  panBypass: boolean
  fadeInEndsAt: number // MEDIUM-1 follow-up: volumeCurve is suppressed until ctx.currentTime passes this
}

function createDefaultAudioContext(): EngineAudioContext {
  return new AudioContext() as unknown as EngineAudioContext
}

export class SoundEngine {
  private readonly master: EngineGainNode
  private readonly loadFile: (url: string) => Promise<EngineAudioBuffer>
  private readonly sounds = new Map<string, LoadedSound>()
  private readonly noiseBuffers = new Map<NoiseColor, EngineAudioBuffer>()
  private readonly binauralBuffers = new Map<string, EngineAudioBuffer>() // keyed "carrierHz:beatHz" — presets share buffers, same as noise colors
  private readonly active = new Map<string, PlacementNodes>()
  private quality: PanQuality = 'hrtf'
  private sleepFadeTimer?: ReturnType<typeof setTimeout>
  private sleepStopTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly ctx: EngineAudioContext = createDefaultAudioContext()) {
    this.master = ctx.createGain()
    this.master.connect(ctx.destination)
    this.loadFile = createAudioBufferLoader(ctx)
  }

  /**
   * First user gesture: resume the context. Buffers are NOT pre-rendered here — with 16 colors
   * that was ~8.9M samples of multi-pass filtering on the main thread (≈35MB resident) before the
   * first sound could play, and it rendered tiers the user may never touch. `load()` already
   * caches per color on demand, so the cost now lands one sound at a time, when it's asked for.
   * See .omc/reviews/v030-review.md H3 / v030-final-review.md §5.
   */
  async init(): Promise<void> {
    await this.ctx.resume()
  }

  /** Load a catalog sound (fetch+decode for files, cached buffer for synth/binaural). Idempotent. */
  async load(sound: Sound): Promise<void> {
    if (this.sounds.has(sound.id)) return
    if (sound.source.kind === 'synth') {
      this.sounds.set(sound.id, { buffer: this.renderAndCacheNoise(sound.source.generator) })
      return
    }
    if (sound.source.kind === 'binaural') {
      const buffer = this.renderAndCacheBinaural(sound.source.carrierHz, sound.source.beatHz)
      this.sounds.set(sound.id, { buffer, panBypass: true })
      return
    }
    const buffer = await this.loadFile(sound.source.src)
    this.sounds.set(sound.id, { buffer, loopStart: sound.source.loopStart, loopEnd: sound.source.loopEnd })
  }

  /** Start playback for a placement. No-op if already playing. Requires load() to have run first. */
  play(placement: Placement): void {
    if (this.active.has(placement.id)) return
    const loaded = this.sounds.get(placement.soundId)
    if (!loaded) {
      throw new Error(`SoundEngine.play: sound "${placement.soundId}" is not loaded — call load() first`)
    }

    const source = this.ctx.createBufferSource()
    source.buffer = loaded.buffer
    source.loop = true
    if (loaded.loopStart !== undefined) source.loopStart = loaded.loopStart
    if (loaded.loopEnd !== undefined) source.loopEnd = loaded.loopEnd

    const panBypass = loaded.panBypass === true
    const spatial = panBypass ? null : this.buildSpatialNode(this.quality)
    const gain = this.ctx.createGain()
    source.connect(spatial ?? gain)
    if (spatial) spatial.connect(gain)
    gain.connect(this.master)

    // MEDIUM-1 follow-up (v020-review.md): the fade-in ramp's own target must be curve-free —
    // otherwise the very placement being modulated could start its fade already offset by
    // whatever angle it happened to spawn at, instead of settling at its plain volume.
    const target = this.computeGain(placement, this.quality, panBypass, true)
    const nodes: PlacementNodes = {
      source,
      spatial,
      gain,
      quality: this.quality,
      placement,
      lastRampAt: -Infinity,
      lastGain: target,
      panBypass,
      fadeInEndsAt: this.ctx.currentTime + FADE_IN_SEC,
    }
    this.active.set(placement.id, nodes)

    gain.gain.value = 0
    fadeTo(gain.gain, this.ctx.currentTime, target, FADE_IN_SEC)
    if (!panBypass) this.applySpatial(nodes, placement, true)

    source.start()

    if (this.quality === 'hrtf' && this.active.size > HRTF_AUTO_DOWNGRADE_THRESHOLD) {
      this.setPanQuality('stereo')
    }
  }

  /** Stop a placement, optionally fading out first, then tear down its node chain. */
  stop(placementId: string, fadeSec = 0): void {
    const nodes = this.active.get(placementId)
    if (!nodes) return
    this.active.delete(placementId)
    if (fadeSec > 0) {
      fadeTo(nodes.gain.gain, this.ctx.currentTime, 0, fadeSec)
      setTimeout(() => this.cleanupNodes(nodes), fadeSec * 1000)
    } else {
      this.cleanupNodes(nodes)
    }
  }

  /** Apply placement changes (volume/mute/radius/angle/locked) to a currently-playing chain. */
  setPlacement(placement: Placement): void {
    const nodes = this.active.get(placement.id)
    if (!nodes) return
    nodes.placement = placement
    // MEDIUM-1: OrbitField calls this every rAF frame while a placement orbits. A raw
    // `.value =` assignment is an immediate automation event that cancels any in-flight ramp
    // (e.g. play()'s fade-in) — only touch it when the gain actually changed.
    //
    // MEDIUM-1 follow-up: once volumeCurve has a real UI path, an orbiting curved placement
    // changes its computed gain on essentially every frame (angle keeps moving) — without this,
    // the "only touch it when changed" guard above would stop protecting anything, and every
    // frame during play()'s 0.2s fade-in would re-fire an immediate write that cancels the ramp.
    // Suppressing just the curve term (not the whole gain path) during that window lets the ramp
    // finish undisturbed while still honoring real volume/mute changes made in the meantime.
    const suppressCurve = this.ctx.currentTime < nodes.fadeInEndsAt
    const g = this.computeGain(placement, nodes.quality, nodes.panBypass, suppressCurve)
    if (g !== nodes.lastGain) {
      nodes.gain.gain.value = g
      nodes.lastGain = g
    }
    if (!nodes.panBypass && !placement.locked) this.applySpatial(nodes, placement, false)
  }

  setMasterVolume(v: number): void {
    this.master.gain.value = Math.min(1, Math.max(0, v))
  }

  /** Switch panning quality at runtime, rewiring every active chain's spatial node in place. */
  setPanQuality(q: PanQuality): void {
    if (q === this.quality) return
    this.quality = q
    for (const nodes of this.active.values()) {
      if (nodes.panBypass) continue // binaural has no spatial node to rewire — hard L/R survives quality switches untouched

      nodes.source.disconnect()
      nodes.spatial?.disconnect()

      const spatial = this.buildSpatialNode(q)
      nodes.source.connect(spatial)
      spatial.connect(nodes.gain)

      nodes.spatial = spatial
      nodes.quality = q
      nodes.lastRampAt = -Infinity
      nodes.lastGain = this.computeGain(nodes.placement, q, false)
      nodes.gain.gain.value = nodes.lastGain
      this.applySpatial(nodes, nodes.placement, true)
    }
  }

  /** duration 초 뒤 정지, 마지막 fadeSec 동안 페이드아웃. */
  scheduleSleep(durationSec: number, fadeSec: number): void {
    this.cancelSleep()
    const fadeDelayMs = Math.max(0, durationSec - fadeSec) * 1000
    this.sleepFadeTimer = setTimeout(() => {
      void this.fadeOutAll(fadeSec)
    }, fadeDelayMs)
    this.sleepStopTimer = setTimeout(() => {
      for (const id of [...this.active.keys()]) this.stop(id)
      void this.ctx.suspend()
    }, durationSec * 1000)
  }

  cancelSleep(): void {
    clearTimeout(this.sleepFadeTimer)
    clearTimeout(this.sleepStopTimer)
    this.sleepFadeTimer = undefined
    this.sleepStopTimer = undefined
  }

  fadeOutAll(durationSec: number): Promise<void> {
    fadeTo(this.master.gain, this.ctx.currentTime, 0, durationSec)
    return new Promise((resolve) => setTimeout(resolve, durationSec * 1000))
  }

  /** Test-only introspection — current gain/pan for a placement's node chain. */
  inspect(placementId: string): { gain: number; pan: { x: number; z: number } } | null {
    const nodes = this.active.get(placementId)
    if (!nodes) return null
    if (nodes.panBypass) return { gain: nodes.gain.gain.value, pan: { x: 0, z: 0 } } // hard L/R is baked into the buffer, not a spatial node
    if (nodes.quality === 'hrtf') {
      const panner = nodes.spatial as EnginePannerNode
      return { gain: nodes.gain.gain.value, pan: { x: panner.positionX.value, z: panner.positionZ.value } }
    }
    const stereo = nodes.spatial as EngineStereoPannerNode
    return { gain: nodes.gain.gain.value, pan: { x: stereo.pan.value, z: 0 } }
  }

  onEnterBackground(): void {
    // ponytail: silent keep-alive <audio> + native handoff is app-shell/native-plugin territory
    // (design doc §6, task #9) — nothing for the engine itself to do until that lands.
  }

  onEnterForeground(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  dispose(): void {
    this.cancelSleep()
    for (const nodes of this.active.values()) this.cleanupNodes(nodes)
    this.active.clear()
    this.sounds.clear()
    this.noiseBuffers.clear()
    this.binauralBuffers.clear()
    void this.ctx.close()
  }

  private renderAndCacheNoise(color: NoiseColor): EngineAudioBuffer {
    const cached = this.noiseBuffers.get(color)
    if (cached) return cached
    const seconds = NOISE_BUFFER_SECONDS[color] ?? NOISE_SECONDS
    const buffer = renderNoiseBuffer(this.ctx, color, this.ctx.sampleRate, seconds)
    this.noiseBuffers.set(color, buffer)
    return buffer
  }

  private renderAndCacheBinaural(carrierHz: number, beatHz: number): EngineAudioBuffer {
    const key = `${carrierHz}:${beatHz}`
    const cached = this.binauralBuffers.get(key)
    if (cached) return cached
    const buffer = renderBinauralBuffer(this.ctx, carrierHz, beatHz, this.ctx.sampleRate, BINAURAL_SECONDS)
    this.binauralBuffers.set(key, buffer)
    return buffer
  }

  private buildSpatialNode(quality: PanQuality): EnginePannerNode | EngineStereoPannerNode {
    if (quality === 'stereo') return this.ctx.createStereoPanner()
    const panner = this.ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = REF_DISTANCE
    panner.maxDistance = MAX_DISTANCE
    panner.rolloffFactor = 1
    return panner
  }

  /**
   * GainNode carries user trim always. In HRTF mode the PannerNode itself does radius->distance
   * attenuation physically; in stereo fallback (and always for panBypass, which has no Panner at
   * all) that attenuation has to be computed here instead via fallbackGain. On top of that,
   * `orbit.volumeCurve` (E3 §1) layers an optional angle-based modulation — independent of
   * spatial mode, so it applies the same way to bypass (binaural) placements too.
   */
  private computeGain(placement: Placement, quality: PanQuality, panBypass: boolean, suppressCurve = false): number {
    if (placement.muted) return 0
    const base = quality === 'stereo' || panBypass ? placement.volume * fallbackGain(placement.radius) : placement.volume
    const curve = placement.orbit.volumeCurve
    if (suppressCurve || !curve || curve.depth <= 0) return base
    const depth = Math.min(1, Math.max(0, curve.depth))
    const phase = curve.phase ?? 0
    const mod = 1 - depth / 2 + (depth / 2) * Math.cos(placement.angle - phase)
    return base * mod
  }

  private applySpatial(nodes: PlacementNodes, placement: Placement, force: boolean): void {
    const now = this.ctx.currentTime
    if (!force && !shouldApplyRamp(nodes.lastRampAt, now)) return
    nodes.lastRampAt = now
    const rampAt = now + RAMP_SEC
    if (nodes.quality === 'hrtf') {
      const panner = nodes.spatial as EnginePannerNode
      const { x, z } = angleToPosition(placement.angle, placement.radius)
      panner.positionX.linearRampToValueAtTime(x, rampAt)
      panner.positionZ.linearRampToValueAtTime(z, rampAt)
    } else {
      const stereo = nodes.spatial as EngineStereoPannerNode
      stereo.pan.linearRampToValueAtTime(fallbackPan(placement.angle), rampAt)
    }
  }

  private cleanupNodes(nodes: PlacementNodes): void {
    try {
      nodes.source.stop()
    } catch {
      // already stopped/never started — nothing further to clean up on the source
    }
    nodes.source.disconnect()
    nodes.spatial?.disconnect()
    nodes.gain.disconnect()
  }
}
