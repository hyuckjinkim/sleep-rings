import { beforeEach, describe, expect, it } from 'vitest'
import { shouldShowBanner, shouldShowBannerNow } from './planGate'
import { usePlanStore } from '../plan'

describe('shouldShowBanner', () => {
  it('shows the banner on a free plan', () => {
    expect(shouldShowBanner(true)).toBe(true)
  })

  it('hides the banner off a free plan', () => {
    expect(shouldShowBanner(false)).toBe(false)
  })
})

describe('shouldShowBannerNow', () => {
  beforeEach(() => {
    usePlanStore.setState({ plan: 'free' })
  })

  it('reflects the real plan store: on for free', () => {
    expect(shouldShowBannerNow()).toBe(true)
  })

  it('reflects the real plan store: off for any paid tier', () => {
    usePlanStore.getState().setPlan('tier2000')
    expect(shouldShowBannerNow()).toBe(false)
  })
})
