// Background-playback bridge (design doc audio-engine.md §6, task #9). Deliberately decoupled
// from src/mixer/ — this module only knows the small structural shape it needs from the sound
// engine, so no mixer file has to change to adopt it. See docs/android-build.md for the exact
// call sites this needs to be wired into (App.tsx's first-gesture handler + engine lifecycle).
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { startAndroidKeepAliveService, stopAndroidKeepAliveService } from './foreground-service'
import type { KeepAliveNotificationText } from './foreground-service'

/** Structural subset of SoundEngine (src/audio/sound-engine.ts) this bridge drives. */
export interface BackgroundAudioTarget {
  onEnterBackground(): void
  onEnterForeground(): void
}

/** What the bridge needs to know about the mix — main.tsx adapts the mixer store to this. */
export interface PlaybackSource {
  isPlaying(): boolean
  subscribe(onChange: () => void): () => void
  /** Read at start time (not boot) so the notification follows the current language. */
  notificationText(): KeepAliveNotificationText
}

export interface KeepAliveState {
  playing: boolean
  unlocked: boolean // first user gesture happened (AudioContext resumed) — restored-but-silent mixes don't count
  visible: boolean
  running: boolean
}

/**
 * Android 17 (API 37) mutes background audio unless its mediaPlayback foreground service holds
 * while-in-use, which a service started from the background generally doesn't get — so the
 * service starts only while the app is visible and audio is actually audible, and stops when
 * playback ends. App backgrounding/foregrounding alone never starts or stops it.
 * https://developer.android.com/about/versions/17/changes/bg-audio
 */
export function keepAliveAction(s: KeepAliveState): 'start' | 'stop' | null {
  const wanted = s.playing && s.unlocked
  if (wanted && !s.running && s.visible) return 'start'
  if (!wanted && s.running) return 'stop'
  return null
}

const KEEP_ALIVE_SRC = '/mobile/silence.wav'
let keepAliveAudio: HTMLAudioElement | null = null
let playback: PlaybackSource | undefined
let audioUnlocked = false
let appVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
let serviceRunning = false
let serviceQueue: Promise<void> = Promise.resolve() // start/stop are async — keep them in call order

function syncKeepAliveService(): void {
  if (!playback) return
  const action = keepAliveAction({
    playing: playback.isPlaying(),
    unlocked: audioUnlocked,
    visible: appVisible,
    running: serviceRunning,
  })
  if (!action) return
  serviceRunning = action === 'start'
  const text = action === 'start' ? playback.notificationText() : undefined
  serviceQueue = serviceQueue
    .then(() => (text ? startAndroidKeepAliveService(text) : stopAndroidKeepAliveService()))
    .catch((err: unknown) => {
      console.warn('[background-audio] keep-alive service', action, 'failed', err)
      if (text) serviceRunning = false // let the next state change retry
    })
}

/**
 * Starts the silent looped <audio> element that keeps WKWebView's media session in `.playback`
 * so the real Web Audio orbit mix keeps rendering in the background (1안). Must be called from
 * the same first-gesture handler that resumes the engine's AudioContext — browsers block
 * autoplay before a user gesture, so calling this at module load would silently no-op.
 */
export function startKeepAliveAudio(): void {
  // This is the native first-gesture hook, i.e. the moment a restored mix becomes audible.
  audioUnlocked = true
  syncKeepAliveService()
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
 * (Android) drives the keep-alive foreground service from playback state — see keepAliveAction().
 * The service is only ever claimed while audio is actually playing: a "Playing your sleep mix"
 * notification with nothing playing is a Play Store mediaPlayback FGS policy problem, a battery
 * drain, and a lie to the user. Call once at app startup. Returns a cleanup fn.
 */
export function initBackgroundAudio(target: BackgroundAudioTarget, source?: PlaybackSource): () => void {
  let handle: PluginListenerHandle | undefined
  playback = source
  void App.addListener('appStateChange', ({ isActive }) => {
    appVisible = isActive
    if (isActive) target.onEnterForeground()
    else target.onEnterBackground()
    syncKeepAliveService() // e.g. back in the foreground with playback whose start was missed
  }).then((h) => {
    handle = h
  })
  const unsubscribe = source?.subscribe(syncKeepAliveService)
  syncKeepAliveService()

  return () => {
    void handle?.remove()
    unsubscribe?.()
    stopKeepAliveAudio()
  }
}
