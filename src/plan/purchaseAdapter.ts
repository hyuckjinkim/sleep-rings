import { Capacitor } from '@capacitor/core'
import { Purchases, PURCHASES_ERROR_CODE } from '@revenuecat/purchases-capacitor'
import type { CustomerInfo, PurchasesError } from '@revenuecat/purchases-capacitor'
import type { Plan } from './types'
import { usePlanStore } from './store'
import { planRank } from './tiers'
import { FALLBACK_PRICE, PURCHASE_CONFIG, TIER_PLAN } from './purchaseConfig'

export interface PurchaseOffering {
  plan: Exclude<Plan, 'free'>
  priceString: string
}

export interface PurchaseAdapter {
  getPlan(): Promise<Plan>
  getOfferings(): Promise<PurchaseOffering[]>
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
  async getOfferings() {
    return (Object.keys(TIER_PLAN) as Array<keyof typeof TIER_PLAN>).map((id) => {
      const plan = TIER_PLAN[id]
      return { plan, priceString: FALLBACK_PRICE[plan] }
    })
  },
  async purchase(plan) {
    usePlanStore.getState().setPlan(plan)
    return plan
  },
  async restore() {
    return usePlanStore.getState().plan
  },
}

function planFromCustomerInfo(info: CustomerInfo): Plan {
  let best: Plan = 'free'
  for (const entitlementId of Object.keys(info.entitlements.active)) {
    const plan = TIER_PLAN[entitlementId]
    if (plan && planRank(plan) > planRank(best)) best = plan
  }
  return best
}

/** True for a RevenueCat "user cancelled the purchase" error — not a real failure, so the UI
    should just close quietly instead of showing an error toast. */
export function isPurchaseCancelled(err: unknown): boolean {
  return (err as Partial<PurchasesError>)?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
}

/**
 * Real StoreKit/Play Billing adapter via @revenuecat/purchases-capacitor. Only reached through
 * getPurchaseAdapter() below, which gates it on native + a configured API key — never construct
 * or call this directly off that gate (Purchases.configure() would throw with an empty apiKey).
 */
class RevenueCatPurchaseAdapter implements PurchaseAdapter {
  private configured = false

  private async ensureConfigured(): Promise<void> {
    if (this.configured) return
    const apiKey = Capacitor.getPlatform() === 'ios' ? PURCHASE_CONFIG.revenueCatApiKey.ios : PURCHASE_CONFIG.revenueCatApiKey.android
    await Purchases.configure({ apiKey })
    this.configured = true
  }

  async getPlan(): Promise<Plan> {
    await this.ensureConfigured()
    const { customerInfo } = await Purchases.getCustomerInfo()
    return planFromCustomerInfo(customerInfo)
  }

  async getOfferings(): Promise<PurchaseOffering[]> {
    await this.ensureConfigured()
    const offerings = await Purchases.getOfferings()
    const packages = offerings.current?.availablePackages ?? []
    const result: PurchaseOffering[] = []
    for (const pkg of packages) {
      const plan = TIER_PLAN[pkg.identifier]
      if (plan) result.push({ plan, priceString: pkg.product.priceString })
    }
    return result.length > 0 ? result : localMockPurchaseAdapter.getOfferings()
  }

  async purchase(plan: Exclude<Plan, 'free'>): Promise<Plan> {
    await this.ensureConfigured()
    const offerings = await Purchases.getOfferings()
    const pkg = offerings.current?.availablePackages.find((p) => TIER_PLAN[p.identifier] === plan)
    if (!pkg) {
      throw new Error(
        `[purchase] no RevenueCat package for plan "${plan}" — check the offering's package identifiers match purchaseConfig.ts's TIER_PLAN`,
      )
    }
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg })
    const resolved = planFromCustomerInfo(customerInfo)
    usePlanStore.getState().setPlan(resolved)
    return resolved
  }

  async restore(): Promise<Plan> {
    await this.ensureConfigured()
    const { customerInfo } = await Purchases.restorePurchases()
    const resolved = planFromCustomerInfo(customerInfo)
    usePlanStore.getState().setPlan(resolved)
    return resolved
  }
}

const revenueCatPurchaseAdapter: PurchaseAdapter = new RevenueCatPurchaseAdapter()

function hasRevenueCatKey(): boolean {
  const key = Capacitor.getPlatform() === 'ios' ? PURCHASE_CONFIG.revenueCatApiKey.ios : PURCHASE_CONFIG.revenueCatApiKey.android
  return key.length > 0
}

/** Whether a real purchase flow is reachable right now (native + key configured) — same idea as
    src/ads/ads.ts's isAdsEnabled(). The UI uses this to show a "준비 중" state instead of a
    purchase button; today (no key yet) this is always false, so today's build behavior is
    unchanged until the owner does docs/plan-tiers.md §7's manual steps. */
export function isPurchaseAvailable(): boolean {
  return Capacitor.isNativePlatform() && hasRevenueCatKey()
}

/** Adapter selection point (docs/plan-tiers.md §3): falls back to the local mock off-native or
    without a key, so nothing here changes current behavior until §7 is done. */
export function getPurchaseAdapter(): PurchaseAdapter {
  return isPurchaseAvailable() ? revenueCatPurchaseAdapter : localMockPurchaseAdapter
}
