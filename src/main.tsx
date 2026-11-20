import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/theme.css'
import i18n from './i18n'
import { initBackgroundAudio, initMediaSession } from './mobile'
import { useMixStore } from './mixer/store'
import { soundEngine } from './mixer/engine/instance'

// Once for the app's lifetime — safe on plain web too (@capacitor/app ships a Page Visibility
// web fallback), see docs/android-build.md §4. The Android keep-alive service follows playback
// (orbs placed, sleep timer not yet finished), not app foreground/background.
const isMixPlaying = () => useMixStore.getState().current.placements.length > 0 && !useMixStore.getState().sleeping
initBackgroundAudio(soundEngine, {
  isPlaying: isMixPlaying,
  subscribe: (onChange) => useMixStore.subscribe(onChange),
  notificationText: () => ({
    title: i18n.t('app.title'),
    body: i18n.t('app.playbackNotification.body'),
    channelName: i18n.t('app.playbackNotification.channelName'),
    channelDescription: i18n.t('app.playbackNotification.channelDescription'),
  }),
})
// Lock-screen / notification transport controls. Standard navigator.mediaSession, no plugin;
// no-ops where unsupported (docs/android-build.md §8).
initMediaSession(soundEngine, 'SleepRings')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
