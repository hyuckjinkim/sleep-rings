// localStorage persistence per architecture.md §4. IO boundary only — src/mixer/store.ts
// owns the state shape/mutations and never imports this file, so store.test.ts stays
// localStorage-free. This module reads/writes and pokes the store via its public API.
import { emptyMix, startPlayback, useMixStore } from '../mixer/store'
import { soundEngine } from '../mixer/engine/instance'
import type { Mix } from '../mixer/types'

const CURRENT_SCHEMA = 1
const AUTOSAVE_DEBOUNCE_MS = 500
const MIX_KEY = 'so.currentMix'
const PRESETS_KEY = 'so.presets'
const PLAYBACK_KEY = 'so.playbackSettings'

/** Start fade-in choices, seconds (0 = off: only the short per-orb click guard). */
export const FADE_IN_OPTIONS = [0, 10, 30, 60] as const
/** Sleep-timer fade-out choices, seconds. */
export const SLEEP_FADE_OPTIONS = [30, 60, 180, 300, 600] as const

/** Max-volume ceilings offered in Settings (1 = no limit). */
export const VOLUME_CAP_OPTIONS = [1, 0.75, 0.5] as const
/** "Nursery" preset: a low ceiling, shown with keep-the-device-away guidance. No dB claims — a
 * phone can't know the sound level at the listener's ear. */
export const NURSERY_VOLUME_CAP = 0.3

export interface PlaybackSettings {
  fadeInSec: number
  sleepFadeSec: number
  volumeCap: number
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = { fadeInSec: 0, sleepFadeSec: 60, volumeCap: 1 }

interface StoredMix {
  version: number
  mix: Mix
}

function isValidMix(value: unknown): value is Mix {
  const v = value as Partial<Mix> | null
  return !!v && typeof v.id === 'string' && Array.isArray(v.placements)
}

export function loadMix(): Mix {
  try {
    const raw = JSON.parse(localStorage.getItem(MIX_KEY) ?? 'null') as StoredMix | null
    // ponytail: only schema v1 exists (architecture.md §4) — no migrate() yet, add when v2 lands
    if (!raw || raw.version !== CURRENT_SCHEMA || !isValidMix(raw.mix)) return emptyMix()
    return raw.mix
  } catch {
    return emptyMix() // fail-safe: corrupt storage must never brick the app
  }
}

export function saveMix(mix: Mix): void {
  const stored: StoredMix = { version: CURRENT_SCHEMA, mix }
  localStorage.setItem(MIX_KEY, JSON.stringify(stored))
}

export function loadPresets(): Mix[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter(isValidMix) : []
  } catch {
    return []
  }
}

export function savePresets(presets: Mix[]): void {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
}

function pick<T>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}

/** Each field is validated on its own, so a value outside today's option lists (or a field added
 * later) falls back to its default instead of discarding the rest. */
export function loadPlaybackSettings(): PlaybackSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAYBACK_KEY) ?? 'null') as
      | ({ version: number } & Partial<PlaybackSettings>)
      | null
    if (!raw || raw.version !== CURRENT_SCHEMA) return { ...DEFAULT_PLAYBACK_SETTINGS }
    return {
      fadeInSec: pick(FADE_IN_OPTIONS, raw.fadeInSec, DEFAULT_PLAYBACK_SETTINGS.fadeInSec),
      sleepFadeSec: pick(SLEEP_FADE_OPTIONS, raw.sleepFadeSec, DEFAULT_PLAYBACK_SETTINGS.sleepFadeSec),
      volumeCap: pick([...VOLUME_CAP_OPTIONS, NURSERY_VOLUME_CAP], raw.volumeCap, DEFAULT_PLAYBACK_SETTINGS.volumeCap),
    }
  } catch {
    return { ...DEFAULT_PLAYBACK_SETTINGS }
  }
}

export function savePlaybackSettings(settings: PlaybackSettings): void {
  localStorage.setItem(PLAYBACK_KEY, JSON.stringify({ version: CURRENT_SCHEMA, ...settings }))
}

/**
 * Boot-time restore. Populates the store directly (no engine calls beyond the usual
 * startPlayback queuing — see its docstring for why that's safe pre-gesture).
 */
export function restoreMix(): void {
  const mix = loadMix()
  const presets = loadPresets()
  useMixStore.setState({ current: mix, presets })
  soundEngine.setMasterVolume(mix.masterVolume) // restore the saved master volume, not just display it
  for (const placement of mix.placements) startPlayback(placement)
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

/** Call once at boot. Debounces `current` writes; `presets` (explicit save/delete) write immediately. */
export function subscribeAutoSave(): () => void {
  let lastPresets = useMixStore.getState().presets
  return useMixStore.subscribe((state) => {
    if (state.presets !== lastPresets) {
      lastPresets = state.presets
      savePresets(state.presets)
    }
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveMix(state.current), AUTOSAVE_DEBOUNCE_MS)
  })
}
