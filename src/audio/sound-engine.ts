// SoundEngine — the Web Audio mixer engine. Framework-independent (no React/store imports).
// Public API contract: docs/design/audio-engine.md §7.
//
// Per-placement node chain: source -> spatial (Panner[HRTF] | StereoPanner) -> gain -> [tone] -> [vary] -> master -> night -> intro -> wake -> bedtime -> limiter -> cap -> destination.
// `master` is the user's volume; `night` belongs to the sleep timer alone, so a volume tweak (a raw
// `.value` write, or fadeTo's cancelScheduledValues) can never cancel the scheduled sleep fade.
// `intro` likewise belongs to the start fade-in alone, and `wake` to the alarm's crossfade (one
// AudioParam per scheduler). `bedtime` holds the mix silent until a scheduled start. The alarm sound
// itself bypasses all of these: alarm -> alarmGain -> limiter. `cap` is the user's volume ceiling, after
// the limiter, so it bounds the summed output (every layer and the alarm together), not each layer.
import type { NoiseColor, Placement, Sound } from '../data/types'
import { renderBinauralBuffer } from './binaural'
import { fadeTo } from './fade'
import { createAudioBufferLoader } from './loader'
import { NOISE_BUFFER_SECONDS, renderNoiseBuffer } from './noise'
import { MAX_DISTANCE, RAMP_SEC, REF_DISTANCE, angleToPosition, fallbackGain, fallbackPan, shouldApplyRamp } from './spatial'
import type {
  EngineAudioBuffer,
  EngineAudioContext,
  EngineBiquadFilterNode,
  EngineBufferSourceNode,
  EngineDynamicsCompressorNode,
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
// Rendered buffers are uncompressed float32 (48kHz mono = 192KB/s), and the sound-quality pass
// stretched the swell-driven colors to 40-72s each to kill audible looping — auditioning the whole
// catalog would otherwise pile ~91MB of noise buffers into a cache that only `dispose()` ever
// cleared. That resident cost is carried all night in the background, exactly where Android's LMK
// and iOS jetsam look first. Buffers for sounds nobody is playing are dropped once the cache grows
// past this; playing ones are never touched, so audio is unaffected.
// 24MB holds the two largest colors (womb 13.2MB + wind 11.0MB) so A/B-ing a pair of long sounds
// still hits the cache — re-rendering womb costs ~400ms of main-thread work.
const IDLE_BUFFER_BUDGET_BYTES = 24 * 1024 * 1024
const BYTES_PER_SAMPLE = 4 // float32
// cancelSleep() mid-fade: bring the night gain back without a jump.
const NIGHT_RESTORE_SEC = 0.5
// Noise tone tilt: one shelf filter that only ever cuts (never boosts), so it can't push the mix
// past the volume cap. Darker = cut the highs, brighter = cut the lows.
const TONE_MAX_CUT_DB = 12
const TONE_DARK_SHELF_HZ = 1000
const TONE_BRIGHT_SHELF_HZ = 400
// Per-sound variation: the placement's own gain gets raw per-frame writes, so the drift lives on one
// extra GainNode, pre-scheduled as a single value curve on the audio clock — no JS timer to stall
// with the screen off. Random targets every DRIFT_STEP_SEC, linearly interpolated, only ever <= 1.
const DRIFT_STEP_SEC = 30
const DRIFT_DEPTH = 0.35
// ponytail: 12h horizon, then it holds its last value — add a refill if anyone plays longer.
const DRIFT_HORIZON_SEC = 12 * 3600
// Dismissing a ringing alarm: short fade so the stop doesn't click.
const ALARM_STOP_SEC = 0.5

interface AlarmNodes {
  soundId: string
  atMs: number // wall-clock target, kept so the audio-clock schedule can be re-derived after a suspend
  fadeSec: number
  startAt: number // ctx.currentTime the alarm begins
  source: EngineBufferSourceNode
  gain: EngineGainNode
}

interface LoadedSound {
  buffer: EngineAudioBuffer
  loopStart?: number
  loopEnd?: number
  // Binaural beats bake hard L/R separation into the buffer itself — routing them through a
  // Panner/StereoPanner would collapse or reposition that separation, so they skip the spatial
  // node entirely (docs/design/audio-engine.md gap notes, E3 §6).
  panBypass?: boolean
  toneable?: boolean // synthesized noise colors only (category 'noise')
}

interface PlacementNodes {
  source: EngineBufferSourceNode
  spatial: EnginePannerNode | EngineStereoPannerNode | null
  gain: EngineGainNode
  toneable: boolean
  tone: EngineBiquadFilterNode | null // created only while placement.tone != 0
  toneCutDb: number | null // last gain written to `tone`: reading it back gives float32, never equal to the double
  vary: EngineGainNode | null // created only while placement.variation is on
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
  private readonly night: EngineGainNode
  private readonly intro: EngineGainNode
  private readonly wake: EngineGainNode
  private readonly bedtime: EngineGainNode
  private readonly cap: EngineGainNode
  private readonly limiter: EngineDynamicsCompressorNode
  private alarm?: AlarmNodes
  private alarmEndTimer?: ReturnType<typeof setTimeout>
  private bedtimeStart?: { atMs: number; startAt: number } // wall-clock target + its audio-clock time
  private startFadeSec = 0
  private fadeOutEndsAt = 0 // ctx.currentTime the last stop(id, fadeSec) finishes fading out
  private readonly loadFile: (url: string) => Promise<EngineAudioBuffer>
  private readonly sounds = new Map<string, LoadedSound>()
  private readonly noiseBuffers = new Map<NoiseColor, EngineAudioBuffer>()
  private readonly binauralBuffers = new Map<string, EngineAudioBuffer>() // keyed "carrierHz:beatHz" — presets share buffers, same as noise colors
  private readonly active = new Map<string, PlacementNodes>()
  private quality: PanQuality = 'hrtf'
  private sleepStopTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly ctx: EngineAudioContext = createDefaultAudioContext()) {
    this.master = ctx.createGain()
    this.night = ctx.createGain()
    this.intro = ctx.createGain()
    this.wake = ctx.createGain()
    this.bedtime = ctx.createGain()
    this.cap = ctx.createGain()
    // Brick-wall-ish limiter: stacking several full-scale noise layers can sum past 0 dBFS and clip.
    // Threshold sits just under full scale so normal mixes pass untouched.
    const limiter = (this.limiter = ctx.createDynamicsCompressor())
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.003
    limiter.release.value = 0.25
    this.master.connect(this.night)
    this.night.connect(this.intro)
    this.intro.connect(this.wake)
    this.wake.connect(this.bedtime)
    this.bedtime.connect(limiter)
    limiter.connect(this.cap)
    this.cap.connect(ctx.destination)
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

  isRunning(): boolean {
    return this.ctx.state === 'running'
  }

  /** Load a catalog sound (fetch+decode for files, cached buffer for synth/binaural). Idempotent. */
  async load(sound: Sound): Promise<void> {
    const cached = this.sounds.get(sound.id)
    if (cached) {
      // Re-insert so Map iteration order stays least-recently-used-first for releaseIdleBuffers().
      this.sounds.delete(sound.id)
      this.sounds.set(sound.id, cached)
      return
    }
    if (sound.source.kind === 'synth') {
      this.sounds.set(sound.id, {
        buffer: this.renderAndCacheNoise(sound.source.generator),
        toneable: sound.category === 'noise',
      })
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

    // MEDIUM-1 follow-up (v020-review.md): the fade-in ramp's own target must be curve-free —
    // otherwise the very placement being modulated could start its fade already offset by
    // whatever angle it happened to spawn at, instead of settling at its plain volume.
    // Playback starting from silence (first orb, boot restore, waking after the sleep timer, a
    // preset swap) gets the user's start fade-in on the shared intro stage. Per-placement gains
    // can't carry a long ramp — setPlacement's raw writes would cancel it.
    if (this.active.size === 0 && this.startFadeSec > 0) {
      const now = this.ctx.currentTime
      let rampFrom = now
      if (now < this.fadeOutEndsAt) {
        // Orbs still fading out (a preset swap, clear-all then a new orb) share this stage: take it
        // down with them instead of cutting them off, then fade in from there.
        fadeTo(this.intro.gain, now, 0, FADE_IN_SEC)
        rampFrom = now + FADE_IN_SEC
      } else {
        this.intro.gain.cancelScheduledValues(now)
        this.intro.gain.setValueAtTime(0, now)
      }
      this.intro.gain.linearRampToValueAtTime(1, rampFrom + this.startFadeSec)
    }

    const target = this.computeGain(placement, this.quality, panBypass, true)
    const nodes: PlacementNodes = {
      source,
      spatial,
      gain,
      toneable: loaded.toneable === true,
      tone: null,
      toneCutDb: null,
      vary: null,
      quality: this.quality,
      placement,
      lastRampAt: -Infinity,
      lastGain: target,
      panBypass,
      fadeInEndsAt: this.ctx.currentTime + FADE_IN_SEC,
    }
    this.active.set(placement.id, nodes)

    this.applyEffects(nodes, placement, true)

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
      this.fadeOutEndsAt = Math.max(this.fadeOutEndsAt, this.ctx.currentTime + fadeSec)
      setTimeout(() => this.cleanupNodes(nodes), fadeSec * 1000)
    } else {
      this.cleanupNodes(nodes)
    }
    this.releaseIdleBuffers()
  }

  /**
   * Bound the buffer cache to IDLE_BUFFER_BUDGET_BYTES by dropping the least-recently-loaded
   * sounds that aren't currently playing. Called on stop() — the moment the set of idle sounds
   * can grow, and not a latency-sensitive one (re-adding pays a re-render, removing doesn't).
   *
   * Both `sounds` and the `noiseBuffers`/`binauralBuffers` memos hold references to the same
   * buffer objects, so pruning one alone frees nothing — the memos are swept afterwards for
   * anything no longer retained. Evicting a buffer that a fading-out source still plays is safe:
   * the source node holds its own reference, so it survives until playback ends.
   */
  private releaseIdleBuffers(): void {
    const bytesOf = (buffer: EngineAudioBuffer) => buffer.length * buffer.numberOfChannels * BYTES_PER_SAMPLE
    const counted = new Set<EngineAudioBuffer>()
    let cachedBytes = 0
    for (const { buffer } of this.sounds.values()) {
      if (counted.has(buffer)) continue // two catalog sounds can share one generator's buffer
      counted.add(buffer)
      cachedBytes += bytesOf(buffer)
    }
    if (cachedBytes <= IDLE_BUFFER_BUDGET_BYTES) return

    const playing = new Set<string>()
    for (const nodes of this.active.values()) playing.add(nodes.placement.soundId)
    if (this.alarm) playing.add(this.alarm.soundId) // a re-derived alarm schedule needs its buffer
    for (const [id, loaded] of this.sounds) {
      if (cachedBytes <= IDLE_BUFFER_BUDGET_BYTES) break
      if (playing.has(id)) continue
      this.sounds.delete(id)
      cachedBytes -= bytesOf(loaded.buffer)
    }

    const retained = new Set<EngineAudioBuffer>()
    for (const { buffer } of this.sounds.values()) retained.add(buffer)
    for (const [color, buffer] of this.noiseBuffers) if (!retained.has(buffer)) this.noiseBuffers.delete(color)
    for (const [key, buffer] of this.binauralBuffers) if (!retained.has(buffer)) this.binauralBuffers.delete(key)
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
    this.applyEffects(nodes, placement)
  }

  /**
   * Optional per-placement nodes after `gain` (so setPanQuality's source->spatial rewiring never
   * sees them). Created lazily and only touched when something changed — setPlacement runs every
   * animation frame while an orb orbits.
   */
  private applyEffects(nodes: PlacementNodes, placement: Placement, rewire = false): void {
    const tone = nodes.toneable ? Math.min(1, Math.max(-1, placement.tone ?? 0)) : 0
    if (tone !== 0 && !nodes.tone) {
      nodes.tone = this.ctx.createBiquadFilter()
      nodes.toneCutDb = null
      rewire = true
    } else if (tone === 0 && nodes.tone) {
      nodes.tone.disconnect()
      nodes.tone = null
      rewire = true
    }
    if (nodes.tone) {
      const type: BiquadFilterType = tone < 0 ? 'highshelf' : 'lowshelf'
      const cutDb = -Math.abs(tone) * TONE_MAX_CUT_DB
      if (nodes.tone.type !== type) {
        nodes.tone.type = type
        nodes.tone.frequency.value = tone < 0 ? TONE_DARK_SHELF_HZ : TONE_BRIGHT_SHELF_HZ
      }
      if (nodes.toneCutDb !== cutDb) {
        nodes.tone.gain.value = cutDb
        nodes.toneCutDb = cutDb
      }
    }
    if (placement.variation && !nodes.vary) {
      nodes.vary = this.ctx.createGain()
      this.scheduleDrift(nodes.vary)
      rewire = true
    } else if (!placement.variation && nodes.vary) {
      nodes.vary.disconnect()
      nodes.vary = null
      rewire = true
    }
    if (!rewire) return
    nodes.gain.disconnect()
    nodes.tone?.disconnect()
    const chain = [nodes.gain, nodes.tone, nodes.vary].filter((n) => n !== null)
    chain.forEach((node, i) => node.connect(chain[i + 1] ?? this.master))
  }

  /** Fade-in length (seconds) applied when playback starts from silence. 0 = off. */
  setStartFade(sec: number): void {
    this.startFadeSec = Math.max(0, sec)
  }

  setMasterVolume(v: number): void {
    this.master.gain.value = Math.min(1, Math.max(0, v))
  }

  /**
   * Ceiling on everything this engine outputs (0..1), on the `cap` stage after the limiter: the
   * limiter keeps the summed layers (and the alarm) under full scale, so scaling its output bounds
   * the total, however many layers are stacked. Independent of the user's volume on `master`.
   */
  setVolumeCap(cap: number): void {
    this.cap.gain.value = Math.min(1, Math.max(0, cap))
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

  /**
   * duration 초 뒤 정지, 마지막 fadeSec 동안 페이드아웃. The fade is AudioParam automation on the
   * night gain, so it runs on the audio clock even if a backgrounded WebView throttles JS timers.
   * Only the final stop+suspend (a teardown, not audible) still rides a JS timer.
   */
  scheduleSleep(durationSec: number, fadeSec: number): void {
    this.cancelSleep()
    const now = this.ctx.currentTime
    const end = now + Math.max(0, durationSec)
    const fadeStart = Math.max(end - Math.min(fadeSec, durationSec), now + NIGHT_RESTORE_SEC)
    this.night.gain.setValueAtTime(1, fadeStart)
    this.night.gain.linearRampToValueAtTime(0, Math.max(end, fadeStart))
    this.sleepStopTimer = setTimeout(() => {
      this.sleepStopTimer = undefined
      for (const id of [...this.active.keys()]) this.stop(id)
      // Nothing is playing any more, so the jump back to 1 is silent — and the next sound after
      // the timer (store.addPlacement → onEnterForeground resume) isn't stuck at zero.
      this.resetNight(0)
      // A suspended context has a frozen clock, so an armed alarm would never fire: keep it
      // running (silent — every source is gone) until the alarm does.
      if (!this.alarm && !this.isStartPending()) void this.ctx.suspend()
    }, durationSec * 1000)
  }

  cancelSleep(): void {
    clearTimeout(this.sleepStopTimer)
    this.sleepStopTimer = undefined
    this.resetNight(NIGHT_RESTORE_SEC)
  }

  /**
   * Bedtime start at wall-clock `atMs`: the mix is held silent on the `bedtime` stage (sources keep
   * running, which also keeps the context — and the start — alive), then fades in on the audio
   * clock over the start fade-in length (or the short click guard). Only works while the app runs.
   */
  scheduleStart(atMs: number): void {
    const now = this.ctx.currentTime
    const holdFrom = now + NIGHT_RESTORE_SEC
    const startAt = Math.max(holdFrom, now + (atMs - Date.now()) / 1000)
    const gain = this.bedtime.gain
    fadeTo(gain, now, 0, NIGHT_RESTORE_SEC) // a mix already playing goes quiet without a click
    gain.setValueAtTime(0, startAt)
    gain.linearRampToValueAtTime(1, startAt + Math.max(this.startFadeSec, FADE_IN_SEC))
    this.bedtimeStart = { atMs, startAt }
  }

  /** Drop a pending bedtime start: the mix becomes audible now. */
  cancelStart(): void {
    if (!this.bedtimeStart) return
    this.bedtimeStart = undefined
    fadeTo(this.bedtime.gain, this.ctx.currentTime, 1, NIGHT_RESTORE_SEC)
  }

  private isStartPending(): boolean {
    return !!this.bedtimeStart && this.ctx.currentTime < this.bedtimeStart.startAt
  }

  /**
   * Wake alarm at wall-clock `atMs`: the sound fades in over fadeSec on the audio clock while the
   * mix crossfades out on the `wake` stage (instead of being cut). Once the crossfade is done the
   * mix's sources are torn down, same as a finished sleep timer. Rings (loops) until cancelAlarm().
   * Requires load() of the sound first. Only works while the app — and so the context — runs.
   */
  scheduleAlarm(soundId: string, atMs: number, fadeSec: number): void {
    const loaded = this.sounds.get(soundId)
    if (!loaded) throw new Error(`SoundEngine.scheduleAlarm: sound "${soundId}" is not loaded — call load() first`)
    this.disarmAlarm()

    const now = this.ctx.currentTime
    const startAt = now + Math.max(0, (atMs - Date.now()) / 1000)
    const endAt = startAt + Math.max(0, fadeSec)
    const source = this.ctx.createBufferSource()
    source.buffer = loaded.buffer
    source.loop = true
    if (loaded.loopStart !== undefined) source.loopStart = loaded.loopStart
    if (loaded.loopEnd !== undefined) source.loopEnd = loaded.loopEnd
    const gain = this.ctx.createGain()
    source.connect(gain)
    gain.connect(this.limiter)
    gain.gain.value = 0
    gain.gain.setValueAtTime(0, startAt) // anchor: without it the ramp would start at arm time
    gain.gain.linearRampToValueAtTime(1, endAt) // capped downstream, on the `cap` stage
    source.start(startAt)

    this.wake.gain.cancelScheduledValues(now)
    this.wake.gain.setValueAtTime(1, startAt)
    this.wake.gain.linearRampToValueAtTime(0, endAt)

    this.alarm = { soundId, atMs, fadeSec, startAt, source, gain }
    this.alarmEndTimer = setTimeout(() => this.endMixForAlarm(), (endAt - now) * 1000)
  }

  /** Disarm a pending alarm (the mix plays on), or dismiss a ringing one (everything goes quiet).
   * Returns whether it had already started — the audio clock, not a JS timer, is the truth here. */
  cancelAlarm(): boolean {
    const alarm = this.alarm
    if (!alarm) return false
    const ringing = this.ctx.currentTime >= alarm.startAt
    this.disarmAlarm(ALARM_STOP_SEC)
    if (ringing) this.endMixForAlarm()
    else fadeTo(this.wake.gain, this.ctx.currentTime, 1, NIGHT_RESTORE_SEC)
    return ringing
  }

  private disarmAlarm(fadeSec = 0): void {
    clearTimeout(this.alarmEndTimer)
    this.alarmEndTimer = undefined
    const alarm = this.alarm
    if (!alarm) return
    this.alarm = undefined
    const teardown = () => {
      try {
        alarm.source.stop()
      } catch {
        // never started — nothing to stop
      }
      alarm.source.disconnect()
      alarm.gain.disconnect()
    }
    if (fadeSec > 0) {
      fadeTo(alarm.gain.gain, this.ctx.currentTime, 0, fadeSec)
      setTimeout(teardown, fadeSec * 1000)
    } else {
      teardown()
    }
  }

  /** The alarm has taken over: drop the (now silent) mix and any sleep timer still pending. */
  private endMixForAlarm(): void {
    clearTimeout(this.alarmEndTimer)
    this.alarmEndTimer = undefined
    clearTimeout(this.sleepStopTimer)
    this.sleepStopTimer = undefined
    for (const id of [...this.active.keys()]) this.stop(id)
    this.resetNight(0)
    fadeTo(this.wake.gain, this.ctx.currentTime, 1, 0) // silent: nothing is routed through it now
  }

  private resetNight(durationSec: number): void {
    fadeTo(this.night.gain, this.ctx.currentTime, 1, durationSec)
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
    if (this.ctx.state !== 'suspended') return
    void this.ctx.resume().then(() => {
      // The audio clock stood still while suspended, so a not-yet-started alarm's schedule is now
      // late by however long that was — re-derive it from the wall-clock target.
      const alarm = this.alarm
      if (alarm && this.ctx.currentTime < alarm.startAt) this.scheduleAlarm(alarm.soundId, alarm.atMs, alarm.fadeSec)
      const start = this.bedtimeStart // same for a pending bedtime start
      if (start && this.ctx.currentTime < start.startAt) this.scheduleStart(start.atMs)
    })
  }

  dispose(): void {
    this.cancelSleep()
    this.disarmAlarm()
    this.bedtimeStart = undefined
    for (const nodes of this.active.values()) this.cleanupNodes(nodes)
    this.active.clear()
    this.sounds.clear()
    this.noiseBuffers.clear()
    this.binauralBuffers.clear()
    void this.ctx.close()
  }

  private scheduleDrift(vary: EngineGainNode): void {
    const points = new Float32Array(Math.floor(DRIFT_HORIZON_SEC / DRIFT_STEP_SEC) + 1)
    points[0] = 1 // start where an un-drifted chain is, so switching it on doesn't jump
    for (let i = 1; i < points.length; i++) points[i] = 1 - Math.random() * DRIFT_DEPTH
    vary.gain.setValueCurveAtTime(points, this.ctx.currentTime, DRIFT_HORIZON_SEC)
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
    nodes.tone?.disconnect()
    nodes.vary?.disconnect()
  }
}
