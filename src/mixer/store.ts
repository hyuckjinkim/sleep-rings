// Declarative mix state only (architecture.md §2, §1): radius/angle/orbit-config/locked/
// volume live here. Live per-frame orbit angle is NOT stored here — OrbitField drives that
// imperatively via rAF. Persistence (auto-save/restore/presets IO) lives in src/sleep/ —
// this store never touches localStorage itself, only exposes state + set()/subscribe().
import { create } from 'zustand'
import type { Mix, Placement, Orbit } from './types'
import { soundEngine } from './engine/instance'
import { catalog, isAvailable } from '../library/catalog'
import { clamp } from './geometry'
import { hapticTap, setMediaSessionPlaying } from '../mobile' // B3: light-only, user-toggleable; no-op off-device
import { canUseFeature, canUseSound, getPlan, maxLayers, maxPresets } from '../plan'

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

// Wake alarm: how long the wake sound takes to fade in (and the mix to fade out under it).
export const ALARM_FADE_SEC = 5 * 60

/** Next wall-clock occurrence (epoch ms) of a "HH:MM" wake time: today if still ahead, else tomorrow. */
export function nextAlarmAt(hhmm: string, now: Date = new Date()): number {
  const [h, m] = hhmm.split(':').map(Number)
  const at = new Date(now)
  at.setHours(h, m, 0, 0)
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
  return at.getTime()
}

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
 * What the engine gets to see of a placement: paid per-sound controls the current plan doesn't
 * include are dropped. Every path into the engine goes through this (store and OrbitField's frame
 * loop), so a mix saved on a paid plan simply plays neutral after a downgrade — same idea as the
 * per-sound gate in startPlayback().
 */
export function enginePlacement(placement: Placement): Placement {
  return placement.tone && !canUseFeature('tone', getPlan()) ? { ...placement, tone: undefined } : placement
}

/**
 * Start engine playback for a placement. Safe to call before the user's first gesture —
 * Web Audio lets you queue/start a source on a suspended AudioContext, it just stays silent
 * until ctx.resume() (fired by engine.init() on the first gesture). That's what lets restored
 * placements be queued at boot while still honoring "playback only after first gesture".
 */
export function startPlayback(placement: Placement): void {
  const sound = catalog.find((s) => s.id === placement.soundId)
  // B2: plan gate lives here (not just in Palette's click handler) so every path that can queue a
  // placement — add, undo restore, preset load, boot restore — is covered by one check, including
  // a downgrade scenario where a saved mix/preset references a sound the current plan no longer allows.
  if (!sound || !isAvailable(sound.id) || !canUseSound(sound.id, getPlan())) return

  if (sound.source.kind === 'synth') {
    // synth buffers render in-memory, effectively instant — no loading state needed.
    void soundEngine.load(sound).then(() => {
      // H1: placement may have been removed while load() was pending — don't resurrect it as
      // an unstoppable ghost sound the store no longer has a reference to stop.
      if (!isStillPlaced(placement.id)) return
      soundEngine.play(enginePlacement(placement))
    })
  } else {
    // file sounds fetch+decode — show a loading state on the orb until play() starts.
    useMixStore.setState((s) => ({ loadingIds: new Set(s.loadingIds).add(placement.id) }))
    void soundEngine
      .load(sound)
      .then(() => {
        if (!isStillPlaced(placement.id)) return // H1, same as above
        soundEngine.play(enginePlacement(placement))
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

// B2: what addPlacement did when the plan's layer cap was already reached. 'replaced' — the
// oldest unlocked orb was swapped out so the tap still "worked"; 'blocked' — every orb was
// locked, so there was nothing safe to swap and the new sound wasn't placed. Either way this is
// guidance for the UI to surface, not a hard rejection with no explanation.
export interface LayerLimitNotice {
  soundId: string
  outcome: 'replaced' | 'blocked'
}

/** Same idea for the preset-slot cap: the save went through, but something was dropped to fit. */
export interface PresetLimitNotice {
  droppedName: string
}

interface MixStore {
  current: Mix
  loadingIds: Set<string> // placements whose (file) sound hasn't finished loading yet
  erroredIds: Set<string> // placements whose (file) sound failed to load (404/decode)
  presets: Mix[]
  sleepEndsAt: number | null // epoch ms, for the countdown UI
  sleeping: boolean // true once a sleep timer's fade+stop has completed
  alarmAt: number | null // epoch ms of an armed (or ringing) wake alarm — in-memory only, like the engine schedule
  alarmRinging: boolean
  lastRemoved: Placement | null // B7: single-slot undo buffer, cleared after UNDO_TIMEOUT_MS
  lastRemovedAll: Placement[] | null // clear-all undo buffer, same single-slot/timeout shape as lastRemoved
  layerLimitNotice: LayerLimitNotice | null // B2: transient, cleared after UNDO_TIMEOUT_MS
  presetLimitNotice: PresetLimitNotice | null
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
  startSleepTimer(minutes: number, fadeSec?: number): void
  cancelSleepTimer(): void
  /** Leave the post-timer "sleeping" state: the engine tore every source down at timer end, so
   * clearing the flag alone would leave orbs on screen (and the app counted as playing) with
   * nothing audible. Restarts every placement. No-op unless sleeping. */
  wake(): void
  /** Arm the wake alarm. Free for everyone; the wake sound itself still follows its catalog tier. */
  armAlarm(atMs: number, soundId: string): void
  /** Disarm a pending alarm, or stop a ringing one. */
  dismissAlarm(): void
}

let sleepTimeout: ReturnType<typeof setTimeout> | undefined
let undoTimeout: ReturnType<typeof setTimeout> | undefined
let undoAllTimeout: ReturnType<typeof setTimeout> | undefined
let layerLimitTimeout: ReturnType<typeof setTimeout> | undefined
let alarmTimeout: ReturnType<typeof setTimeout> | undefined

export const useMixStore = create<MixStore>((set, get) => ({
  current: emptyMix(),
  loadingIds: new Set(),
  erroredIds: new Set(),
  presets: [],
  sleepEndsAt: null,
  sleeping: false,
  alarmAt: null,
  alarmRinging: false,
  lastRemoved: null,
  lastRemovedAll: null,
  layerLimitNotice: null,
  presetLimitNotice: null,

  addPlacement(soundId, radius, angle) {
    hapticTap()
    setMediaSessionPlaying(true)
    soundEngine.onEnterForeground() // MEDIUM-2: re-resume if a completed sleep timer suspended the context
    get().wake() // the other orbs were stopped at timer end too — bring them back with this one
    const placement: Placement = {
      id: makeId('p'),
      soundId,
      radius,
      angle,
      orbit: defaultOrbit(),
      locked: false,
      volume: 1,
    }

    // B2: don't hard-block once the plan's layer cap is hit — a night user reaching for the field
    // in the dark shouldn't get a dead tap. Swap out the oldest *unlocked* orb instead (locked
    // orbs are an explicit user choice, never auto-removed); only if every orb is locked is there
    // nothing safe to replace, and the new sound doesn't get placed.
    const existing = get().current.placements
    const limit = maxLayers(getPlan())
    let placements = existing
    let notice: LayerLimitNotice | null = null
    if (existing.length >= limit) {
      const oldest = existing.find((p) => !p.locked)
      if (oldest) {
        soundEngine.stop(oldest.id, PLACEMENT_FADE_SEC)
        placements = existing.filter((p) => p.id !== oldest.id)
        notice = { soundId, outcome: 'replaced' }
      } else {
        clearTimeout(layerLimitTimeout)
        set({ layerLimitNotice: { soundId, outcome: 'blocked' } })
        layerLimitTimeout = setTimeout(() => {
          set((s) => (s.layerLimitNotice?.soundId === soundId ? { layerLimitNotice: null } : s))
        }, UNDO_TIMEOUT_MS)
        return ''
      }
    }

    set((s) => ({
      current: { ...s.current, placements: [...placements, placement], updatedAt: Date.now() },
      sleeping: false, // B17: audio resumes via onEnterForeground() above — the visual state must follow
      layerLimitNotice: notice,
    }))
    clearTimeout(layerLimitTimeout)
    if (notice) {
      layerLimitTimeout = setTimeout(() => {
        set((s) => (s.layerLimitNotice === notice ? { layerLimitNotice: null } : s))
      }, UNDO_TIMEOUT_MS)
    }
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
    if (updated) soundEngine.setPlacement(enginePlacement(updated))
  },

  removePlacement(id) {
    hapticTap()
    // last orb gone -> the lock-screen transport must stop claiming playback
    if (get().current.placements.length <= 1) setMediaSessionPlaying(false)
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
    setMediaSessionPlaying(false)
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
    hapticTap()
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
    const limit = maxPresets(getPlan())
    set((s) => {
      // B2: same non-blocking principle as the layer cap — once the slot count is full, saving
      // replaces the oldest preset (FIFO) instead of refusing the save. Presets have no "locked"
      // concept to preserve, so there's no equivalent to the layer cap's "everything's locked,
      // can't do anything" dead end here.
      if (s.presets.length < limit) return { presets: [...s.presets, preset] }
      // At the cap the save still succeeds (never refuse a save), but dropping the oldest preset
      // silently is data the user didn't agree to lose — surface it the same way the layer cap does.
      // Reviewer H2 / R1 community research ("my 8th mix vanished").
      const dropped = s.presets[0]
      return { presets: [...s.presets.slice(1), preset], presetLimitNotice: { droppedName: dropped.name } }
    })
    if (get().presetLimitNotice) {
      setTimeout(() => set({ presetLimitNotice: null }), UNDO_TIMEOUT_MS)
    }
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

  startSleepTimer(minutes, fadeSec = SLEEP_FADE_SEC) {
    soundEngine.onEnterForeground() // MEDIUM-2
    get().wake()
    clearTimeout(sleepTimeout)
    const durationSec = Math.max(0, minutes) * 60
    soundEngine.scheduleSleep(durationSec, fadeSec)
    set({ sleepEndsAt: Date.now() + durationSec * 1000, sleeping: false })
    sleepTimeout = setTimeout(() => {
      set({ sleeping: true, sleepEndsAt: null })
      setMediaSessionPlaying(false)
    }, durationSec * 1000)
  },

  cancelSleepTimer() {
    soundEngine.onEnterForeground() // MEDIUM-2: lets the "off" recovery path also un-suspend
    get().wake()
    clearTimeout(sleepTimeout)
    soundEngine.cancelSleep()
    set({ sleepEndsAt: null, sleeping: false })
  },

  wake() {
    if (get().alarmRinging) get().dismissAlarm() // up and touching the mix — the alarm did its job
    if (!get().sleeping) return
    set({ sleeping: false })
    const placements = get().current.placements
    if (placements.length > 0) setMediaSessionPlaying(true)
    for (const p of placements) startPlayback(p) // engine.play() is a no-op for anything still active
  },

  armAlarm(atMs, soundId) {
    const sound = catalog.find((s) => s.id === soundId)
    if (!sound || !canUseSound(sound.id, getPlan())) return
    soundEngine.onEnterForeground() // a frozen (suspended) audio clock would never reach the alarm
    clearTimeout(alarmTimeout)
    soundEngine.cancelAlarm()
    set({ alarmAt: atMs, alarmRinging: false })
    // Not via startPlayback(): the alarm isn't a placement, and it must not ride the layer cap.
    void soundEngine.load(sound).then(() => {
      if (get().alarmAt === atMs) soundEngine.scheduleAlarm(sound.id, atMs, ALARM_FADE_SEC)
    })
    // UI only — the sound itself is scheduled on the audio clock above, immune to timer throttling.
    alarmTimeout = setTimeout(() => {
      clearTimeout(sleepTimeout) // the alarm supersedes a timer that hadn't finished yet
      set({ alarmRinging: true, sleeping: true, sleepEndsAt: null })
    }, Math.max(0, atMs - Date.now()))
  },

  dismissAlarm() {
    clearTimeout(alarmTimeout)
    soundEngine.cancelAlarm()
    set({ alarmAt: null, alarmRinging: false })
  },
}))
