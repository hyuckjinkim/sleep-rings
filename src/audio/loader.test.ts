import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAudioBufferLoader } from './loader'
import { createMockAudioBuffer } from './test-support/mock-audio-context'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createAudioBufferLoader', () => {
  it('fetches, decodes, and caches by url — a second load reuses the cached promise', async () => {
    const arrayBuffer = new ArrayBuffer(8)
    const fetchMock = vi.fn(async () => ({ arrayBuffer: async () => arrayBuffer }))
    vi.stubGlobal('fetch', fetchMock)

    const decodedBuffer = createMockAudioBuffer(100, 48000)
    const decodeAudioData = vi.fn(async () => decodedBuffer)
    const loadAudioBuffer = createAudioBufferLoader({ decodeAudioData })

    const first = await loadAudioBuffer('sounds/rain.m4a')
    const second = await loadAudioBuffer('sounds/rain.m4a')

    expect(first).toBe(decodedBuffer)
    expect(second).toBe(decodedBuffer)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(decodeAudioData).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed load, so a retry fetches again', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ arrayBuffer: async () => new ArrayBuffer(8) })
    vi.stubGlobal('fetch', fetchMock)

    const decodedBuffer = createMockAudioBuffer(10, 48000)
    const loadAudioBuffer = createAudioBufferLoader({ decodeAudioData: vi.fn(async () => decodedBuffer) })

    await expect(loadAudioBuffer('sounds/broken.m4a')).rejects.toThrow('network error')
    await expect(loadAudioBuffer('sounds/broken.m4a')).resolves.toBe(decodedBuffer)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
