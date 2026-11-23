import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import * as wakeLock from './wakeLock'

vi.mock('./wakeLock', () => ({
  acquireWakeLock: vi.fn().mockResolvedValue(undefined),
  releaseWakeLock: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.resetModules() // fresh store + cleared module-level idleTimer each test
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('screen-dim idle timer', () => {
  it('dims after the configured idle window with no activity', async () => {
    const { useScreenStore } = await import('./store')
    useScreenStore.getState().setDimAfterMinutes(5)
    expect(useScreenStore.getState().dimmed).toBe(false)

    vi.advanceTimersByTime(5 * 60_000)
    expect(useScreenStore.getState().dimmed).toBe(true)
    expect(wakeLock.releaseWakeLock).toHaveBeenCalled()
  })

  it('activity resets the idle countdown instead of letting it fire', async () => {
    const { useScreenStore } = await import('./store')
    useScreenStore.getState().setDimAfterMinutes(5)

    vi.advanceTimersByTime(4 * 60_000)
    useScreenStore.getState().noteActivity()
    vi.advanceTimersByTime(4 * 60_000) // 8 min of wall time, but the last 4 reset the clock
    expect(useScreenStore.getState().dimmed).toBe(false)

    vi.advanceTimersByTime(1 * 60_000) // now 5 min since the reset
    expect(useScreenStore.getState().dimmed).toBe(true)
  })

  it('activity while dimmed wakes the screen back up and re-acquires the lock', async () => {
    const { useScreenStore } = await import('./store')
    useScreenStore.getState().setDimAfterMinutes(5)
    vi.advanceTimersByTime(5 * 60_000)
    expect(useScreenStore.getState().dimmed).toBe(true)

    useScreenStore.getState().noteActivity()
    expect(useScreenStore.getState().dimmed).toBe(false)
    expect(wakeLock.acquireWakeLock).toHaveBeenCalled()
  })

  it('"off" never dims, however long the app sits idle', async () => {
    const { useScreenStore } = await import('./store')
    useScreenStore.getState().setDimAfterMinutes(null)

    vi.advanceTimersByTime(60 * 60_000)
    expect(useScreenStore.getState().dimmed).toBe(false)
  })

  it('switching from a shorter to a longer window replaces the pending timer, not stacks it', async () => {
    const { useScreenStore } = await import('./store')
    useScreenStore.getState().setDimAfterMinutes(5)
    useScreenStore.getState().setDimAfterMinutes(30)

    vi.advanceTimersByTime(5 * 60_000)
    expect(useScreenStore.getState().dimmed).toBe(false) // the superseded 5-min timer never fires

    vi.advanceTimersByTime(25 * 60_000)
    expect(useScreenStore.getState().dimmed).toBe(true) // the 30-min timer does
  })
})
