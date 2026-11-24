import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const isNativePlatform = vi.fn(() => false)
const getPlatform = vi.fn(() => 'android')
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform, getPlatform },
}))

const configure = vi.fn().mockResolvedValue(undefined)
const getOfferings = vi.fn()
const purchasePackage = vi.fn()
const restorePurchases = vi.fn()
const getCustomerInfo = vi.fn()
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: { configure, getOfferings, purchasePackage, restorePurchases, getCustomerInfo },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1' },
}))

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  isNativePlatform.mockReturnValue(false)
  getPlatform.mockReturnValue('android')
  configure.mockClear()
  getOfferings.mockReset()
  purchasePackage.mockReset()
  restorePurchases.mockReset()
  getCustomerInfo.mockReset()
})

afterEach(async () => {
  // purchaseConfig.ts's keys are mutated by the "key configured" tests below — reset so other
  // test files (and store.test.ts) see the original empty-key state.
  const { PURCHASE_CONFIG } = await import('./purchaseConfig')
  PURCHASE_CONFIG.revenueCatApiKey.android = ''
  PURCHASE_CONFIG.revenueCatApiKey.ios = ''
})

function customerInfoWith(entitlementIds: string[]) {
  const active = Object.fromEntries(entitlementIds.map((id) => [id, {}]))
  return { entitlements: { active } }
}

describe('getPurchaseAdapter / isPurchaseAvailable — key/native fallback', () => {
  it('falls back to the mock off-native even with a key configured', async () => {
    const { PURCHASE_CONFIG } = await import('./purchaseConfig')
    PURCHASE_CONFIG.revenueCatApiKey.android = 'test_key'
    isNativePlatform.mockReturnValue(false)
    const { getPurchaseAdapter, isPurchaseAvailable, localMockPurchaseAdapter } = await import('./purchaseAdapter')
    expect(isPurchaseAvailable()).toBe(false)
    expect(getPurchaseAdapter()).toBe(localMockPurchaseAdapter)
  })

  it('falls back to the mock on native without a key (today\'s build state)', async () => {
    isNativePlatform.mockReturnValue(true)
    const { getPurchaseAdapter, isPurchaseAvailable, localMockPurchaseAdapter } = await import('./purchaseAdapter')
    expect(isPurchaseAvailable()).toBe(false)
    expect(getPurchaseAdapter()).toBe(localMockPurchaseAdapter)
  })

  it('picks the RevenueCat adapter only when native AND a key is configured', async () => {
    const { PURCHASE_CONFIG } = await import('./purchaseConfig')
    PURCHASE_CONFIG.revenueCatApiKey.android = 'test_key'
    isNativePlatform.mockReturnValue(true)
    const { getPurchaseAdapter, isPurchaseAvailable, localMockPurchaseAdapter } = await import('./purchaseAdapter')
    expect(isPurchaseAvailable()).toBe(true)
    expect(getPurchaseAdapter()).not.toBe(localMockPurchaseAdapter)
  })
})

describe('localMockPurchaseAdapter', () => {
  it('getOfferings lists both paid tiers at their listed prices', async () => {
    const { localMockPurchaseAdapter } = await import('./purchaseAdapter')
    const offerings = await localMockPurchaseAdapter.getOfferings()
    expect(offerings).toEqual([
      { plan: 'tier2000', priceString: '₩2,000' },
      { plan: 'tier5000', priceString: '₩5,000' },
    ])
  })

  it('purchase() and restore() flip the plan store without any network call', async () => {
    const { localMockPurchaseAdapter } = await import('./purchaseAdapter')
    expect(await localMockPurchaseAdapter.purchase('tier5000')).toBe('tier5000')
    expect(await localMockPurchaseAdapter.getPlan()).toBe('tier5000')
    expect(await localMockPurchaseAdapter.restore()).toBe('tier5000')
    expect(configure).not.toHaveBeenCalled()
  })
})

describe('RevenueCat entitlement -> Plan mapping (via getPlan)', () => {
  beforeEach(async () => {
    const { PURCHASE_CONFIG } = await import('./purchaseConfig')
    PURCHASE_CONFIG.revenueCatApiKey.android = 'test_key'
    isNativePlatform.mockReturnValue(true)
  })

  it('maps no active entitlements to free', async () => {
    getCustomerInfo.mockResolvedValue({ customerInfo: customerInfoWith([]) })
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    expect(await getPurchaseAdapter().getPlan()).toBe('free')
  })

  it('maps a known entitlement id straight through', async () => {
    getCustomerInfo.mockResolvedValue({ customerInfo: customerInfoWith(['tier2000']) })
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    expect(await getPurchaseAdapter().getPlan()).toBe('tier2000')
  })

  it('picks the highest-ranked plan when multiple entitlements are active', async () => {
    getCustomerInfo.mockResolvedValue({ customerInfo: customerInfoWith(['tier2000', 'tier5000']) })
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    expect(await getPurchaseAdapter().getPlan()).toBe('tier5000')
  })

  it('ignores unknown entitlement ids (defaults to free)', async () => {
    getCustomerInfo.mockResolvedValue({ customerInfo: customerInfoWith(['some_other_entitlement']) })
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    expect(await getPurchaseAdapter().getPlan()).toBe('free')
  })

  it('configures the SDK exactly once across repeated calls', async () => {
    getCustomerInfo.mockResolvedValue({ customerInfo: customerInfoWith([]) })
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    const adapter = getPurchaseAdapter()
    await adapter.getPlan()
    await adapter.getPlan()
    expect(configure).toHaveBeenCalledTimes(1)
    expect(configure).toHaveBeenCalledWith({ apiKey: 'test_key' })
  })
})

describe('RevenueCat purchase()/restore() — success, cancel, failure', () => {
  beforeEach(async () => {
    const { PURCHASE_CONFIG } = await import('./purchaseConfig')
    PURCHASE_CONFIG.revenueCatApiKey.android = 'test_key'
    isNativePlatform.mockReturnValue(true)
  })

  function offeringWithPackage(identifier: string) {
    return {
      current: { availablePackages: [{ identifier, product: { priceString: '₩5,000' } }] },
    }
  }

  it('purchase() resolves the plan and updates the plan store', async () => {
    getOfferings.mockResolvedValue(offeringWithPackage('tier5000'))
    purchasePackage.mockResolvedValue({ customerInfo: customerInfoWith(['tier5000']) })
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    const { usePlanStore } = await import('./store')
    const resolved = await getPurchaseAdapter().purchase('tier5000')
    expect(resolved).toBe('tier5000')
    expect(usePlanStore.getState().plan).toBe('tier5000')
  })

  it('purchase() throws when no offering package matches the requested plan', async () => {
    getOfferings.mockResolvedValue(offeringWithPackage('tier2000'))
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    await expect(getPurchaseAdapter().purchase('tier5000')).rejects.toThrow(/no RevenueCat package/)
    expect(purchasePackage).not.toHaveBeenCalled()
  })

  it('isPurchaseCancelled() recognizes RevenueCat\'s cancellation error code', async () => {
    const { isPurchaseCancelled } = await import('./purchaseAdapter')
    expect(isPurchaseCancelled({ code: '1' })).toBe(true)
    expect(isPurchaseCancelled({ code: '2' })).toBe(false)
    expect(isPurchaseCancelled(new Error('network down'))).toBe(false)
  })

  it('purchase() rejects on a store failure without touching the plan store', async () => {
    getOfferings.mockResolvedValue(offeringWithPackage('tier5000'))
    purchasePackage.mockRejectedValue({ code: '2', message: 'store problem' })
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    const { usePlanStore } = await import('./store')
    const before = usePlanStore.getState().plan
    await expect(getPurchaseAdapter().purchase('tier5000')).rejects.toBeTruthy()
    expect(usePlanStore.getState().plan).toBe(before)
  })

  it('restore() resolves the restored plan and updates the plan store', async () => {
    restorePurchases.mockResolvedValue({ customerInfo: customerInfoWith(['tier5000']) })
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    const { usePlanStore } = await import('./store')
    expect(await getPurchaseAdapter().restore()).toBe('tier5000')
    expect(usePlanStore.getState().plan).toBe('tier5000')
  })

  it('getOfferings() falls back to the listed-price catalog when the current offering has no matching packages', async () => {
    getOfferings.mockResolvedValue({ current: { availablePackages: [{ identifier: 'unmapped', product: { priceString: '$1' } }] } })
    const { getPurchaseAdapter } = await import('./purchaseAdapter')
    const offerings = await getPurchaseAdapter().getOfferings()
    expect(offerings).toEqual([
      { plan: 'tier2000', priceString: '₩2,000' },
      { plan: 'tier5000', priceString: '₩5,000' },
    ])
  })
})
