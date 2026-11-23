import { beforeEach, describe, it, expect, vi } from 'vitest'

describe('wake-lock', () => {
  beforeEach(() => {
    vi.resetModules()
    // jsdom has no wakeLock — start every test from that unsupported baseline.
    // @ts-expect-error test-only cleanup of a property jsdom never defines
    delete navigator.wakeLock
  })

  it('no-ops when navigator.wakeLock is unsupported (jsdom baseline)', async () => {
    const { acquireWakeLock, releaseWakeLock } = await import('./wakeLock')
    await expect(acquireWakeLock()).resolves.toBeUndefined()
    expect(() => releaseWakeLock()).not.toThrow()
  })

  it('requests a lock when the API is available, and releases it', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const sentinel = { release, addEventListener: vi.fn() }
    const request = vi.fn().mockResolvedValue(sentinel)
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })

    const { acquireWakeLock, releaseWakeLock } = await import('./wakeLock')
    await acquireWakeLock()
    expect(request).toHaveBeenCalledWith('screen')

    // second acquire while already held must not request a second sentinel
    await acquireWakeLock()
    expect(request).toHaveBeenCalledTimes(1)

    releaseWakeLock()
    expect(release).toHaveBeenCalled()
  })

  it('swallows a request() rejection (permission denied / document hidden) without throwing', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })

    const { acquireWakeLock } = await import('./wakeLock')
    await expect(acquireWakeLock()).resolves.toBeUndefined()
  })
})
