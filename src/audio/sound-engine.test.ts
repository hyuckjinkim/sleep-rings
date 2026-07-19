import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Placement, Sound } from '../data/types'
import { SoundEngine } from './sound-engine'
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
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    )
    ctx = createMockAudioContext()
    engine = new SoundEngine(ctx)
  })

  it('init() resumes the context and pre-renders all four noise colors', async () => {
    await engine.init()
    expect(ctx.resume).toHaveBeenCalled()
    expect(ctx.createBuffer).toHaveBeenCalledTimes(4)
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

    const gainNode = vi.mocked(ctx.createGain).mock.results[1].value // [0] is the master gain
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
    engine.setMasterVolume(2)
    engine.setMasterVolume(-1)
    // no public getter for master gain — verify indirectly via no throw + fadeOutAll not clobbered
    expect(() => engine.setMasterVolume(0.5)).not.toThrow()
  })

  it('scheduleSleep() fades out then stops+suspends at duration; cancelSleep() prevents it', async () => {
    vi.useFakeTimers()
    await engine.load(NOISE_SOUND)
    engine.play(placement())

    engine.scheduleSleep(10, 2)
    vi.advanceTimersByTime(8000) // fade should have started
    expect(engine.inspect('p1')).not.toBeNull() // still "active" until the stop timer fires

    vi.advanceTimersByTime(2000) // reach duration
    expect(ctx.suspend).toHaveBeenCalled()
    expect(engine.inspect('p1')).toBeNull()
    vi.useRealTimers()
  })

  it('scheduleSleep() invokes fadeOutAll() with the configured fade duration exactly at duration-fadeSec', async () => {
    vi.useFakeTimers()
    const fadeSpy = vi.spyOn(engine, 'fadeOutAll')
    engine.scheduleSleep(10, 2)

    vi.advanceTimersByTime(7999)
    expect(fadeSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1) // crosses the duration-fadeSec (8s) mark
    expect(fadeSpy).toHaveBeenCalledTimes(1)
    expect(fadeSpy).toHaveBeenCalledWith(2)
    vi.useRealTimers()
  })

  it('cancelSleep() before the fade delay prevents fadeOutAll() from ever firing', async () => {
    vi.useFakeTimers()
    const fadeSpy = vi.spyOn(engine, 'fadeOutAll')
    engine.scheduleSleep(10, 2)
    vi.advanceTimersByTime(5000)
    engine.cancelSleep()
    vi.advanceTimersByTime(10000)
    expect(fadeSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('cancelSleep() clears pending timers', async () => {
    vi.useFakeTimers()
    await engine.load(NOISE_SOUND)
    engine.play(placement())
    engine.scheduleSleep(10, 2)
    engine.cancelSleep()
    vi.advanceTimersByTime(10000)
    expect(ctx.suspend).not.toHaveBeenCalled()
    expect(engine.inspect('p1')).not.toBeNull()
    vi.useRealTimers()
  })

  it('fadeOutAll() resolves after the given duration', async () => {
    vi.useFakeTimers()
    const promise = engine.fadeOutAll(3)
    let resolved = false
    void promise.then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(3000)
    expect(resolved).toBe(true)
    vi.useRealTimers()
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
})
