// Shared domain types. Pure data — no React, no Web Audio, no store.
// Source of truth: docs/design/architecture.md §3.

export type Locale = 'ko' | 'en'

export type Category =
  | 'water'
  | 'rain'
  | 'ocean'
  | 'nature'
  | 'animals'
  | 'whispers'
  | 'asmr'
  | 'music'
  | 'binaural'
  | 'lucid'
  | 'noise'
  | 'ambient'
  | 'camping'

export type NoiseColor = 'white' | 'pink' | 'brown' | 'green'

export type SoundSource =
  | { kind: 'synth'; generator: NoiseColor }
  | { kind: 'file'; src: string; loopStart?: number; loopEnd?: number }

export interface LicenseRef {
  spdx: string
  sourceName: string
  author?: string
  url?: string
}

export interface Sound {
  id: string
  name: Record<Locale, string>
  category: Category
  source: SoundSource
  license: LicenseRef
}

export type OrbitMode = 'random' | 'fixed' | 'steered'

export type OrbitShape = { kind: 'circle' } | { kind: 'ellipse'; eccentricity: number; tilt: number }

export interface Orbit {
  mode: OrbitMode
  shape: OrbitShape
  speed: number
  direction: 1 | -1
}

export interface Placement {
  id: string
  soundId: string
  radius: number
  angle: number
  orbit: Orbit
  locked: boolean
  volume: number
  muted?: boolean
}

export interface Mix {
  id: string
  name: string
  placements: Placement[]
  masterVolume: number
  updatedAt: number
}
