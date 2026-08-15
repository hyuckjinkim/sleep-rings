/**
 * Pure gating rule for whether a banner should render. Plan system (B2) doesn't exist yet — the
 * lead wires the real planIsFree value into this once it lands. Default (called with `true`) keeps
 * ads on, matching "free tier carries ads" from roadmap-v030.md §2/§3.
 */
export function shouldShowBanner(planIsFree: boolean): boolean {
  return planIsFree
}
