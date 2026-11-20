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

// Covers every pre-rendered-buffer synth generator noise.ts knows how to bake, not just literal
// noise "colors" — rain/wind/waves/stream ride the same synth pipeline (E3 §7). B1 (v0.3.0)
// added 8 more: campfire/fan/thunder/brook/umbrella-rain/lofi/heartbeat/womb. Premium synth batch
// (v0.3.1) added 6 more: birds/train/singing-bowl/crickets/blizzard/city-rain.
export type NoiseColor =
  | 'white'
  | 'pink'
  | 'brown'
  | 'green'
  | 'rain'
  | 'wind'
  | 'waves'
  | 'stream'
  | 'campfire'
  | 'fan'
  | 'thunder'
  | 'brook'
  | 'umbrella-rain'
  | 'lofi'
  | 'heartbeat'
  | 'womb'
  | 'birds'
  | 'train'
  | 'singing-bowl'
  | 'crickets'
  | 'blizzard'
  | 'city-rain'

export type SoundSource =
  | { kind: 'synth'; generator: NoiseColor }
  | { kind: 'binaural'; carrierHz: number; beatHz: number }
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
  /** Angle-based gain modulation ("volume swells as it passes a point"). Optional and off by
   * default — undefined behaves exactly like before (no persistence migration needed).
   * depth: 0..1 modulation strength. phase: radians, defaults to 0 if omitted. */
  volumeCurve?: { depth: number; phase?: number }
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
  /** Noise tone tilt, -1 (darker) .. 1 (brighter); 0/undefined = untouched. Paid; noise sounds only. */
  tone?: number
}

export interface Mix {
  id: string
  name: string
  placements: Placement[]
  masterVolume: number
  updatedAt: number
}
