// url -> AudioBuffer loader (fetch + decodeAudioData), cached per engine instance so the same
// file is only fetched/decoded once even if multiple sounds/placements reference it.
import type { EngineAudioBuffer } from './web-audio-types'

export interface DecodeHost {
  decodeAudioData(data: ArrayBuffer): Promise<EngineAudioBuffer>
}

export function createAudioBufferLoader(host: DecodeHost): (url: string) => Promise<EngineAudioBuffer> {
  const cache = new Map<string, Promise<EngineAudioBuffer>>()

  return function loadAudioBuffer(url: string): Promise<EngineAudioBuffer> {
    const cached = cache.get(url)
    if (cached) return cached

    const promise = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => host.decodeAudioData(data))
      .catch((err: unknown) => {
        cache.delete(url) // don't poison the cache with a failed load — allow retry
        throw err
      })
    cache.set(url, promise)
    return promise
  }
}
