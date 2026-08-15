// Declarative mix state only (architecture.md §2, §1): radius/angle/orbit-config/locked/
// volume live here. Live per-frame orbit angle is NOT stored here — OrbitField drives that
// imperatively via rAF. Persistence (auto-save/restore/presets IO) lives in src/sleep/ —
// this store never touches localStorage itself, only exposes state + set()/subscribe().
import { create } from 'zustand'
import type { Mix, Placement, Orbit } from './types'
import { soundEngine } from './engine/instance'
import { catalog, isAvailable } from '../library/catalog'
import { clamp } from './geometry'

// B7: how long the "undo delete" toast stays available after a removal.
const UNDO_TIMEOUT_MS = 5000

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

// audio-engine.md §5: individual placement add/remove should fade too, to avoid onset/offset
// clicks on noise buffers. Short — this is a UI micro-fade, not the sleep-timer's gentle one.
export const PLACEMENT_FADE_SEC = 0.2

export function defaultOrbit(): Orbit {
  return { mode: 'random', shape: { kind: 'circle' }, speed: DEFAULT_ORBIT_SPEED, direction: randomDirection() }
}

export function emptyMix(): Mix {
  return { id: makeId('mix'), name: 'Untitled', placements: [], masterVolume: 1, updatedAt: Date.now() }
}

export type PlacementPatch = Partial<Omit<Placement, 'id' | 'soundId' | 'orbit'>> & { orbit?: Partial<Orbit> }

function isStillPlaced(id: string): boolean {
  return useMixStore.getState().current.placements.some((p) => p.id === id)
}

function clearLoading(id: string): void {
  useMixStore.setState((s) => {
    if (!s.loadingIds.has(id)) return s
    const next = new Set(s.loadingIds)
    next.delete(id)
    return { loadingIds: next }
  })
}

function markErrored(id: string): void {
  useMixStore.setState((s) => ({ erroredIds: new Set(s.erroredIds).add(id) }))
}

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
    void soundEngine.load(sound).then(() => {
      // H1: placement may have been removed while load() was pending — don't resurrect it as
      // an unstoppable ghost sound the store no longer has a reference to stop.
      if (!isStillPlaced(placement.id)) return
      soundEngine.play(placement)
    })
  } else {
    // file sounds fetch+decode — show a loading state on the orb until play() starts.
    useMixStore.setState((s) => ({ loadingIds: new Set(s.loadingIds).add(placement.id) }))
    void soundEngine
      .load(sound)
      .then(() => {
        if (!isStillPlaced(placement.id)) return // H1, same as above
        soundEngine.play(placement)
        clearLoading(placement.id)
      })
      .catch(() => {
        // M1: fetch/decode failure (404 etc) — clear the loading look, surface an error look
        // instead (same treatment level as a catalog "unavailable" entry), and never leave an
        // unhandled rejection.
        clearLoading(placement.id)
        if (isStillPlaced(placement.id)) markErrored(placement.id)
      })
  }
}

interface MixStore {
  current: Mix
  loadingIds: Set<string> // placements whose (file) sound hasn't finished loading yet
  erroredIds: Set<string> // placements whose (file) sound failed to load (404/decode)
  presets: Mix[]
  sleepEndsAt: number | null // epoch ms, for the countdown UI
  sleeping: boolean // true once a sleep timer's fade+stop has completed
  lastRemoved: Placement | null // B7: single-slot undo buffer, cleared after UNDO_TIMEOUT_MS
  lastRemovedAll: Placement[] | null // clear-all undo buffer, same single-slot/timeout shape as lastRemoved
  addPlacement(soundId: string, radius: number, angle: number): string
  updatePlacement(id: string, patch: PlacementPatch): void
  removePlacement(id: string): void
  restoreLastRemoved(): void
  clearAll(): void
  restoreLastRemovedAll(): void
  toggleLocked(id: string): void
  setMasterVolume(volume: number): void
  savePreset(name: string): void
  loadPreset(id: string): void
  deletePreset(id: string): void
  startSleepTimer(minutes: number): void
  cancelSleepTimer(): void
}

let sleepTimeout: ReturnType<typeof setTimeout> | undefined
let undoTimeout: ReturnType<typeof setTimeout> | undefined
let undoAllTimeout: ReturnType<typeof setTimeout> | undefined

export const useMixStore = create<MixStore>((set, get) => ({
  current: emptyMix(),
  loadingIds: new Set(),
  erroredIds: new Set(),
  presets: [],
  sleepEndsAt: null,
  sleeping: false,
  lastRemoved: null,
  lastRemovedAll: null,

  addPlacement(soundId, radius, angle) {
    soundEngine.onEnterForeground() // MEDIUM-2: re-resume if a completed sleep timer suspended the context
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
      sleeping: false, // B17: audio resumes via onEnterForeground() above — the visual state must follow
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
    const removed = get().current.placements.find((p) => p.id === id) ?? null
    set((s) => {
      const loadingIds = new Set(s.loadingIds)
      loadingIds.delete(id)
      const erroredIds = new Set(s.erroredIds)
      erroredIds.delete(id)
      return {
        current: { ...s.current, placements: s.current.placements.filter((p) => p.id !== id), updatedAt: Date.now() },
        loadingIds,
        erroredIds,
        lastRemoved: removed,
      }
    })
    soundEngine.stop(id, PLACEMENT_FADE_SEC) // M2: fade out instead of a hard click

    // B7: give an "undo delete" toast a window to restore the single most recent removal.
    clearTimeout(undoTimeout)
    if (removed) {
      undoTimeout = setTimeout(() => {
        set((s) => (s.lastRemoved === removed ? { lastRemoved: null } : s))
      }, UNDO_TIMEOUT_MS)
    }
  },

  restoreLastRemoved() {
    const removed = get().lastRemoved
    if (!removed) return
    clearTimeout(undoTimeout)
    set((s) => ({
      current: { ...s.current, placements: [...s.current.placements, removed], updatedAt: Date.now() },
      lastRemoved: null,
    }))
    startPlayback(removed)
  },

  // "모두 제거": stop+fade every placement and snapshot them for one undo, same shape as the
  // single-delete undo above. A confirm dialog would interrupt a half-asleep user reaching for
  // the field at night; an undo toast (matching the existing B7 pattern) is safer to misfire on.
  clearAll() {
    const placements = get().current.placements
    if (placements.length === 0) return
    for (const p of placements) soundEngine.stop(p.id, PLACEMENT_FADE_SEC)
    clearTimeout(undoTimeout) // a bulk clear supersedes any pending single-delete undo
    clearTimeout(undoAllTimeout)
    set({
      current: { ...get().current, placements: [], updatedAt: Date.now() },
      loadingIds: new Set(),
      erroredIds: new Set(),
      lastRemoved: null,
      lastRemovedAll: placements,
    })
    undoAllTimeout = setTimeout(() => {
      set((s) => (s.lastRemovedAll === placements ? { lastRemovedAll: null } : s))
    }, UNDO_TIMEOUT_MS)
  },

  restoreLastRemovedAll() {
    const removed = get().lastRemovedAll
    if (!removed) return
    clearTimeout(undoAllTimeout)
    set((s) => ({
      current: { ...s.current, placements: [...s.current.placements, ...removed], updatedAt: Date.now() },
      lastRemovedAll: null,
    }))
    for (const p of removed) startPlayback(p)
  },

  toggleLocked(id) {
    const p = get().current.placements.find((p) => p.id === id)
    if (p) get().updatePlacement(id, { locked: !p.locked })
  },

  setMasterVolume(volume) {
    const v = clamp(volume, 0, 1)
    set((s) => ({ current: { ...s.current, masterVolume: v, updatedAt: Date.now() } }))
    soundEngine.setMasterVolume(v)
  },

  savePreset(name) {
    const preset: Mix = { ...get().current, id: makeId('preset'), name, updatedAt: Date.now() }
    set((s) => ({ presets: [...s.presets, preset] }))
  },

  loadPreset(id) {
    const preset = get().presets.find((p) => p.id === id)
    if (!preset) return
    soundEngine.onEnterForeground() // MEDIUM-2
    for (const p of get().current.placements) soundEngine.stop(p.id, PLACEMENT_FADE_SEC) // L-1: fade, not a hard cut
    const current: Mix = { ...preset, id: makeId('mix'), updatedAt: Date.now() }
    set({
      current,
      loadingIds: new Set(),
      erroredIds: new Set(),
      sleepEndsAt: null,
      sleeping: false,
      lastRemoved: null,
      lastRemovedAll: null,
    })
    clearTimeout(sleepTimeout)
    clearTimeout(undoTimeout) // a preset swap invalidates any pending undo from the previous mix
    clearTimeout(undoAllTimeout)
    soundEngine.cancelSleep()
    for (const p of current.placements) startPlayback(p)
  },

  deletePreset(id) {
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }))
  },

  startSleepTimer(minutes) {
    soundEngine.onEnterForeground() // MEDIUM-2
    clearTimeout(sleepTimeout)
    const durationSec = Math.max(0, minutes) * 60
    soundEngine.scheduleSleep(durationSec, SLEEP_FADE_SEC)
    set({ sleepEndsAt: Date.now() + durationSec * 1000, sleeping: false })
    sleepTimeout = setTimeout(() => set({ sleeping: true, sleepEndsAt: null }), durationSec * 1000)
  },

  cancelSleepTimer() {
    soundEngine.onEnterForeground() // MEDIUM-2: lets the "off" recovery path also un-suspend
    clearTimeout(sleepTimeout)
    soundEngine.cancelSleep()
    set({ sleepEndsAt: null, sleeping: false })
  },
}))
