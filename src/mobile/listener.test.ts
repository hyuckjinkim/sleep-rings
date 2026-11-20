import { describe, expect, it, vi } from 'vitest'
import { addListenerSafely } from './listener'

describe('addListenerSafely', () => {
  it('removes the listener on cleanup', async () => {
    const handle = { remove: vi.fn().mockResolvedValue(undefined) }
    const cleanup = addListenerSafely(() => Promise.resolve(handle), 'test')
    await Promise.resolve()
    await Promise.resolve()
    cleanup()
    expect(handle.remove).toHaveBeenCalledTimes(1)
  })

  it('still removes it when cleanup ran before registration finished (StrictMode double mount)', async () => {
    const handle = { remove: vi.fn().mockResolvedValue(undefined) }
    let resolve!: (h: typeof handle) => void
    const cleanup = addListenerSafely(() => new Promise((r) => (resolve = r)), 'test')
    cleanup()
    resolve(handle)
    await Promise.resolve()
    await Promise.resolve()
    expect(handle.remove).toHaveBeenCalledTimes(1)
  })

  it('warns instead of throwing when registration fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cleanup = addListenerSafely(() => Promise.reject(new Error('no plugin')), 'test')
    await Promise.resolve()
    await Promise.resolve()
    expect(warn).toHaveBeenCalledWith('[test] listener failed', expect.any(Error))
    expect(() => cleanup()).not.toThrow()
    warn.mockRestore()
  })
})
