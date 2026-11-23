// url -> AudioBuffer loader (fetch + decodeAudioData), cached per engine instance so the same
// file is only fetched/decoded once even if multiple sounds/placements reference it.
import type { EngineAudioBuffer } from './webAudioTypes'

export interface DecodeHost {
  decodeAudioData(data: ArrayBuffer): Promise<EngineAudioBuffer>
}

export function createAudioBufferLoader(host: DecodeHost): (url: string) => Promise<EngineAudioBuffer> {
  const cache = new Map<string, Promise<EngineAudioBuffer>>()

  return function loadAudioBuffer(url: string): Promise<EngineAudioBuffer> {
    const cached = cache.get(url)
    if (cached) return cached

    const promise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Audio fetch failed: ${url} (HTTP ${res.status})`)
        // An SPA host answers a missing file with index.html + 200 — reject it here instead of
        // letting decodeAudioData report it as a misleading decode error.
        if (res.headers.get('content-type')?.includes('text/html')) {
          throw new Error(`Audio fetch failed: ${url} returned HTML (missing file behind an SPA fallback?)`)
        }
        return res.arrayBuffer()
      })
      .then((data) => host.decodeAudioData(data))
      .catch((err: unknown) => {
        cache.delete(url) // don't poison the cache with a failed load — allow retry
        throw err
      })
    cache.set(url, promise)
    return promise
  }
}
