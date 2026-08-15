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
    id: 'nature-rain',
    name: { ko: '빗소리', en: 'Rain' },
    category: 'rain',
    source: { kind: 'synth', generator: 'rain' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'nature-wind',
    name: { ko: '바람 소리', en: 'Wind' },
    category: 'nature',
    source: { kind: 'synth', generator: 'wind' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'nature-waves',
    name: { ko: '파도 소리', en: 'Waves' },
    category: 'ocean',
    source: { kind: 'synth', generator: 'waves' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'nature-stream',
    name: { ko: '시냇물 소리', en: 'Stream' },
    category: 'water',
    source: { kind: 'synth', generator: 'stream' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  // B1 (v0.3.0): 8 synth sounds, ids chosen to match assets/sound-icons/*.svg filenames where a
  // dedicated icon exists (campfire/fan/thunder/heartbeat) — see src/icons/SoundIcon.tsx, which
  // resolves by exact id match first. The other 4 have no dedicated icon and fall back to their
  // category's representative icon (water→stream, rain→rain, ambient→ambient, asmr→asmr).
  {
    id: 'campfire',
    name: { ko: '캠프파이어', en: 'Campfire' },
    category: 'camping',
    source: { kind: 'synth', generator: 'campfire' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'fan',
    name: { ko: '선풍기 소리', en: 'Fan Hum' },
    category: 'ambient',
    source: { kind: 'synth', generator: 'fan' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'thunder',
    name: { ko: '천둥 소리', en: 'Thunder' },
    category: 'rain',
    source: { kind: 'synth', generator: 'thunder' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'nature-brook',
    name: { ko: '여울 소리', en: 'Brook' },
    category: 'water',
    source: { kind: 'synth', generator: 'brook' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'rain-umbrella',
    name: { ko: '우산 위 빗소리', en: 'Rain on Umbrella' },
    category: 'rain',
    source: { kind: 'synth', generator: 'umbrella-rain' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'ambient-lofi',
    name: { ko: '로우파이 험', en: 'Lo-fi Hum' },
    category: 'ambient',
    source: { kind: 'synth', generator: 'lofi' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'heartbeat',
    name: { ko: '심장박동', en: 'Heartbeat' },
    category: 'asmr',
    source: { kind: 'synth', generator: 'heartbeat' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'womb',
    name: { ko: '자궁 소리', en: 'Womb' },
    category: 'asmr',
    source: { kind: 'synth', generator: 'womb' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'binaural-delta',
    name: { ko: '바이노럴 델타 (깊은 수면)', en: 'Binaural Delta (Deep Sleep)' },
    category: 'binaural',
    source: { kind: 'binaural', carrierHz: 200, beatHz: 2 },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'binaural-theta',
    name: { ko: '바이노럴 세타 (이완)', en: 'Binaural Theta (Relax)' },
    category: 'binaural',
    source: { kind: 'binaural', carrierHz: 200, beatHz: 6 },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'binaural-alpha',
    name: { ko: '바이노럴 알파 (안정)', en: 'Binaural Alpha (Calm)' },
    category: 'binaural',
    source: { kind: 'binaural', carrierHz: 200, beatHz: 10 },
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
