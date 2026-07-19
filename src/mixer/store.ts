// Declarative mix state only (architecture.md §2, §1): radius/angle/orbit-config/locked/
// volume live here. Live per-frame orbit angle is NOT stored here — OrbitField drives that
// imperatively via rAF. No persistence yet (P4 forbids auto-save for now).
import { create } from 'zustand'
import type { Mix, Placement, Orbit } from './types'
import { soundEngine } from './engine/mockSoundEngine'

let nextId = 0
function makeId(prefix: string): string {
  nextId += 1
  return `${prefix}-${Date.now()}-${nextId}`
}

function randomDirection(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1
}

export function defaultOrbit(): Orbit {
  return { mode: 'random', shape: { kind: 'circle' }, speed: 0.15, direction: randomDirection() }
}

function emptyMix(): Mix {
  return { id: makeId('mix'), name: 'Untitled', placements: [], masterVolume: 1, updatedAt: Date.now() }
}

export type PlacementPatch = Partial<Omit<Placement, 'id' | 'soundId' | 'orbit'>> & { orbit?: Partial<Orbit> }

interface MixStore {
  current: Mix
  addPlacement(soundId: string, radius: number, angle: number): string
  updatePlacement(id: string, patch: PlacementPatch): void
  removePlacement(id: string): void
  toggleLocked(id: string): void
}

export const useMixStore = create<MixStore>((set, get) => ({
  current: emptyMix(),

  addPlacement(soundId, radius, angle) {
    const placement: Placement = {
      id: makeId('p'),
      soundId,
      radius,
      angle,
      orbit: defaultOrbit(),
      locked: false,
      volume: 1,
    }
    set((s) => ({
      current: { ...s.current, placements: [...s.current.placements, placement], updatedAt: Date.now() },
    }))
    soundEngine.play(placement)
    return placement.id
  },

  updatePlacement(id, patch) {
    set((s) => ({
      current: {
        ...s.current,
        placements: s.current.placements.map((p) =>
          p.id === id ? { ...p, ...patch, orbit: patch.orbit ? { ...p.orbit, ...patch.orbit } : p.orbit } : p,
        ),
        updatedAt: Date.now(),
      },
    }))
    const updated = get().current.placements.find((p) => p.id === id)
    if (updated) soundEngine.setPlacement(updated)
  },

  removePlacement(id) {
    set((s) => ({
      current: { ...s.current, placements: s.current.placements.filter((p) => p.id !== id), updatedAt: Date.now() },
    }))
    soundEngine.stop(id)
  },

  toggleLocked(id) {
    const p = get().current.placements.find((p) => p.id === id)
    if (p) get().updatePlacement(id, { locked: !p.locked })
  },
}))
