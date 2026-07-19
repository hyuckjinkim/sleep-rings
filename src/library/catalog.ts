// Minimal placeholder catalog so the mixer palette has something to drag. Full 17-category
// library is sound-pipeline's job (task #8); this just unblocks UI dev. File paths for
// 'file' sources are aspirational — no audio assets exist yet.
import type { Category, Locale, Sound } from '../data/types'

export function soundName(soundId: string, locale: Locale): string {
  return catalog.find((s) => s.id === soundId)?.name[locale] ?? soundId
}

export function soundCategory(soundId: string): Category | undefined {
  return catalog.find((s) => s.id === soundId)?.category
}

// 'file' sounds below have no real asset yet (sound-pipeline task #8 pending manual
// download) — loading them would 404. Keep them visible in the palette but locked.
const UNAVAILABLE_IDS = new Set(['garden-rain', 'seaside', 'night-stream'])

export function isAvailable(soundId: string): boolean {
  return !UNAVAILABLE_IDS.has(soundId)
}

export const catalog: Sound[] = [
  {
    id: 'noise-white',
    name: { ko: '화이트 노이즈', en: 'White Noise' },
    category: 'noise',
    source: { kind: 'synth', generator: 'white' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'noise-pink',
    name: { ko: '핑크 노이즈', en: 'Pink Noise' },
    category: 'noise',
    source: { kind: 'synth', generator: 'pink' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'noise-brown',
    name: { ko: '브라운 노이즈', en: 'Brown Noise' },
    category: 'noise',
    source: { kind: 'synth', generator: 'brown' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'noise-green',
    name: { ko: '그린 노이즈', en: 'Green Noise' },
    category: 'noise',
    source: { kind: 'synth', generator: 'green' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'garden-rain',
    name: { ko: '정원의 비', en: 'Garden Rain' },
    category: 'rain',
    source: { kind: 'file', src: 'sounds/garden-rain.m4a' },
    license: { spdx: 'CC0-1.0', sourceName: 'Freesound' },
  },
  {
    id: 'seaside',
    name: { ko: '해변', en: 'Seaside' },
    category: 'ocean',
    source: { kind: 'file', src: 'sounds/seaside.m4a' },
    license: { spdx: 'CC0-1.0', sourceName: 'Freesound' },
  },
  {
    id: 'night-stream',
    name: { ko: '밤의 시냇물', en: 'Night Stream' },
    category: 'water',
    source: { kind: 'file', src: 'sounds/night-stream.m4a' },
    license: { spdx: 'CC0-1.0', sourceName: 'Freesound' },
  },
]
