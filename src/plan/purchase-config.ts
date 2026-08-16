import type { Plan } from './types'

/**
 * Real-key swap point (docs/plan-tiers.md §3/§7) — RevenueCat public SDK keys go here once a
 * RevenueCat project + store products exist (owner manual steps, §7). These are public/client
 * keys (safe to ship, comparable to a Stripe *publishable* key — RevenueCat's own docs class them
 * this way), not secrets, but they still gate real StoreKit/Play Billing calls: leave both blank
 * and purchase-adapter.ts's getPurchaseAdapter() falls back to localMockPurchaseAdapter, same
 * fail-safe shape as src/ads/ad-config.ts's useTestAds. No `as const` here (unlike ad-config.ts) —
 * purchase-adapter.test.ts mutates these strings to exercise the fallback without a Capacitor
 * bridge in jsdom.
 */
export const PURCHASE_CONFIG: { revenueCatApiKey: { android: string; ios: string } } = {
  revenueCatApiKey: {
    android: '',
    ios: '',
  },
}

/**
 * RevenueCat identifier -> our Plan, shared by both offering packages and entitlements
 * (docs/plan-tiers.md §3). Configure the RevenueCat dashboard so each subscription's *package*
 * identifier and its *entitlement* identifier both match one of these keys — one map covers both
 * getOfferings() (package -> Plan, to know what to sell) and getCustomerInfo() (entitlement ->
 * Plan, to know what the user already owns), so the two can't drift apart.
 */
export const TIER_PLAN: Record<string, Exclude<Plan, 'free'>> = {
  tier2000: 'tier2000',
  tier5000: 'tier5000',
  tier10000: 'tier10000',
}

/** Listed prices (docs/plan-tiers.md §1) shown when live offerings haven't loaded yet — no
    network, no store connection, or purchases aren't available at all (web/no key). */
export const FALLBACK_PRICE: Record<Exclude<Plan, 'free'>, string> = {
  tier2000: '₩2,000',
  tier5000: '₩5,000',
  tier10000: '₩10,000',
}
