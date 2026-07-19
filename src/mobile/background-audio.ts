// Background-playback bridge (design doc audio-engine.md §6, task #9). Deliberately decoupled
// from src/mixer/ — this module only knows the small structural shape it needs from the sound
// engine, so no mixer file has to change to adopt it. See docs/android-build.md for the exact
// call sites this needs to be wired into (App.tsx's first-gesture handler + engine lifecycle).
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { startAndroidKeepAliveService, stopAndroidKeepAliveService } from './foreground-service'

/** Structural subset of SoundEngine (src/audio/sound-engine.ts) this bridge drives. */
export interface BackgroundAudioTarget {
  onEnterBackground(): void
  onEnterForeground(): void
}

const KEEP_ALIVE_SRC = '/mobile/silence.wav'
let keepAliveAudio: HTMLAudioElement | null = null

/**
 * Starts the silent looped <audio> element that keeps WKWebView's media session in `.playback`
 * so the real Web Audio orbit mix keeps rendering in the background (1안). Must be called from
 * the same first-gesture handler that resumes the engine's AudioContext — browsers block
 * autoplay before a user gesture, so calling this at module load would silently no-op.
 */
export function startKeepAliveAudio(): void {
  if (keepAliveAudio) return
  const audio = new Audio(KEEP_ALIVE_SRC)
  audio.loop = true
  audio.volume = 0
  audio.setAttribute('playsinline', 'true')
  void audio.play().catch(() => {
    // ponytail: autoplay was blocked (no gesture yet) — caller retries on the next gesture.
    keepAliveAudio = null
  })
  keepAliveAudio = audio
}

export function stopKeepAliveAudio(): void {
  keepAliveAudio?.pause()
  keepAliveAudio = null
}

/**
 * Wires Capacitor's app-lifecycle events to the sound engine's background/foreground hooks and
 * (Android) the keep-alive foreground service. Call once at app startup. Returns a cleanup fn.
 */
export function initBackgroundAudio(target: BackgroundAudioTarget): () => void {
  let handle: PluginListenerHandle | undefined
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      target.onEnterForeground()
      void stopAndroidKeepAliveService()
    } else {
      target.onEnterBackground()
      void startAndroidKeepAliveService()
    }
  }).then((h) => {
    handle = h
  })

  return () => {
    void handle?.remove()
    stopKeepAliveAudio()
  }
}
