import { beforeEach, describe, it, expect, vi } from 'vitest'

const impact = vi.fn().mockResolvedValue(undefined)
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact },
  ImpactStyle: { Light: 'LIGHT' },
}))

beforeEach(() => {
  localStorage.clear()
  impact.mockClear()
})

describe('haptics', () => {
  it('fires a light impact by default (enabled by default)', async () => {
    const { hapticTap, isHapticsEnabled } = await import('./haptics')
    expect(isHapticsEnabled()).toBe(true)
    hapticTap()
    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' })
  })

  it('does nothing once the user turns haptics off', async () => {
    const { hapticTap, setHapticsEnabled } = await import('./haptics')
    setHapticsEnabled(false)
    hapticTap()
    expect(impact).not.toHaveBeenCalled()
  })

  it('swallows a rejected impact() (unsupported platform) without throwing', async () => {
    impact.mockRejectedValueOnce(new Error('unsupported'))
    const { hapticTap } = await import('./haptics')
    expect(() => hapticTap()).not.toThrow()
  })
})
