import { getPlan } from '../plan'

/**
 * Pure gating rule for whether a banner should render — free tier carries ads, every paid tier
 * removes them (roadmap-v030.md §2/§3).
 */
export function shouldShowBanner(planIsFree: boolean): boolean {
  return planIsFree
}

/**
 * Wired to the real plan store (src/plan/B2). Whoever mounts the banner UI (src/app — outside
 * this module's ownership) can call this directly instead of reading the plan store itself.
 */
export function shouldShowBannerNow(): boolean {
  return shouldShowBanner(getPlan() === 'free')
}
