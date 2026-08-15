// Lock-screen / Bluetooth play-pause via the standard Media Session API. Deliberately NOT a
// Capacitor plugin (@capgo/capacitor-media-session): play/pause is the only control asked for,
// and Media Session is a pure web standard with full coverage where it matters — Chromium
// WebView (Android, all versions this app targets) and WKWebView from iOS 15+ — so a native
// plugin would add a dependency for zero extra capability. No-ops entirely on platforms without
// the API (older WebViews / desktop browsers without it).
import type { BackgroundAudioTarget } from './background-audio'

/** Wires lock-screen play/pause to the same foreground/background hooks background-audio.ts
 * already drives — reusing BackgroundAudioTarget instead of a new interface. Call once at
 * startup next to initBackgroundAudio(soundEngine). Returns a cleanup fn. */
export function initMediaSession(target: BackgroundAudioTarget, title: string): () => void {
  if (!('mediaSession' in navigator)) return () => {}

  navigator.mediaSession.metadata = new MediaMetadata({ title })
  navigator.mediaSession.playbackState = 'playing'
  navigator.mediaSession.setActionHandler('play', () => {
    target.onEnterForeground()
    navigator.mediaSession.playbackState = 'playing'
  })
  navigator.mediaSession.setActionHandler('pause', () => {
    target.onEnterBackground()
    navigator.mediaSession.playbackState = 'paused'
  })

  return () => {
    navigator.mediaSession.setActionHandler('play', null)
    navigator.mediaSession.setActionHandler('pause', null)
  }
}
