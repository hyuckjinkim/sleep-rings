// Declarative mix state only (architecture.md §2, §1): radius/angle/orbit-config/locked/
// volume live here. Live per-frame orbit angle is NOT stored here — OrbitField drives that
// imperatively via rAF. No persistence yet (P4 forbids auto-save for now).
import { create } from 'zustand'
import type { Mix, Placement, Orbit } from './types'
import { soundEngine } from './engine/instance'
import { catalog } from '../library/catalog'

let nextId = 0
function makeId(prefix: string): string {
  nextId += 1
  return `${prefix}-${Date.now()}-${nextId}`
}

function randomDirection(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1
}

// One revolution every 45-90s per docs/design/visual-theme.md §9 (faster reads as agitating).
export const DEFAULT_ORBIT_SPEED = 0.1

export function defaultOrbit(): Orbit {
  return { mode: 'random', shape: { kind: 'circle' }, speed: DEFAULT_ORBIT_SPEED, direction: randomDirection() }
}

function emptyMix(): Mix {
  return { id: makeId('mix'), name: 'Untitled', placements: [], masterVolume: 1, updatedAt: Date.now() }
}

export type PlacementPatch = Partial<Omit<Placement, 'id' | 'soundId' | 'orbit'>> & { orbit?: Partial<Orbit> }

interface MixStore {
  current: Mix
  loadingIds: Set<string> // placements whose (file) sound hasn't finished loading yet
  addPlacement(soundId: string, radius: number, angle: number): string
  updatePlacement(id: string, patch: PlacementPatch): void
  removePlacement(id: string): void
  toggleLocked(id: string): void
}

export const useMixStore = create<MixStore>((set, get) => ({
  current: emptyMix(),
  loadingIds: new Set(),

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

    const sound = catalog.find((s) => s.id === soundId)
    if (!sound) return placement.id

    if (sound.source.kind === 'synth') {
      // synth buffers render in-memory, effectively instant — no loading state needed.
      void soundEngine.load(sound).then(() => soundEngine.play(placement))
    } else {
      // file sounds fetch+decode — show a loading state on the orb until play() starts.
      set((s) => ({ loadingIds: new Set(s.loadingIds).add(placement.id) }))
      void soundEngine.load(sound).then(() => {
        soundEngine.play(placement)
        set((s) => {
          const next = new Set(s.loadingIds)
          next.delete(placement.id)
          return { loadingIds: next }
        })
      })
    }
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
    set((s) => {
      const loadingIds = new Set(s.loadingIds)
      loadingIds.delete(id)
      return {
        current: { ...s.current, placements: s.current.placements.filter((p) => p.id !== id), updatedAt: Date.now() },
        loadingIds,
      }
    })
    soundEngine.stop(id)
  },

  toggleLocked(id) {
    const p = get().current.placements.find((p) => p.id === id)
    if (p) get().updatePlacement(id, { locked: !p.locked })
  },
}))
