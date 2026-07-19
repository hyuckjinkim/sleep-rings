// Declarative mix state only (architecture.md §2, §1): radius/angle/orbit-config/locked/
// volume live here. Live per-frame orbit angle is NOT stored here — OrbitField drives that
// imperatively via rAF. Persistence (auto-save/restore/presets IO) lives in src/sleep/ —
// this store never touches localStorage itself, only exposes state + set()/subscribe().
import { create } from 'zustand'
import type { Mix, Placement, Orbit } from './types'
import { soundEngine } from './engine/instance'
import { catalog, isAvailable } from '../library/catalog'

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

// audio-engine.md §5 doesn't pin a number, just "gentle" — 60s is a reasonable sleep-app default.
export const SLEEP_FADE_SEC = 60

export function defaultOrbit(): Orbit {
  return { mode: 'random', shape: { kind: 'circle' }, speed: DEFAULT_ORBIT_SPEED, direction: randomDirection() }
}

export function emptyMix(): Mix {
  return { id: makeId('mix'), name: 'Untitled', placements: [], masterVolume: 1, updatedAt: Date.now() }
}

export type PlacementPatch = Partial<Omit<Placement, 'id' | 'soundId' | 'orbit'>> & { orbit?: Partial<Orbit> }

/**
 * Start engine playback for a placement. Safe to call before the user's first gesture —
 * Web Audio lets you queue/start a source on a suspended AudioContext, it just stays silent
 * until ctx.resume() (fired by engine.init() on the first gesture). That's what lets restored
 * placements be queued at boot while still honoring "playback only after first gesture".
 */
export function startPlayback(placement: Placement): void {
  const sound = catalog.find((s) => s.id === placement.soundId)
  if (!sound || !isAvailable(sound.id)) return

  if (sound.source.kind === 'synth') {
    // synth buffers render in-memory, effectively instant — no loading state needed.
    void soundEngine.load(sound).then(() => soundEngine.play(placement))
  } else {
    // file sounds fetch+decode — show a loading state on the orb until play() starts.
    useMixStore.setState((s) => ({ loadingIds: new Set(s.loadingIds).add(placement.id) }))
    void soundEngine.load(sound).then(() => {
      soundEngine.play(placement)
      useMixStore.setState((s) => {
        const next = new Set(s.loadingIds)
        next.delete(placement.id)
        return { loadingIds: next }
      })
    })
  }
}

interface MixStore {
  current: Mix
  loadingIds: Set<string> // placements whose (file) sound hasn't finished loading yet
  presets: Mix[]
  sleepEndsAt: number | null // epoch ms, for the countdown UI
  sleeping: boolean // true once a sleep timer's fade+stop has completed
  addPlacement(soundId: string, radius: number, angle: number): string
  updatePlacement(id: string, patch: PlacementPatch): void
  removePlacement(id: string): void
  toggleLocked(id: string): void
  savePreset(name: string): void
  loadPreset(id: string): void
  deletePreset(id: string): void
  startSleepTimer(minutes: number): void
  cancelSleepTimer(): void
}

let sleepTimeout: ReturnType<typeof setTimeout> | undefined

export const useMixStore = create<MixStore>((set, get) => ({
  current: emptyMix(),
  loadingIds: new Set(),
  presets: [],
  sleepEndsAt: null,
  sleeping: false,

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
    startPlayback(placement)
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

  savePreset(name) {
    const preset: Mix = { ...get().current, id: makeId('preset'), name, updatedAt: Date.now() }
    set((s) => ({ presets: [...s.presets, preset] }))
  },

  loadPreset(id) {
    const preset = get().presets.find((p) => p.id === id)
    if (!preset) return
    for (const p of get().current.placements) soundEngine.stop(p.id)
    const current: Mix = { ...preset, id: makeId('mix'), updatedAt: Date.now() }
    set({ current, loadingIds: new Set(), sleepEndsAt: null, sleeping: false })
    clearTimeout(sleepTimeout)
    soundEngine.cancelSleep()
    for (const p of current.placements) startPlayback(p)
  },

  deletePreset(id) {
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }))
  },

  startSleepTimer(minutes) {
    clearTimeout(sleepTimeout)
    const durationSec = Math.max(0, minutes) * 60
    soundEngine.scheduleSleep(durationSec, SLEEP_FADE_SEC)
    set({ sleepEndsAt: Date.now() + durationSec * 1000, sleeping: false })
    sleepTimeout = setTimeout(() => set({ sleeping: true, sleepEndsAt: null }), durationSec * 1000)
  },

  cancelSleepTimer() {
    clearTimeout(sleepTimeout)
    soundEngine.cancelSleep()
    set({ sleepEndsAt: null, sleeping: false })
  },
}))
