import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useMixStore } from './store'
import { soundEngine } from './engine/instance'
import { catalog } from '../library/catalog'
import type { Sound } from './types'

beforeEach(() => {
  useMixStore.setState({
    current: { ...useMixStore.getState().current, placements: [] },
    loadingIds: new Set(),
    erroredIds: new Set(),
    presets: [],
    sleepEndsAt: null,
    sleeping: false,
    lastRemoved: null,
    lastRemovedAll: null,
  })
})

describe('useMixStore', () => {
  it('adds a placement with the given radius/angle and default orbit/lock state', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    const placements = useMixStore.getState().current.placements
    expect(placements).toHaveLength(1)
    expect(placements[0]).toMatchObject({ id, soundId: 'pink-noise', radius: 0.4, angle: 1.2, locked: false })
    expect(placements[0].orbit.mode).toBe('random')
  })

  it('supports unlimited layering (multiple placements coexist)', () => {
    useMixStore.getState().addPlacement('pink-noise', 0.2, 0)
    useMixStore.getState().addPlacement('white-noise', 0.6, 2)
    useMixStore.getState().addPlacement('garden-rain', 0.9, 4)
    expect(useMixStore.getState().current.placements).toHaveLength(3)
  })

  it('moves a placement by patching radius/angle', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().updatePlacement(id, { radius: 0.1, angle: 3 })
    const p = useMixStore.getState().current.placements.find((p) => p.id === id)
    expect(p).toMatchObject({ radius: 0.1, angle: 3 })
  })

  it('merges partial orbit patches instead of replacing the whole orbit', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().updatePlacement(id, { orbit: { direction: -1 } })
    const p = useMixStore.getState().current.placements.find((p) => p.id === id)
    expect(p?.orbit.direction).toBe(-1)
    expect(p?.orbit.mode).toBe('random') // untouched field preserved
  })

  it('toggles locked state', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    expect(useMixStore.getState().current.placements[0].locked).toBe(false)
    useMixStore.getState().toggleLocked(id)
    expect(useMixStore.getState().current.placements.find((p) => p.id === id)?.locked).toBe(true)
    useMixStore.getState().toggleLocked(id)
    expect(useMixStore.getState().current.placements.find((p) => p.id === id)?.locked).toBe(false)
  })

  it('removes a placement', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().removePlacement(id)
    expect(useMixStore.getState().current.placements).toHaveLength(0)
  })

  it('fades out instead of hard-stopping on remove (M2)', () => {
    const id = useMixStore.getState().addPlacement('noise-white', 0.4, 1.2)
    const stopSpy = vi.spyOn(soundEngine, 'stop')
    useMixStore.getState().removePlacement(id)
    expect(stopSpy).toHaveBeenCalledWith(id, expect.any(Number))
    expect(stopSpy.mock.calls[0][1]).toBeGreaterThan(0)
    stopSpy.mockRestore()
  })

  it('adding a placement clears the sleeping flag (B17 regression)', () => {
    useMixStore.setState({ sleeping: true })
    useMixStore.getState().addPlacement('noise-white', 0.4, 1.2)
    expect(useMixStore.getState().sleeping).toBe(false)
  })

  it('sets the master volume, clamped, and forwards it to the engine', () => {
    const setVolumeSpy = vi.spyOn(soundEngine, 'setMasterVolume')
    useMixStore.getState().setMasterVolume(0.5)
    expect(useMixStore.getState().current.masterVolume).toBe(0.5)
    expect(setVolumeSpy).toHaveBeenCalledWith(0.5)

    useMixStore.getState().setMasterVolume(5) // out of range, must clamp
    expect(useMixStore.getState().current.masterVolume).toBe(1)
    setVolumeSpy.mockRestore()
  })
})

describe('undo (B7)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores the most recently removed placement', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().removePlacement(id)
    expect(useMixStore.getState().current.placements).toHaveLength(0)
    expect(useMixStore.getState().lastRemoved).toMatchObject({ id, soundId: 'pink-noise' })

    useMixStore.getState().restoreLastRemoved()
    expect(useMixStore.getState().current.placements).toMatchObject([{ id, soundId: 'pink-noise' }])
    expect(useMixStore.getState().lastRemoved).toBeNull()
  })

  it('only keeps a single slot — removing a second placement drops the first from the undo buffer', () => {
    const idA = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    const idB = useMixStore.getState().addPlacement('noise-white', 0.2, 0.5)
    useMixStore.getState().removePlacement(idA)
    useMixStore.getState().removePlacement(idB)

    expect(useMixStore.getState().lastRemoved?.id).toBe(idB)
    useMixStore.getState().restoreLastRemoved()
    expect(useMixStore.getState().current.placements.map((p) => p.id)).toEqual([idB])
  })

  it('expires the undo buffer after the timeout', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().removePlacement(id)
    vi.advanceTimersByTime(5000)

    expect(useMixStore.getState().lastRemoved).toBeNull()
    useMixStore.getState().restoreLastRemoved() // no-op once expired
    expect(useMixStore.getState().current.placements).toHaveLength(0)
  })
})

describe('clear all', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes every placement and restores them all on undo', () => {
    const idA = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    const idB = useMixStore.getState().addPlacement('noise-white', 0.2, 0.5)
    useMixStore.getState().clearAll()

    expect(useMixStore.getState().current.placements).toHaveLength(0)
    expect(useMixStore.getState().lastRemovedAll).toHaveLength(2)

    useMixStore.getState().restoreLastRemovedAll()
    expect(useMixStore.getState().current.placements.map((p) => p.id).sort()).toEqual([idA, idB].sort())
    expect(useMixStore.getState().lastRemovedAll).toBeNull()
  })

  it('is a no-op on an empty field', () => {
    useMixStore.getState().clearAll()
    expect(useMixStore.getState().lastRemovedAll).toBeNull()
  })

  it('supersedes a pending single-delete undo', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().removePlacement(id)
    expect(useMixStore.getState().lastRemoved).not.toBeNull()

    useMixStore.getState().addPlacement('noise-white', 0.2, 0.5)
    useMixStore.getState().clearAll()
    expect(useMixStore.getState().lastRemoved).toBeNull()
  })

  it('expires the undo buffer after the timeout', () => {
    useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().clearAll()
    vi.advanceTimersByTime(5000)

    expect(useMixStore.getState().lastRemovedAll).toBeNull()
    useMixStore.getState().restoreLastRemovedAll() // no-op once expired
    expect(useMixStore.getState().current.placements).toHaveLength(0)
  })
})

describe('load/play race (H1 regression)', () => {
  it('does not play a placement that was removed while its sound was still loading', async () => {
    let resolveLoad!: () => void
    const loadSpy = vi.spyOn(soundEngine, 'load').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = () => resolve()
        }),
    )
    const playSpy = vi.spyOn(soundEngine, 'play')

    const id = useMixStore.getState().addPlacement('noise-white', 0.3, 0) // synth, available
    useMixStore.getState().removePlacement(id) // removed before load() resolves

    resolveLoad()
    await Promise.resolve()
    await Promise.resolve()

    expect(playSpy).not.toHaveBeenCalled()

    loadSpy.mockRestore()
    playSpy.mockRestore()
  })
})

describe('load failure (M1 regression)', () => {
  const FAILING_FILE_SOUND: Sound = {
    id: 'test-file-that-fails',
    name: { ko: '테스트', en: 'Test' },
    category: 'rain',
    source: { kind: 'file', src: 'sounds/does-not-exist.m4a' },
    license: { spdx: 'CC0-1.0', sourceName: 'test' },
  }

  beforeEach(() => {
    catalog.push(FAILING_FILE_SOUND)
  })
  afterEach(() => {
    const i = catalog.indexOf(FAILING_FILE_SOUND)
    if (i >= 0) catalog.splice(i, 1)
  })

  it('clears loadingIds and marks the placement errored instead of leaving it stuck loading', async () => {
    const loadSpy = vi.spyOn(soundEngine, 'load').mockRejectedValue(new Error('404'))

    const id = useMixStore.getState().addPlacement(FAILING_FILE_SOUND.id, 0.3, 0)
    expect(useMixStore.getState().loadingIds.has(id)).toBe(true)

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(useMixStore.getState().loadingIds.has(id)).toBe(false)
    expect(useMixStore.getState().erroredIds.has(id)).toBe(true)

    loadSpy.mockRestore()
  })
})

describe('presets', () => {
  it('saves the current mix as a named preset, loads it back, and can delete it', () => {
    useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().savePreset('night routine')
    expect(useMixStore.getState().presets).toHaveLength(1)
    expect(useMixStore.getState().presets[0].name).toBe('night routine')

    useMixStore.getState().updatePlacement(useMixStore.getState().current.placements[0].id, { radius: 0.9 })
    const presetId = useMixStore.getState().presets[0].id
    useMixStore.getState().loadPreset(presetId)
    expect(useMixStore.getState().current.placements[0].radius).toBe(0.4) // restored from the saved preset, not the later edit

    useMixStore.getState().deletePreset(presetId)
    expect(useMixStore.getState().presets).toHaveLength(0)
  })

  it('loadPreset is a no-op for an unknown id', () => {
    const before = useMixStore.getState().current
    useMixStore.getState().loadPreset('does-not-exist')
    expect(useMixStore.getState().current).toBe(before)
  })
})

describe('sleep timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets a countdown target and flips to sleeping once the duration elapses', () => {
    useMixStore.getState().startSleepTimer(15)
    expect(useMixStore.getState().sleepEndsAt).not.toBeNull()
    expect(useMixStore.getState().sleeping).toBe(false)

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(true)
    expect(useMixStore.getState().sleepEndsAt).toBeNull()
  })

  it('cancelSleepTimer clears the countdown and prevents the scheduled sleep', () => {
    useMixStore.getState().startSleepTimer(15)
    useMixStore.getState().cancelSleepTimer()
    expect(useMixStore.getState().sleepEndsAt).toBeNull()
    expect(useMixStore.getState().sleeping).toBe(false)

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(false) // never fires after cancel
  })

  it('starting a new timer replaces a pending one instead of stacking', () => {
    useMixStore.getState().startSleepTimer(15)
    useMixStore.getState().startSleepTimer(30)

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(false) // the first (15m) timer was superseded

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(true) // the second (30m) timer fires
  })

  it('re-engaging after the timer completes resumes the (suspended) engine (MEDIUM-2 regression)', () => {
    useMixStore.getState().startSleepTimer(15)
    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(true)

    const resumeSpy = vi.spyOn(soundEngine, 'onEnterForeground')
    useMixStore.getState().addPlacement('noise-white', 0.3, 0)
    expect(resumeSpy).toHaveBeenCalled()

    resumeSpy.mockRestore()
  })
})
