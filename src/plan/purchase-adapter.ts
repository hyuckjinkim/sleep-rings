import type { Plan } from './types'
import { usePlanStore } from './store'

/**
 * Real payment SDK connection point (docs/plan-tiers.md "결제 SDK 연결 지점"): swap
 * localMockPurchaseAdapter for one wrapping RevenueCat's `@revenuecat/purchases-capacitor`
 * (monetization.md §5-1 recommendation). Same shape — purchase()/restore() become actual
 * StoreKit/Play Billing calls, getPlan() reads RevenueCat's cached entitlement instead of
 * localStorage. Not installed here: roadmap-v030.md §2 defers real store product registration
 * until 10,000원 tier content exists.
 */
export interface PurchaseAdapter {
  getPlan(): Promise<Plan>
  purchase(plan: Exclude<Plan, 'free'>): Promise<Plan>
  restore(): Promise<Plan>
}

/**
 * Dev/QA + placeholder implementation: no network, no receipt validation. "Purchase" just flips
 * the plan store (and its localStorage backing).
 *
 * QA plan switch: `localStorage.setItem('so.plan', 'tier5000')` then reload — no settings-screen
 * toggle exists (src/app is outside this module's scope), so the storage key IS the mechanism.
 * That makes it invisible in production UI by construction, not by hiding a control.
 */
export const localMockPurchaseAdapter: PurchaseAdapter = {
  async getPlan() {
    return usePlanStore.getState().plan
  },
  async purchase(plan) {
    usePlanStore.getState().setPlan(plan)
    return plan
  },
  async restore() {
    return usePlanStore.getState().plan
  },
}
