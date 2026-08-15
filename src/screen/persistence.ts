// localStorage persistence for the screen-dim setting, same schema/version convention as
// src/sleep/persistence.ts (CURRENT_SCHEMA + fail-safe parse) so both modules evolve the same way.
import type { DimMinutes } from './store'

const CURRENT_SCHEMA = 1
const DIM_KEY = 'so.screenDim'

interface StoredDim {
  version: number
  dimAfterMinutes: DimMinutes
}

function isValidMinutes(value: unknown): value is DimMinutes {
  return value === null || value === 5 || value === 10 || value === 30
}

export function loadDimMinutes(): DimMinutes {
  try {
    const raw = JSON.parse(localStorage.getItem(DIM_KEY) ?? 'null') as StoredDim | null
    // ponytail: only schema v1 exists — no migrate() yet, add when v2 lands.
    if (!raw || raw.version !== CURRENT_SCHEMA || !isValidMinutes(raw.dimAfterMinutes)) return null
    return raw.dimAfterMinutes
  } catch {
    return null // fail-safe: corrupt storage must never brick the app
  }
}

export function saveDimMinutes(dimAfterMinutes: DimMinutes): void {
  const stored: StoredDim = { version: CURRENT_SCHEMA, dimAfterMinutes }
  localStorage.setItem(DIM_KEY, JSON.stringify(stored))
}
