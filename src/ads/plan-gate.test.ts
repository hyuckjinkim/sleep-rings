import { describe, expect, it } from 'vitest'
import { shouldShowBanner } from './plan-gate'

describe('shouldShowBanner', () => {
  it('shows the banner on a free plan', () => {
    expect(shouldShowBanner(true)).toBe(true)
  })

  it('hides the banner off a free plan', () => {
    expect(shouldShowBanner(false)).toBe(false)
  })
})
