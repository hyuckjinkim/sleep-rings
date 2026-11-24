// Pure gating rules — no React, no storage. roadmap-v030.md §2 / monetization.md §4.
import type { Plan } from './types'

const PLAN_RANK: Record<Plan, number> = { free: 0, tier2000: 1, tier5000: 2 }

const MAX_LAYERS: Record<Plan, number> = { free: 3, tier2000: 5, tier5000: Infinity }
const MAX_PRESETS: Record<Plan, number> = { free: 3, tier2000: 10, tier5000: Infinity }

export function maxLayers(plan: Plan): number {
  return MAX_LAYERS[plan]
}

export function maxPresets(plan: Plan): number {
  return MAX_PRESETS[plan]
}

/** Exposed so purchaseAdapter.ts can rank entitlements without a second copy of PLAN_RANK. */
export function planRank(plan: Plan): number {
  return PLAN_RANK[plan]
}

// Per-sound minimum required plan. roadmap-v030.md §2 splits the catalog (12 free / +4 at 2,000원
// / +3 binaural at 5,000원 = 19 total). Kept here rather than as a field on catalog.ts's Sound
// (data/types.ts) so the shared catalog stays plan-agnostic — this is the one file that knows
// about tiers, and adding a sound to catalog.ts can't silently drift the free-tier ratio without
// someone also touching this map.
//
// Free 12/19 = 63%, matching the roadmap's target ratio (owner policy: "무료에서 최대한 많이").
// Split of B1's 8 new synth sounds: the 4 broadest-appeal ambience sounds (campfire/fan/thunder/
// brook) stay free alongside the original 8; the more niche/ASMR-leaning 4 (rain-umbrella/lofi/
// heartbeat/womb) are the 2,000원 differentiator.
const SOUND_TIER: Record<string, Plan> = {
  // v0.3.1 premium synth batch. birds/crickets/singing-bowl are niche/ASMR-leaning (same call as
  // heartbeat/womb in the B1 batch) so they sit in the top (5,000원) tier alongside binaural.
  // train/blizzard/city-rain are general ambience like the existing free eight.
  birds: 'tier5000',
  crickets: 'tier5000',
  'singing-bowl': 'tier5000',
  train: 'free',
  blizzard: 'free',
  'city-rain': 'free',
  'noise-white': 'free',
  'noise-pink': 'free',
  'noise-brown': 'free',
  'noise-green': 'free',
  'nature-rain': 'free',
  'nature-wind': 'free',
  'nature-waves': 'free',
  'nature-stream': 'free',
  campfire: 'free',
  fan: 'free',
  thunder: 'free',
  'nature-brook': 'free',
  'rain-umbrella': 'tier2000',
  'ambient-lofi': 'tier2000',
  heartbeat: 'tier2000',
  womb: 'tier2000',
  'binaural-delta': 'tier5000',
  'binaural-theta': 'tier5000',
  'binaural-alpha': 'tier5000',
  // Future file-based premium library (formerly roadmap §2's 10,000원 row; that tier was dropped
  // 2026-11-24, so these join the 5,000원 tier). Currently asset-unavailable regardless of plan
  // (catalog.ts's isAvailable()) — this just records the intended tier for when those assets land.
  'garden-rain': 'tier5000',
  seaside: 'tier5000',
  'night-stream': 'tier5000',
}

/** Unmapped ids (a future catalog addition someone forgets to tier) default to 'free' — per the
 * owner's "무료 최대" policy, a missing entry should never accidentally lock content. */
export function requiredPlan(soundId: string): Plan {
  return SOUND_TIER[soundId] ?? 'free'
}

export function canUseSound(soundId: string, plan: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[requiredPlan(soundId)]
}

/** Paid "depth" controls on top of a sound (docs/research/feature-candidates.md: safety and basics
 * stay free, depth is paid). Same rank check as sounds; the lowest paid tier unlocks them. */
export type PaidFeature = 'tone' | 'variation'

const FEATURE_TIER: Record<PaidFeature, Exclude<Plan, 'free'>> = {
  tone: 'tier2000',
  variation: 'tier2000',
}

export function featurePlan(feature: PaidFeature): Exclude<Plan, 'free'> {
  return FEATURE_TIER[feature]
}

export function canUseFeature(feature: PaidFeature, plan: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_TIER[feature]]
}
