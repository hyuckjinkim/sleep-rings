// SoundEngine — the Web Audio mixer engine. Framework-independent (no React/store imports).
// Public API contract: docs/design/audio-engine.md §7.
//
// Per-placement node chain: source -> spatial (Panner[HRTF] | StereoPanner) -> gain -> master -> destination.
import type { NoiseColor, Placement, Sound } from '../data/types'
import { fadeTo } from './fade'
import { createAudioBufferLoader } from './loader'
import { renderNoiseBuffer } from './noise'
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
const NOISE_COLORS: readonly NoiseColor[] = ['white', 'pink', 'brown', 'green']

interface LoadedSound {
  buffer: EngineAudioBuffer
  loopStart?: number
  loopEnd?: number
}

interface PlacementNodes {
  source: EngineBufferSourceNode
  spatial: EnginePannerNode | EngineStereoPannerNode
  gain: EngineGainNode
  quality: PanQuality
  placement: Placement
  lastRampAt: number
}

function createDefaultAudioContext(): EngineAudioContext {
  return new AudioContext() as unknown as EngineAudioContext
}

export class SoundEngine {
  private readonly master: EngineGainNode
  private readonly loadFile: (url: string) => Promise<EngineAudioBuffer>
  private readonly sounds = new Map<string, LoadedSound>()
  private readonly noiseBuffers = new Map<NoiseColor, EngineAudioBuffer>()
  private readonly active = new Map<string, PlacementNodes>()
  private quality: PanQuality = 'hrtf'
  private sleepFadeTimer?: ReturnType<typeof setTimeout>
  private sleepStopTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly ctx: EngineAudioContext = createDefaultAudioContext()) {
    this.master = ctx.createGain()
    this.master.connect(ctx.destination)
    this.loadFile = createAudioBufferLoader(ctx)
  }

  /** First user gesture: resume the context + pre-render all noise color buffers. */
  async init(): Promise<void> {
    await this.ctx.resume()
    for (const color of NOISE_COLORS) this.renderAndCacheNoise(color)
  }

  /** Load a catalog sound (fetch+decode for files, cached buffer for synth noise). Idempotent. */
  async load(sound: Sound): Promise<void> {
    if (this.sounds.has(sound.id)) return
    if (sound.source.kind === 'synth') {
      this.sounds.set(sound.id, { buffer: this.renderAndCacheNoise(sound.source.generator) })
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

    const spatial = this.buildSpatialNode(this.quality)
    const gain = this.ctx.createGain()
    source.connect(spatial)
    spatial.connect(gain)
    gain.connect(this.master)

    const nodes: PlacementNodes = { source, spatial, gain, quality: this.quality, placement, lastRampAt: -Infinity }
    this.active.set(placement.id, nodes)

    gain.gain.value = this.computeGain(placement, this.quality)
    this.applySpatial(nodes, placement, true)

    source.start()
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
    nodes.gain.gain.value = this.computeGain(placement, nodes.quality)
    if (!placement.locked) this.applySpatial(nodes, placement, false)
  }

  setMasterVolume(v: number): void {
    this.master.gain.value = Math.min(1, Math.max(0, v))
  }

  /** Switch panning quality at runtime, rewiring every active chain's spatial node in place. */
  setPanQuality(q: PanQuality): void {
    if (q === this.quality) return
    this.quality = q
    for (const nodes of this.active.values()) {
      nodes.source.disconnect()
      nodes.spatial.disconnect()

      const spatial = this.buildSpatialNode(q)
      nodes.source.connect(spatial)
      spatial.connect(nodes.gain)

      nodes.spatial = spatial
      nodes.quality = q
      nodes.lastRampAt = -Infinity
      nodes.gain.gain.value = this.computeGain(nodes.placement, q)
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
    void this.ctx.close()
  }

  private renderAndCacheNoise(color: NoiseColor): EngineAudioBuffer {
    const cached = this.noiseBuffers.get(color)
    if (cached) return cached
    const buffer = renderNoiseBuffer(this.ctx, color, this.ctx.sampleRate, NOISE_SECONDS)
    this.noiseBuffers.set(color, buffer)
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

  /** GainNode carries user trim always; in stereo fallback it also carries radius distance attenuation. */
  private computeGain(placement: Placement, quality: PanQuality): number {
    if (placement.muted) return 0
    return quality === 'stereo' ? placement.volume * fallbackGain(placement.radius) : placement.volume
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
    nodes.spatial.disconnect()
    nodes.gain.disconnect()
  }
}
