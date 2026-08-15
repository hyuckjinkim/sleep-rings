import { describe, expect, it } from 'vitest'
import { hideBanner, initAds, isAdsEnabled, showBanner } from './ads'

// jsdom has no `window.Capacitor` bridge, so Capacitor.isNativePlatform() is false here exactly
// like a real web build — the same guard this module and src/mobile both rely on.
describe('ads (web / non-Capacitor)', () => {
  it('is disabled before and after initAds()', async () => {
    expect(isAdsEnabled()).toBe(false)
    await initAds()
    expect(isAdsEnabled()).toBe(false)
  })

  it('no-ops showBanner/hideBanner without throwing', async () => {
    await expect(showBanner('bottom')).resolves.toBeUndefined()
    await expect(hideBanner()).resolves.toBeUndefined()
  })
})
