import { describe, expect, it } from 'vitest'
import { canUseSound, maxLayers, maxPresets, requiredPlan } from './tiers'
import type { Plan } from './types'

const PLANS: Plan[] = ['free', 'tier2000', 'tier5000', 'tier10000']

describe('maxLayers', () => {
  it('increases monotonically with plan rank', () => {
    expect(maxLayers('free')).toBe(3)
    expect(maxLayers('tier2000')).toBe(5)
    expect(maxLayers('tier5000')).toBe(Infinity)
    expect(maxLayers('tier10000')).toBe(Infinity)
  })
})

describe('maxPresets', () => {
  it('increases monotonically with plan rank', () => {
    expect(maxPresets('free')).toBe(3)
    expect(maxPresets('tier2000')).toBe(10)
    expect(maxPresets('tier5000')).toBe(Infinity)
    expect(maxPresets('tier10000')).toBe(Infinity)
  })
})

describe('requiredPlan', () => {
  it('maps free-tier sounds to free', () => {
    expect(requiredPlan('noise-white')).toBe('free')
    expect(requiredPlan('campfire')).toBe('free')
  })

  it('maps 2,000원 sounds', () => {
    expect(requiredPlan('heartbeat')).toBe('tier2000')
    expect(requiredPlan('womb')).toBe('tier2000')
  })

  it('maps binaural sounds to 5,000원', () => {
    expect(requiredPlan('binaural-delta')).toBe('tier5000')
  })

  it('maps the future file-based library to 10,000원', () => {
    expect(requiredPlan('garden-rain')).toBe('tier10000')
  })

  it('defaults an unmapped id to free (never accidentally locks unknown content)', () => {
    expect(requiredPlan('some-future-sound')).toBe('free')
  })
})

describe('canUseSound', () => {
  it('a free-tier sound is usable on every plan', () => {
    for (const plan of PLANS) expect(canUseSound('noise-white', plan)).toBe(true)
  })

  it('a 2,000원 sound is locked on free, open from tier2000 up', () => {
    expect(canUseSound('heartbeat', 'free')).toBe(false)
    expect(canUseSound('heartbeat', 'tier2000')).toBe(true)
    expect(canUseSound('heartbeat', 'tier5000')).toBe(true)
    expect(canUseSound('heartbeat', 'tier10000')).toBe(true)
  })

  it('a binaural (5,000원) sound is locked below tier5000', () => {
    expect(canUseSound('binaural-delta', 'free')).toBe(false)
    expect(canUseSound('binaural-delta', 'tier2000')).toBe(false)
    expect(canUseSound('binaural-delta', 'tier5000')).toBe(true)
    expect(canUseSound('binaural-delta', 'tier10000')).toBe(true)
  })

  it('the future file-based library is locked below tier10000', () => {
    expect(canUseSound('garden-rain', 'tier5000')).toBe(false)
    expect(canUseSound('garden-rain', 'tier10000')).toBe(true)
  })
})
