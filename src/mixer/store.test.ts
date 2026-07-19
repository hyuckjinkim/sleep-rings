import { beforeEach, describe, it, expect } from 'vitest'
import { useMixStore } from './store'

beforeEach(() => {
  useMixStore.setState({ current: { ...useMixStore.getState().current, placements: [] } })
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
