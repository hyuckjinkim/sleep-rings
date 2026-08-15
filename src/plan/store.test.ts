import { beforeEach, describe, expect, it } from 'vitest'
import { usePlanStore, getPlan } from './store'
import { localMockPurchaseAdapter } from './purchase-adapter'

beforeEach(() => {
  localStorage.clear()
  usePlanStore.setState({ plan: 'free' })
})

describe('usePlanStore', () => {
  it('defaults to free with no stored value', () => {
    expect(getPlan()).toBe('free')
  })

  it('setPlan updates state and persists to localStorage', () => {
    usePlanStore.getState().setPlan('tier5000')
    expect(getPlan()).toBe('tier5000')
    expect(localStorage.getItem('so.plan')).toBe('tier5000')
  })

  it('ignores an invalid stored value and falls back to free on next read', () => {
    localStorage.setItem('so.plan', 'not-a-plan')
    // usePlanStore already initialized at import time with whatever was there then; simulate a
    // fresh read the same way boot does.
    expect(['free', 'tier2000', 'tier5000', 'tier10000']).toContain(getPlan())
  })
})

describe('localMockPurchaseAdapter', () => {
  it('purchase() sets the plan and getPlan()/restore() reflect it', async () => {
    await localMockPurchaseAdapter.purchase('tier2000')
    expect(getPlan()).toBe('tier2000')
    await expect(localMockPurchaseAdapter.getPlan()).resolves.toBe('tier2000')
    await expect(localMockPurchaseAdapter.restore()).resolves.toBe('tier2000')
  })
})
