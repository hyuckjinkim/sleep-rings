// M1 regression (see adsLifecycle.ts's header comment): a showBanner() call made while
// initAds() is still pending must not be dropped — it must fire once init resolves.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const initAds = vi.fn()
const showBanner = vi.fn()
const hideBanner = vi.fn()

vi.mock('../ads', () => ({
  initAds: (...args: unknown[]) => initAds(...args),
  showBanner: (...args: unknown[]) => showBanner(...args),
  hideBanner: (...args: unknown[]) => hideBanner(...args),
}))

beforeEach(() => {
  vi.resetModules()
  initAds.mockReset()
  showBanner.mockReset()
  hideBanner.mockReset()
})

describe('showBannerWhenReady', () => {
  it('never shows the banner while initAds() is still pending, but does show it once init resolves', async () => {
    let resolveInit!: () => void
    initAds.mockReturnValue(new Promise<void>((resolve) => { resolveInit = resolve }))

    const { showBannerWhenReady } = await import('./adsLifecycle')

    const call = showBannerWhenReady(true) // fired before initAds() has resolved — the old bug's trigger
    await Promise.resolve()
    await Promise.resolve()
    expect(showBanner).not.toHaveBeenCalled()

    resolveInit()
    await call

    expect(showBanner).toHaveBeenCalledWith('bottom')
  })

  it('reuses one initAds() call across repeated show/hide requests', async () => {
    initAds.mockResolvedValue(undefined)
    const { showBannerWhenReady } = await import('./adsLifecycle')

    await showBannerWhenReady(true)
    await showBannerWhenReady(false)

    expect(initAds).toHaveBeenCalledTimes(1)
    expect(showBanner).toHaveBeenCalledWith('bottom')
    expect(hideBanner).toHaveBeenCalledTimes(1)
  })
})
