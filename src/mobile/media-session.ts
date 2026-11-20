// Lock-screen / Bluetooth play-pause via the standard Media Session API. Deliberately NOT a
// Capacitor plugin (@capgo/capacitor-media-session): play/pause is the only control asked for,
// and Media Session is a pure web standard with full coverage where it matters — Chromium
// WebView (Android, all versions this app targets) and WKWebView from iOS 15+ — so a native
// plugin would add a dependency for zero extra capability. No-ops entirely on platforms without
// the API (older WebViews / desktop browsers without it).
import type { BackgroundAudioTarget } from './background-audio'
import iconUrl from '../../assets/icon.svg?no-inline'

const APP_NAME = 'SleepRings'
// public/ ships no icon; the app's own SVG (also the favicon) is bundled by Vite instead — emitted as
// a real file (?no-inline), not a data: URI, since the OS fetches artwork by URL.
// ponytail: SVG artwork — some lock screens only render raster; ship a PNG if a device shows none.
const ARTWORK: MediaImage[] = [{ src: iconUrl, sizes: '1024x1024', type: 'image/svg+xml' }]

/** Lock-screen / notification "Now Playing" text: the current mix's name (null = unnamed mix → app
 * name), artist "SleepRings", app icon. Skips identical updates — the mixer store ticks often. */
export function setNowPlaying(mixName: string | null): void {
  if (!('mediaSession' in navigator)) return
  const title = mixName || APP_NAME
  if (navigator.mediaSession.metadata?.title === title) return
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist: APP_NAME, artwork: ARTWORK })
}

/** Wires lock-screen play/pause to the same foreground/background hooks background-audio.ts
 * already drives — reusing BackgroundAudioTarget instead of a new interface. Call once at
 * startup next to initBackgroundAudio(soundEngine). Returns a cleanup fn. */
export function initMediaSession(target: BackgroundAudioTarget, mixName: string | null = null): () => void {
  if (!('mediaSession' in navigator)) return () => {}

  setNowPlaying(mixName)
  // 'none' until something actually plays: this runs at boot, and declaring 'playing' there put a
  // paused-looking transport on the lock screen (and in desktop browsers) for an app making no
  // sound. setMediaSessionPlaying() flips it when the mix really starts.
  navigator.mediaSession.playbackState = 'none'
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

/** Reflect real playback state on the lock-screen transport. Called by the mixer store when the
 * first orb starts and when the last one stops. No-op where Media Session is unsupported. */
export function setMediaSessionPlaying(playing: boolean): void {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
}
