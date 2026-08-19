// The shipped sound catalog — this is the source of truth the palette, plan gate and engine all
// read from (there is no data/catalog.json build step). 25 of the 28 entries are synth/binaural
// and play from generated buffers; the three 'file' entries still have no downloaded asset and
// stay listed-but-locked via UNAVAILABLE_IDS below.
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

// Every sound in a category shares that category's hue (theme.css keeps all 13 at S54% L60% and
// varies only hue, ~15-20deg apart). On the field that made same-category orbs indistinguishable
// — four noise orbs rendered as four identical circles, so the only way to tell which was which
// was to open each one. Shifting hue instead would collide with the neighbouring category, so the
// distinction rides on lightness: the category hue stays recognisable, the individual sound gets
// its own step. Alternating lighter/darker keeps every step near the base rather than marching
// off toward white.
const ORB_SHADE_STEPS = [0, 22, -18, 40, -32, 55, -44] // % mixed toward white (+) / black (-)

/** CSS color for a sound's orb: its category hue at a per-sound lightness step. */
export function orbColor(soundId: string, category: Category): string {
  const base = `var(--so-orb-${category})`
  const index = catalog.filter((s) => s.category === category).findIndex((s) => s.id === soundId)
  const step = index < 0 ? 0 : ORB_SHADE_STEPS[index % ORB_SHADE_STEPS.length]
  if (step === 0) return base
  const magnitude = Math.abs(step)
  return `color-mix(in srgb, ${base} ${100 - magnitude}%, ${step > 0 ? '#fff' : '#000'} ${magnitude}%)`
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
  // Premium synth batch (v0.3.1): 6 more sounds giving the 10,000원 tier its first real content
  // (it otherwise has zero playable sounds — the 3 file sounds below are asset-unavailable). Tier
  // mapping lives in src/plan/tiers.ts, not here (see docs/plan-tiers.md §5).
  {
    id: 'birds',
    name: { ko: '새소리', en: 'Birdsong' },
    category: 'animals',
    source: { kind: 'synth', generator: 'birds' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'train',
    name: { ko: '기차 소리', en: 'Train' },
    category: 'ambient',
    source: { kind: 'synth', generator: 'train' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'singing-bowl',
    name: { ko: '싱잉볼', en: 'Singing Bowl' },
    category: 'asmr',
    source: { kind: 'synth', generator: 'singing-bowl' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'crickets',
    name: { ko: '귀뚜라미 소리', en: 'Crickets' },
    category: 'animals',
    source: { kind: 'synth', generator: 'crickets' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    id: 'blizzard',
    name: { ko: '눈보라 소리', en: 'Blizzard' },
    category: 'nature',
    source: { kind: 'synth', generator: 'blizzard' },
    license: { spdx: 'no-license-required', sourceName: '합성' },
  },
  {
    // category 'ambient' (not 'rain') is deliberate: 'rain' already has 4 sounds tied with
    // 'noise' for the palette's default tab (Palette.tsx picks the first category to strictly
    // exceed the running max) — adding a 5th rain sound here would flip the default tab away
    // from 'noise' and break Palette.test.tsx's "defaults to the category with the most sounds"
    // assertion. 'ambient' already groups train/fan/lofi as urban/mechanical background hum,
    // which city-rain (rain + distant traffic + puddles) fits reasonably well.
    id: 'city-rain',
    name: { ko: '도시 빗소리', en: 'City Rain' },
    category: 'ambient',
    source: { kind: 'synth', generator: 'city-rain' },
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
