import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useMixStore } from './store'

beforeEach(() => {
  useMixStore.setState({
    current: { ...useMixStore.getState().current, placements: [] },
    presets: [],
    sleepEndsAt: null,
    sleeping: false,
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
})
