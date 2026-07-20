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
