import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/theme.css'
import i18n from './i18n'
import { initBackgroundAudio, initMediaSession, setNowPlaying } from './mobile'
import { setWidgetMixName } from './mobile/widget'
import { isMixPlaying } from './mobile/playback-state'
import { useMixStore } from './mixer/store'
import { UNTITLED_MIX_NAME } from './mixer/types'
import { soundEngine } from './mixer/engine/instance'
import { registerServiceWorker } from './app/pwa'
import { restoreAlarm } from './sleep/persistence'

// Once for the app's lifetime — safe on plain web too (@capacitor/app ships a Page Visibility
// web fallback), see docs/android-build.md §4. What counts as playing: src/mobile/playback-state.ts.
initBackgroundAudio(soundEngine, {
  isPlaying: () => isMixPlaying(useMixStore.getState()),
  subscribe: (onChange) => useMixStore.subscribe(onChange),
  notificationText: () => ({
    title: i18n.t('app.title'),
    body: i18n.t('app.playbackNotification.body'),
    channelName: i18n.t('app.playbackNotification.channelName'),
    channelDescription: i18n.t('app.playbackNotification.channelDescription'),
  }),
})
// After the service above subscribes, so a restored alarm claims the keep-alive like an armed one.
restoreAlarm()
// Lock-screen / notification transport controls. Standard navigator.mediaSession, no plugin;
// no-ops where unsupported (docs/android-build.md §8).
// Lock-screen "play" after a finished sleep timer must restart the orbs, not just un-suspend.
initMediaSession(
  {
    onEnterBackground: () => soundEngine.onEnterBackground(),
    onEnterForeground: () => {
      soundEngine.onEnterForeground()
      useMixStore.getState().wake()
    },
  },
)
// Now Playing title follows the mix: a loaded preset's name, else the app name (setNowPlaying
// skips unchanged titles, so the store's frequent ticks cost nothing).
// The iOS widget shows the same name (setWidgetMixName skips unchanged ones too). Seeded once here:
// subscribe only fires on changes, and a fresh install's widget would otherwise never get a name.
const mixName = (name: string) => (name === UNTITLED_MIX_NAME ? null : name)
setWidgetMixName(mixName(useMixStore.getState().current.name))
useMixStore.subscribe((s) => {
  setNowPlaying(mixName(s.current.name))
  setWidgetMixName(mixName(s.current.name))
})

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
