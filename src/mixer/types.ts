// audio-engineer landed the canonical shared types at src/data/types.ts (identical shape to
// what this file used to define locally). Re-export so mixer's internal `from './types'`
// imports keep working without drift from the canonical source.
export type { Locale, Category, SoundSource, LicenseRef, Sound, OrbitMode, OrbitShape, Orbit, Placement, Mix } from '../data/types'

/** Name of a mix nobody named (i.e. not a loaded preset). Here, not in the store, so share.ts
 * doesn't pull the store and the audio engine in with it. */
export const UNTITLED_MIX_NAME = 'Untitled'
