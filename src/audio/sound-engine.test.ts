import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Placement, Sound } from '../data/types'
import { FADE_IN_SEC, SoundEngine } from './sound-engine'
import { THROTTLE_SEC } from './spatial'
import { createMockAudioContext } from './test-support/mock-audio-context'
import type { EngineAudioContext } from './web-audio-types'

const NOISE_SOUND: Sound = {
  id: 'pink-noise',
  name: { ko: '핑크 노이즈', en: 'Pink Noise' },
  category: 'noise',
  source: { kind: 'synth', generator: 'pink' },
  license: { spdx: 'no-license-required', sourceName: 'synth' },
}

const FILE_SOUND: Sound = {
  id: 'garden-rain',
  name: { ko: '정원의 비', en: 'Garden Rain' },
  category: 'rain',
  source: { kind: 'file', src: 'sounds/garden-rain.m4a', loopStart: 0.12, loopEnd: 30.4 },
  license: { spdx: 'CC0-1.0', sourceName: 'Freesound' },
}

const BINAURAL_SOUND: Sound = {
  id: 'binaural-delta',
  name: { ko: '바이노럴 델타', en: 'Binaural Delta' },
  category: 'binaural',
  source: { kind: 'binaural', carrierHz: 200, beatHz: 2 },
  license: { spdx: 'no-license-required', sourceName: 'synth' },
}

// master, night, intro, wake, bedtime — created by the constructor before any placement gain.
const GLOBAL_GAINS = 5

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'p1',
    soundId: 'pink-noise',
    radius: 0,
    angle: 0,
    orbit: { mode: 'fixed', shape: { kind: 'circle' }, speed: 0, direction: 1 },
    locked: false,
    volume: 1,
    ...overrides,
  }
}

describe('SoundEngine', () => {
  let ctx: EngineAudioContext
  let engine: SoundEngine

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(8) })),
    )
    ctx = createMockAudioContext()
    engine = new SoundEngine(ctx)
  })

  it('init() only resumes the context — buffers are rendered on demand, not up front', async () => {
    await engine.init()
    expect(ctx.resume).toHaveBeenCalled()
    // v0.3.1 (review H3): the eager pre-render was ~8.9M samples of filtering on the main thread
    // before the first sound could play, and it rendered colors the user may never touch.
    // load() caches per color instead, so init() must allocate nothing.
    expect(ctx.createBuffer).not.toHaveBeenCalled()
  })

  it('load() is idempotent for synth sounds (does not re-render the buffer)', async () => {
    await engine.load(NOISE_SOUND)
    await engine.load(NOISE_SOUND)
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1)
  })

  it('load() fetches and decodes file sounds, then caches by sound id', async () => {
    await engine.load(FILE_SOUND)
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1)
    await engine.load(FILE_SOUND)
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1)
  })

  it('play() throws if the sound was never loaded', () => {
    expect(() => engine.play(placement())).toThrow(/not loaded/)
  })

  it('play() builds a node chain, starts the source, and is a no-op if called again for the same placement', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    engine.play(placement())
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1)
    const source = vi.mocked(ctx.createBufferSource).mock.results[0].value
    expect(source.start).toHaveBeenCalledTimes(1)
  })

  it('play() reflects radius/angle/volume in inspect() (HRTF quality)', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement({ radius: 0.5, angle: Math.PI / 2, volume: 0.6 }))
    const result = engine.inspect('p1')
    expect(result).not.toBeNull()
    expect(result!.gain).toBeCloseTo(0.6)
    expect(result!.pan.x).toBeGreaterThan(0) // panned right
  })

  it('setPlacement() updates gain and position while playing', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement({ volume: 1, radius: 0 }))
    ctx.currentTime += THROTTLE_SEC // past the ramp-throttle window since play()
    engine.setPlacement(placement({ volume: 0.2, radius: 1, angle: Math.PI }))
    const result = engine.inspect('p1')
    expect(result!.gain).toBeCloseTo(0.2)
    expect(result!.pan.z).toBeGreaterThan(0) // behind
  })

  it('setPlacement() does not touch gain.value when the computed gain is unchanged (MEDIUM-1 regression)', async () => {
    // OrbitField calls setPlacement every rAF frame while a placement orbits (angle changes,
    // gain doesn't). A raw `.value =` write on every frame would cancel play()'s fade-in ramp
    // (and any future fade) the instant the first frame lands — this must not happen.
    await engine.load(NOISE_SOUND)
    engine.play(placement({ volume: 1 }))

    const gainNode = vi.mocked(ctx.createGain).mock.results[GLOBAL_GAINS].value
    let writes = 0
    const current = gainNode.gain.value
    Object.defineProperty(gainNode.gain, 'value', {
      get: () => current,
      set: () => {
        writes++
      },
    })

    engine.setPlacement(placement({ volume: 1 })) // same gain as play() computed
    expect(writes).toBe(0)

    engine.setPlacement(placement({ volume: 0.5 })) // an actual change still writes
    expect(writes).toBe(1)
  })

  it('setPlacement() with muted:true silences gain', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    engine.setPlacement(placement({ muted: true }))
    expect(engine.inspect('p1')!.gain).toBe(0)
  })

  it('setPlacement() skips position updates when locked, but still applies gain', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement({ radius: 0, angle: 0, volume: 1 }))
    const before = engine.inspect('p1')!.pan
    ctx.currentTime += THROTTLE_SEC // past the throttle window, so only `locked` explains no movement
    engine.setPlacement(placement({ radius: 1, angle: Math.PI, volume: 0.5, locked: true }))
    const after = engine.inspect('p1')!
    expect(after.pan).toEqual(before)
    expect(after.gain).toBeCloseTo(0.5)
  })

  it('setPlacement() is a no-op for a placement that is not playing', async () => {
    await engine.load(NOISE_SOUND)
    expect(() => engine.setPlacement(placement())).not.toThrow()
    expect(engine.inspect('p1')).toBeNull()
  })

  it('stop() with no fade tears down the chain immediately', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    const source = vi.mocked(ctx.createBufferSource).mock.results[0].value
    engine.stop('p1')
    expect(engine.inspect('p1')).toBeNull()
    expect(source.stop).toHaveBeenCalled()
    expect(source.disconnect).toHaveBeenCalled()
  })

  it('stop() with a fade ramps gain to 0 immediately and cleans up the source after the delay', async () => {
    vi.useFakeTimers()
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    const source = vi.mocked(ctx.createBufferSource).mock.results[0].value
    engine.stop('p1', 2)
    expect(engine.inspect('p1')).toBeNull() // removed from active immediately
    expect(source.stop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(source.stop).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('setPanQuality() rewires active chains and switches the inspect() pan shape', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement({ angle: Math.PI / 2, radius: 0.5 }))
    engine.setPanQuality('stereo')
    expect(ctx.createStereoPanner).toHaveBeenCalledTimes(1)
    const result = engine.inspect('p1')!
    expect(result.pan.z).toBe(0) // stereo fallback has no front/back
    expect(result.pan.x).toBeCloseTo(1) // sin(pi/2)
  })

  it('setPanQuality() to the same quality is a no-op', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    engine.setPanQuality('hrtf')
    expect(ctx.createPanner).toHaveBeenCalledTimes(1) // only the initial play()
  })

  it('setMasterVolume() clamps into [0, 1]', () => {
    // The engine's own master gain is the first node it builds, so the mock's first createGain
    // result IS that node — reading it back is what actually proves the clamp. (This used to
    // assert only "doesn't throw", which passes just as happily with the clamp deleted.)
    const master = (ctx.createGain as unknown as { mock: { results: { value: { gain: { value: number } } }[] } })
      .mock.results[0].value
    engine.setMasterVolume(2)
    expect(master.gain.value).toBe(1)
    engine.setMasterVolume(-1)
    expect(master.gain.value).toBe(0)
    engine.setMasterVolume(0.5)
    expect(master.gain.value).toBe(0.5)
  })

  // createGain order in the constructor: [0] master, [1] night, [2] intro, [3] wake, [4] bedtime — placement gains come after.
  function gainNode(index: number) {
    return vi.mocked(ctx.createGain).mock.results[index].value
  }

  it('wires master -> night -> intro -> wake -> bedtime -> limiter -> destination with conservative limiter settings', () => {
    const master = gainNode(0)
    const night = gainNode(1)
    const intro = gainNode(2)
    const wake = gainNode(3)
    const bedtime = gainNode(4)
    const limiter = vi.mocked(ctx.createDynamicsCompressor).mock.results[0].value
    expect(master.connect).toHaveBeenCalledWith(night)
    expect(night.connect).toHaveBeenCalledWith(intro)
    expect(intro.connect).toHaveBeenCalledWith(wake)
    expect(wake.connect).toHaveBeenCalledWith(bedtime)
    expect(bedtime.connect).toHaveBeenCalledWith(limiter)
    expect(limiter.connect).toHaveBeenCalledWith(ctx.destination)
    expect(limiter.threshold.value).toBe(-3)
    expect(limiter.ratio.value).toBe(20)
    expect(limiter.attack.value).toBeLessThanOrEqual(0.005)
  })

  it('scheduleSleep() schedules the fade on the night gain at audio-clock time, not via a JS timer', () => {
    vi.useFakeTimers()
    ctx.currentTime = 100
    const night = gainNode(1).gain
    engine.scheduleSleep(600, 60)
    expect(night.setValueAtTime).toHaveBeenLastCalledWith(1, 640) // hold full until duration-fade
    expect(night.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 700) // silent exactly at duration
    vi.useRealTimers()
  })

  it('scheduleSleep() with fade longer than duration fades over the whole duration', () => {
    ctx.currentTime = 10
    const night = gainNode(1).gain
    engine.scheduleSleep(30, 60)
    expect(night.setValueAtTime).toHaveBeenLastCalledWith(1, 10.5) // after the cancel-restore ramp
    expect(night.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 40)
  })

  it('setMasterVolume() after scheduleSleep() never touches the night gain automation', () => {
    const night = gainNode(1).gain
    engine.scheduleSleep(600, 60)
    vi.mocked(night.cancelScheduledValues).mockClear()
    vi.mocked(night.setValueAtTime).mockClear()
    vi.mocked(night.linearRampToValueAtTime).mockClear()
    engine.setMasterVolume(0.3)
    expect(night.cancelScheduledValues).not.toHaveBeenCalled()
    expect(night.setValueAtTime).not.toHaveBeenCalled()
    expect(night.linearRampToValueAtTime).not.toHaveBeenCalled()
  })

  it('scheduleSleep() stops+suspends at duration and resets the night gain so later sounds are audible', async () => {
    vi.useFakeTimers()
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    const night = gainNode(1).gain

    engine.scheduleSleep(10, 2)
    vi.advanceTimersByTime(9999)
    expect(engine.inspect('p1')).not.toBeNull()
    expect(ctx.suspend).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(ctx.suspend).toHaveBeenCalled()
    expect(engine.inspect('p1')).toBeNull()
    expect(night.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, expect.any(Number))
    expect(night.value).toBe(1)
    vi.useRealTimers()
  })

  it('cancelSleep() clears the stop timer and ramps the night gain back to 1', async () => {
    vi.useFakeTimers()
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    const night = gainNode(1).gain
    engine.scheduleSleep(10, 2)
    ctx.currentTime = 9 // mid-fade
    vi.mocked(night.cancelScheduledValues).mockClear()
    engine.cancelSleep()
    expect(night.cancelScheduledValues).toHaveBeenCalledWith(9)
    expect(night.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 9.5)
    vi.advanceTimersByTime(10000)
    expect(ctx.suspend).not.toHaveBeenCalled()
    expect(engine.inspect('p1')).not.toBeNull()
    vi.useRealTimers()
  })

  it('start fade-in ramps the intro stage when playback starts from silence, not for later orbs', async () => {
    await engine.load(NOISE_SOUND)
    const intro = gainNode(2).gain
    engine.setStartFade(30)
    ctx.currentTime = 5
    engine.play(placement({ id: 'a' }))
    expect(intro.setValueAtTime).toHaveBeenLastCalledWith(0, 5)
    expect(intro.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 35)

    vi.mocked(intro.linearRampToValueAtTime).mockClear()
    engine.play(placement({ id: 'b' }))
    expect(intro.linearRampToValueAtTime).not.toHaveBeenCalled() // already audible — no re-fade
  })

  it('start fade-in off (default) leaves the intro stage untouched', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    expect(gainNode(2).gain.linearRampToValueAtTime).not.toHaveBeenCalled()
  })

  it('a sleep-timer reset never cancels the start fade-in (separate stages)', async () => {
    await engine.load(NOISE_SOUND)
    const intro = gainNode(2).gain
    engine.setStartFade(60)
    engine.play(placement())
    engine.scheduleSleep(600, 60)
    engine.cancelSleep()
    expect(intro.cancelScheduledValues).toHaveBeenCalledTimes(1) // only play()'s own
  })

  describe('noise tone (cut-only shelf after the placement gain)', () => {
    const filter = (i = 0) => vi.mocked(ctx.createBiquadFilter).mock.results[i].value
    const master = () => gainNode(0)
    const pGain = () => gainNode(GLOBAL_GAINS)

    it('no tone: no filter node at all, gain goes straight to master', async () => {
      await engine.load(NOISE_SOUND)
      engine.play(placement())
      expect(ctx.createBiquadFilter).not.toHaveBeenCalled()
      expect(pGain().connect).toHaveBeenLastCalledWith(master())
    })

    it('darker cuts the highs, brighter cuts the lows — never a boost', async () => {
      await engine.load(NOISE_SOUND)
      engine.play(placement({ tone: -0.5 }))
      expect(pGain().connect).toHaveBeenLastCalledWith(filter())
      expect(filter().connect).toHaveBeenLastCalledWith(master())
      expect(filter().type).toBe('highshelf')
      expect(filter().gain.value).toBe(-6)

      engine.setPlacement(placement({ tone: 1 }))
      expect(filter().type).toBe('lowshelf')
      expect(filter().gain.value).toBe(-12)
      engine.setPlacement(placement({ tone: 5 })) // clamped
      expect(filter().gain.value).toBeLessThanOrEqual(0)
    })

    it('back to 0 removes the filter and rewires gain -> master', async () => {
      await engine.load(NOISE_SOUND)
      engine.play(placement({ tone: 0.3 }))
      engine.setPlacement(placement({ tone: 0 }))
      expect(filter().disconnect).toHaveBeenCalled()
      expect(pGain().connect).toHaveBeenLastCalledWith(master())
    })

    it('a per-frame setPlacement with an unchanged tone never touches the filter', async () => {
      await engine.load(NOISE_SOUND)
      engine.play(placement({ tone: -0.5 }))
      const f = filter()
      const gainDescriptor = vi.fn()
      Object.defineProperty(f.gain, 'value', { get: () => -6, set: gainDescriptor })
      for (let i = 0; i < 5; i++) engine.setPlacement(placement({ tone: -0.5, angle: i }))
      expect(gainDescriptor).not.toHaveBeenCalled()
      expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(1)
    })

    it('ignores tone on non-noise sounds', async () => {
      await engine.load({ ...NOISE_SOUND, id: 'rainy', category: 'rain' })
      engine.play(placement({ soundId: 'rainy', tone: -1 }))
      expect(ctx.createBiquadFilter).not.toHaveBeenCalled()
    })

    it('stop() tears the filter down with the rest of the chain', async () => {
      await engine.load(NOISE_SOUND)
      engine.play(placement({ tone: -1 }))
      engine.stop('p1')
      expect(filter().disconnect).toHaveBeenCalled()
    })
  })

  describe('per-sound variation (drift on one extra gain node)', () => {
    const master = () => gainNode(0)
    const pGain = () => gainNode(GLOBAL_GAINS)
    const vary = () => gainNode(GLOBAL_GAINS + 1)

    it('adds exactly one gain node, pre-scheduled as a single audio-clock curve that only attenuates', async () => {
      await engine.load(NOISE_SOUND)
      ctx.currentTime = 7
      engine.play(placement({ variation: true }))
      expect(ctx.createGain).toHaveBeenCalledTimes(GLOBAL_GAINS + 2)
      expect(pGain().connect).toHaveBeenLastCalledWith(vary())
      expect(vary().connect).toHaveBeenLastCalledWith(master())
      const [values, start, duration] = vi.mocked(vary().gain.setValueCurveAtTime).mock.calls[0]
      expect(start).toBe(7)
      expect(duration).toBeGreaterThanOrEqual(8 * 3600) // outlasts a night without any JS timer
      expect(values[0]).toBe(1)
      expect(Math.max(...values)).toBeLessThanOrEqual(1)
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0.6)
    })

    it('chains after the tone filter when both are on', async () => {
      await engine.load(NOISE_SOUND)
      engine.play(placement({ variation: true, tone: -0.5 }))
      const filter = vi.mocked(ctx.createBiquadFilter).mock.results[0].value
      expect(pGain().connect).toHaveBeenLastCalledWith(filter)
      expect(filter.connect).toHaveBeenLastCalledWith(vary())
      expect(vary().connect).toHaveBeenLastCalledWith(master())
    })

    it('per-frame setPlacement creates nothing new; switching off removes it and rewires to master', async () => {
      await engine.load(NOISE_SOUND)
      engine.play(placement({ variation: true }))
      for (let i = 0; i < 5; i++) engine.setPlacement(placement({ variation: true, angle: i }))
      expect(ctx.createGain).toHaveBeenCalledTimes(GLOBAL_GAINS + 2)
      expect(vary().gain.setValueCurveAtTime).toHaveBeenCalledTimes(1)
      engine.setPlacement(placement({ variation: false }))
      expect(vary().disconnect).toHaveBeenCalled()
      expect(pGain().connect).toHaveBeenLastCalledWith(master())
    })

    it('stop() tears the drift node down too', async () => {
      await engine.load(NOISE_SOUND)
      engine.play(placement({ variation: true }))
      engine.stop('p1')
      expect(vary().disconnect).toHaveBeenCalled()
    })
  })

  describe('volume cap', () => {
    // Product of every gain a placement's signal passes through, master onwards.
    function summedGain(placementGain: number): number {
      return placementGain * [0, 1, 2, 3].reduce((acc, i) => acc * gainNode(i).gain.value, 1)
    }

    it('the summed mix gain never exceeds the cap, whatever the master volume or call order', async () => {
      await engine.load(NOISE_SOUND)
      engine.play(placement({ volume: 1, radius: 0 }))
      ctx.currentTime = 10 // past the per-orb fade-in (the mock resolves ramps instantly anyway)
      const pGain = gainNode(GLOBAL_GAINS).gain.value
      for (const cap of [1, 0.75, 0.5, 0.3, 0]) {
        for (const vol of [0, 0.3, 0.9, 1, 5]) {
          engine.setVolumeCap(cap)
          engine.setMasterVolume(vol)
          expect(summedGain(pGain)).toBeLessThanOrEqual(cap + 1e-9)
          engine.setMasterVolume(vol)
          engine.setVolumeCap(cap) // boot order: restoreMix sets master after the cap
          expect(summedGain(pGain)).toBeLessThanOrEqual(cap + 1e-9)
        }
      }
    })

    it('scales master rather than replacing the user volume, so lifting the cap restores it', () => {
      engine.setMasterVolume(0.8)
      engine.setVolumeCap(0.5)
      expect(gainNode(0).gain.value).toBeCloseTo(0.4)
      engine.setVolumeCap(1)
      expect(gainNode(0).gain.value).toBeCloseTo(0.8)
    })

    it('the wake alarm (which bypasses master) peaks at the cap', async () => {
      vi.useFakeTimers()
      await engine.load(NOISE_SOUND)
      engine.setVolumeCap(0.3)
      engine.scheduleAlarm('pink-noise', Date.now() + 60_000, 120)
      const alarmGain = gainNode(GLOBAL_GAINS).gain
      expect(alarmGain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.3, expect.any(Number))
      engine.setVolumeCap(0.5) // before it rings: re-scheduled toward the new ceiling
      const rescheduled = gainNode(GLOBAL_GAINS + 1).gain
      expect(rescheduled.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.5, expect.any(Number))
      vi.useRealTimers()
    })
  })

  describe('wake alarm (audio-clock scheduled, crossfades the mix out)', () => {
    const T0 = new Date('2026-01-01T23:00:00').getTime()
    const BIRDS: Sound = { ...NOISE_SOUND, id: 'birds' } // shares the pink buffer — cheap to render

    beforeEach(async () => {
      vi.useFakeTimers()
      vi.setSystemTime(T0)
      ctx.currentTime = 100
      await engine.load(NOISE_SOUND)
      await engine.load(BIRDS)
      engine.play(placement())
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    // The alarm gain is the next gain created after the placement's own.
    const alarmGain = () => gainNode(GLOBAL_GAINS + 1).gain
    const alarmSource = () => vi.mocked(ctx.createBufferSource).mock.results[1].value

    it('starts the wake sound at the audio-clock alarm time and fades it in from there, not from arm time', () => {
      engine.scheduleAlarm('birds', T0 + 3600_000, 300)
      expect(alarmSource().start).toHaveBeenCalledWith(3700)
      expect(alarmGain().setValueAtTime).toHaveBeenCalledWith(0, 3700)
      expect(alarmGain().linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 4000)
      expect(alarmSource().connect).toHaveBeenCalledWith(gainNode(GLOBAL_GAINS + 1))
      expect(gainNode(GLOBAL_GAINS + 1).connect).toHaveBeenCalledWith(
        vi.mocked(ctx.createDynamicsCompressor).mock.results[0].value,
      )
    })

    it('crossfades the mix out on the wake stage over the same window instead of cutting it', () => {
      const wake = gainNode(3).gain
      engine.scheduleAlarm('birds', T0 + 3600_000, 300)
      expect(wake.setValueAtTime).toHaveBeenLastCalledWith(1, 3700)
      expect(wake.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 4000)
      expect(engine.inspect('p1')).not.toBeNull() // still playing until the crossfade is done
      vi.advanceTimersByTime(3900_000)
      expect(engine.inspect('p1')).toBeNull() // then torn down like a finished sleep timer
      expect(alarmSource().stop).not.toHaveBeenCalled() // the alarm keeps ringing
    })

    it('a sleep timer ending while an alarm is armed keeps the context running (no suspend)', () => {
      engine.scheduleAlarm('birds', T0 + 3600_000, 300)
      engine.scheduleSleep(600, 60)
      vi.advanceTimersByTime(600_000)
      expect(engine.inspect('p1')).toBeNull()
      expect(ctx.suspend).not.toHaveBeenCalled()
    })

    it('cancelAlarm() before it rings disarms it and leaves the mix playing', () => {
      engine.scheduleAlarm('birds', T0 + 3600_000, 300)
      expect(engine.cancelAlarm()).toBe(false)
      vi.advanceTimersByTime(4000_000)
      expect(alarmSource().stop).toHaveBeenCalled()
      expect(engine.inspect('p1')).not.toBeNull()
      expect(gainNode(3).gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, expect.any(Number))
    })

    it('cancelAlarm() while ringing fades the alarm out and leaves everything quiet', () => {
      engine.scheduleAlarm('birds', T0 + 60_000, 300)
      ctx.currentTime = 200 // past the 160s start, mid-crossfade
      expect(engine.cancelAlarm()).toBe(true)
      expect(alarmGain().linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 200.5)
      expect(engine.inspect('p1')).toBeNull()
      vi.advanceTimersByTime(1000)
      expect(alarmSource().stop).toHaveBeenCalled()
    })

    it('re-derives a pending alarm from the wall clock after the context was suspended', async () => {
      engine.scheduleAlarm('birds', T0 + 3600_000, 300)
      ctx.state = 'suspended' // clock froze at 100 while 10 minutes of wall time passed
      vi.setSystemTime(T0 + 600_000)
      engine.onEnterForeground()
      await Promise.resolve()
      await Promise.resolve()
      const rearmed = vi.mocked(ctx.createBufferSource).mock.results[2].value
      expect(rearmed.start).toHaveBeenCalledWith(100 + 3000)
      expect(alarmSource().stop).toHaveBeenCalled()
    })

    it('throws if the wake sound was never loaded', () => {
      expect(() => engine.scheduleAlarm('nope', T0, 10)).toThrow(/not loaded/)
    })
  })

  describe('bedtime start (mix held silent on the audio clock, then faded in)', () => {
    const T0 = new Date('2026-01-01T22:00:00').getTime()
    const bedtime = () => gainNode(4).gain

    beforeEach(async () => {
      vi.useFakeTimers()
      vi.setSystemTime(T0)
      ctx.currentTime = 100
      await engine.load(NOISE_SOUND)
      engine.play(placement())
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('fades the playing mix out now, holds it at 0, and ramps it in at the audio-clock start time', () => {
      engine.scheduleStart(T0 + 3600_000)
      expect(bedtime().cancelScheduledValues).toHaveBeenCalledWith(100)
      expect(bedtime().linearRampToValueAtTime).toHaveBeenCalledWith(0, 100.5)
      expect(bedtime().setValueAtTime).toHaveBeenLastCalledWith(0, 3700)
      expect(bedtime().linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 3700 + FADE_IN_SEC)
      expect(engine.inspect('p1')).not.toBeNull() // sources keep running (silently) through the hold
    })

    it('fades in over the start fade-in length when one is set', () => {
      engine.setStartFade(30)
      engine.scheduleStart(T0 + 60_000)
      expect(bedtime().linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 160 + 30)
    })

    it('a start time already passed starts right after the short hold-in ramp', () => {
      engine.scheduleStart(T0 - 5000)
      expect(bedtime().setValueAtTime).toHaveBeenLastCalledWith(0, 100.5)
    })

    it('cancelStart() brings the mix back now', () => {
      engine.scheduleStart(T0 + 3600_000)
      ctx.currentTime = 200
      engine.cancelStart()
      expect(bedtime().cancelScheduledValues).toHaveBeenLastCalledWith(200)
      expect(bedtime().linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 200.5)
    })

    it('a sleep timer ending before the start does not suspend the context', () => {
      engine.scheduleStart(T0 + 3600_000)
      engine.scheduleSleep(600, 60)
      vi.advanceTimersByTime(600_000)
      ctx.currentTime = 700
      expect(ctx.suspend).not.toHaveBeenCalled()
    })

    it('re-derives a pending start from the wall clock after the context was suspended', async () => {
      engine.scheduleStart(T0 + 3600_000)
      ctx.state = 'suspended' // clock froze at 100 while 10 minutes of wall time passed
      vi.setSystemTime(T0 + 600_000)
      engine.onEnterForeground()
      await Promise.resolve()
      await Promise.resolve()
      expect(bedtime().setValueAtTime).toHaveBeenLastCalledWith(0, 100 + 3000)
    })
  })

  it('onEnterForeground() resumes a suspended context; onEnterBackground() is a safe no-op', async () => {
    expect(() => engine.onEnterBackground()).not.toThrow()
    ctx.state = 'suspended'
    engine.onEnterForeground()
    expect(ctx.resume).toHaveBeenCalled()
  })

  it('dispose() stops all active placements and closes the context', async () => {
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    engine.dispose()
    expect(engine.inspect('p1')).toBeNull()
    expect(ctx.close).toHaveBeenCalled()
  })

  describe('orbit.volumeCurve gain modulation (E3 §1)', () => {
    it('depth=0 (or absent) behaves exactly like before regardless of angle', async () => {
      await engine.load(NOISE_SOUND)
      const orbit = { mode: 'fixed' as const, shape: { kind: 'circle' as const }, speed: 0, direction: 1 as const, volumeCurve: { depth: 0 } }
      engine.play(placement({ volume: 1, angle: 0, orbit }))
      const before = engine.inspect('p1')!.gain
      ctx.currentTime += THROTTLE_SEC
      engine.setPlacement(placement({ volume: 1, angle: Math.PI, orbit }))
      expect(engine.inspect('p1')!.gain).toBeCloseTo(before)
    })

    it('depth>0 modulates gain by angle relative to phase: full gain at phase, minimum at opposite phase', async () => {
      await engine.load(NOISE_SOUND)
      const orbit = { mode: 'fixed' as const, shape: { kind: 'circle' as const }, speed: 0, direction: 1 as const, volumeCurve: { depth: 1, phase: 0 } }
      engine.play(placement({ volume: 1, angle: 0, orbit })) // angle === phase
      const atPhase = engine.inspect('p1')!.gain
      // Past FADE_IN_SEC — the fade-in guard below only suppresses the curve during the ramp
      // itself, so this needs to clear that window to observe modulation (see the dedicated
      // fade-in-guard test for what happens *inside* the window).
      ctx.currentTime += FADE_IN_SEC
      engine.setPlacement(placement({ volume: 1, angle: Math.PI, orbit })) // opposite phase
      const atOppositePhase = engine.inspect('p1')!.gain

      expect(atPhase).toBeCloseTo(1)
      expect(atOppositePhase).toBeCloseTo(0)
    })

    it('suppresses the curve while play()\'s fade-in ramp is in flight, so it cannot fight the ramp (MEDIUM-1 follow-up)', async () => {
      await engine.load(NOISE_SOUND)
      const orbit = { mode: 'fixed' as const, shape: { kind: 'circle' as const }, speed: 0, direction: 1 as const, volumeCurve: { depth: 1, phase: 0 } }
      engine.play(placement({ volume: 1, angle: 0, orbit })) // angle === phase, so base and modulated targets coincide here
      expect(engine.inspect('p1')!.gain).toBeCloseTo(1)

      // Still inside the fade-in window. In the real app OrbitField calls setPlacement on every
      // rAF frame while orbiting — this angle would swing gain to ~0 if the curve applied here.
      ctx.currentTime += THROTTLE_SEC
      engine.setPlacement(placement({ volume: 1, angle: Math.PI, orbit })) // opposite phase
      expect(engine.inspect('p1')!.gain).toBeCloseTo(1) // curve suppressed — ramp target undisturbed

      // Past the fade-in window, modulation resumes normally.
      ctx.currentTime += FADE_IN_SEC
      engine.setPlacement(placement({ volume: 1, angle: Math.PI, orbit }))
      expect(engine.inspect('p1')!.gain).toBeCloseTo(0)
    })
  })

  describe('binaural playback bypasses the spatial (pan) node (E3 §6)', () => {
    it('load() renders a shared stereo buffer instead of fetching a file', async () => {
      await engine.load(BINAURAL_SOUND)
      expect(ctx.createBuffer).toHaveBeenCalledWith(2, expect.any(Number), expect.any(Number))
    })

    it('play() creates no Panner/StereoPanner at all', async () => {
      await engine.load(BINAURAL_SOUND)
      engine.play(placement({ soundId: 'binaural-delta', angle: Math.PI / 2, radius: 0.5 }))
      expect(ctx.createPanner).not.toHaveBeenCalled()
      expect(ctx.createStereoPanner).not.toHaveBeenCalled()
    })

    it('inspect() reports a fixed centered pan regardless of angle — hard L/R lives in the buffer, not a pan node', async () => {
      await engine.load(BINAURAL_SOUND)
      engine.play(placement({ soundId: 'binaural-delta', angle: Math.PI / 2, radius: 0 }))
      expect(engine.inspect('p1')!.pan).toEqual({ x: 0, z: 0 })
    })

    it('gain still falls off with radius even without a PannerNode to do it physically', async () => {
      await engine.load(BINAURAL_SOUND)
      engine.play(placement({ soundId: 'binaural-delta', radius: 0, volume: 1 }))
      const centerGain = engine.inspect('p1')!.gain
      engine.stop('p1')
      engine.play(placement({ soundId: 'binaural-delta', radius: 1, volume: 1 }))
      const edgeGain = engine.inspect('p1')!.gain
      expect(edgeGain).toBeLessThan(centerGain)
    })

    it('setPanQuality() does not rewire a binaural placement\'s chain', async () => {
      await engine.load(BINAURAL_SOUND)
      engine.play(placement({ soundId: 'binaural-delta' }))
      engine.setPanQuality('stereo')
      expect(ctx.createStereoPanner).not.toHaveBeenCalled()
      expect(engine.inspect('p1')!.pan).toEqual({ x: 0, z: 0 })
    })
  })

  describe('HRTF auto-downgrade past the active-placement threshold (E3 §8)', () => {
    it('stays on HRTF panning at or below the threshold (8 active placements)', async () => {
      await engine.load(NOISE_SOUND)
      for (let i = 0; i < 8; i++) engine.play(placement({ id: `p${i}`, angle: 0, radius: 0.5 }))
      // angle=0 gives a nonzero z position under HRTF (angleToPosition); stereo fallback is always z=0.
      expect(engine.inspect('p7')!.pan.z).not.toBe(0)
      expect(ctx.createStereoPanner).not.toHaveBeenCalled()
    })

    it('auto-downgrades every active chain to stereo once the threshold is exceeded (9th placement)', async () => {
      await engine.load(NOISE_SOUND)
      for (let i = 0; i < 9; i++) engine.play(placement({ id: `p${i}`, angle: 0, radius: 0.5 }))
      expect(engine.inspect('p0')!.pan.z).toBe(0) // earlier placements got rewired too, not just the new one
      expect(engine.inspect('p8')!.pan.z).toBe(0)
      expect(ctx.createStereoPanner).toHaveBeenCalledTimes(9)
    })

    it('never auto-upgrades back to HRTF once downgraded (no hysteresis)', async () => {
      await engine.load(NOISE_SOUND)
      for (let i = 0; i < 9; i++) engine.play(placement({ id: `p${i}`, angle: 0, radius: 0.5 }))
      for (let i = 0; i < 9; i++) engine.stop(`p${i}`)
      engine.play(placement({ id: 'p-new', angle: 0, radius: 0.5 }))
      expect(engine.inspect('p-new')!.pan.z).toBe(0) // still stereo, even though only 1 placement is active now
    })
  })
})


describe('idle buffer eviction keeps the cache bounded', () => {
  // Rendered buffers are uncompressed float32, and the sound-quality pass stretched the
  // swell-driven colors to 40-72s to kill audible looping — auditioning the catalog used to leave
  // ~91MB of noise buffers resident for the session, since only dispose() ever cleared them.
  // Eviction is observed through ctx.createBuffer: a re-render means the cache dropped it.
  const SR = 48000
  const synth = (id: string, generator: 'womb' | 'wind' | 'lofi'): Sound => ({
    id,
    name: { ko: id, en: id },
    category: 'noise',
    source: { kind: 'synth', generator },
    license: { spdx: 'no-license-required', sourceName: 'synth' },
  })
  // womb (72s = 13.2MB) + wind (60s = 11.0MB) = 24.2MB, just past the 24MB budget.
  const WOMB = synth('womb-sound', 'womb')
  const WIND = synth('wind-sound', 'wind')

  let ctx: EngineAudioContext
  let engine: SoundEngine

  beforeEach(() => {
    ctx = createMockAudioContext()
    engine = new SoundEngine(ctx)
  })

  function rendersOf(seconds: number): number {
    return (ctx.createBuffer as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
      (call) => call[1] === SR * seconds,
    ).length
  }

  it('drops buffers for sounds nobody is playing once the cache outgrows its budget', async () => {
    await engine.load(WOMB)
    engine.play(placement({ id: 'p1', soundId: WOMB.id }))
    engine.stop('p1')
    await engine.load(WIND)
    engine.play(placement({ id: 'p2', soundId: WIND.id }))
    engine.stop('p2') // now 24.2MB cached with nothing playing -> the older womb goes

    expect(rendersOf(72)).toBe(1)
    await engine.load(WOMB)
    expect(rendersOf(72)).toBe(2) // re-rendered, so it had been evicted
  })

  it('never evicts a sound that is still playing', async () => {
    await engine.load(WOMB)
    engine.play(placement({ id: 'p1', soundId: WOMB.id })) // stays playing
    await engine.load(WIND)
    engine.play(placement({ id: 'p2', soundId: WIND.id }))
    engine.stop('p2') // over budget, but womb is audible -> idle wind is the one that goes

    await engine.load(WOMB)
    expect(rendersOf(72)).toBe(1) // still cached: evicting it would strand a playing orb
    await engine.load(WIND)
    expect(rendersOf(60)).toBe(2)
  })
})
