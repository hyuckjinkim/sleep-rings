import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAudioBufferLoader } from './loader'
import { createMockAudioBuffer } from './test-support/mockAudioContext'

afterEach(() => {
  vi.unstubAllGlobals()
})

function audioResponse(body = new ArrayBuffer(8), init: { status?: number; contentType?: string } = {}) {
  const status = init.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': init.contentType ?? 'audio/mp4' }),
    arrayBuffer: async () => body,
  }
}

describe('createAudioBufferLoader', () => {
  it('fetches, decodes, and caches by url — a second load reuses the cached promise', async () => {
    const arrayBuffer = new ArrayBuffer(8)
    const fetchMock = vi.fn(async () => audioResponse(arrayBuffer))
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
      .mockResolvedValueOnce(audioResponse())
    vi.stubGlobal('fetch', fetchMock)

    const decodedBuffer = createMockAudioBuffer(10, 48000)
    const loadAudioBuffer = createAudioBufferLoader({ decodeAudioData: vi.fn(async () => decodedBuffer) })

    await expect(loadAudioBuffer('sounds/broken.m4a')).rejects.toThrow('network error')
    await expect(loadAudioBuffer('sounds/broken.m4a')).resolves.toBe(decodedBuffer)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects a non-2xx response with the url and status instead of decoding it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse(new ArrayBuffer(8), { status: 404 })))
    const decodeAudioData = vi.fn()
    const loadAudioBuffer = createAudioBufferLoader({ decodeAudioData })
    await expect(loadAudioBuffer('sounds/missing.m4a')).rejects.toThrow('sounds/missing.m4a (HTTP 404)')
    expect(decodeAudioData).not.toHaveBeenCalled()
  })

  it('rejects an SPA fallback (200 + text/html) instead of decoding index.html', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse(new ArrayBuffer(8), { contentType: 'text/html; charset=utf-8' })))
    const decodeAudioData = vi.fn()
    const loadAudioBuffer = createAudioBufferLoader({ decodeAudioData })
    await expect(loadAudioBuffer('sounds/missing.m4a')).rejects.toThrow('returned HTML')
    expect(decodeAudioData).not.toHaveBeenCalled()
  })
})
