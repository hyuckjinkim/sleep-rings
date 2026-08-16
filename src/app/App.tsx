import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Mixer } from '../mixer/Mixer'
import { useMixStore } from '../mixer/store'
import { ScreenDimOverlay } from '../screen/ScreenDimOverlay'
import { Settings } from './Settings'
import { ensureAdsInit } from './ads-lifecycle'
import './backdrop.css'
// theme.css is imported once in main.tsx

type Screen = 'mixer' | 'settings'

export function App() {
  const { t } = useTranslation()
  // §2.2: the background layer breathes only while something is actually audible.
  const isPlaying = useMixStore((s) => s.current.placements.length > 0 && !s.sleeping)
  const [screen, setScreen] = useState<Screen>('mixer')

  // App-start-once (docs/ads-setup.md §6): Settings.tsx awaits this same promise before ever
  // showing a banner, so it's safe to kick off here regardless of which screen mounts first.
  useEffect(() => {
    void ensureAdsInit()
  }, [])

  // Android hardware back: close the settings screen instead of exiting the app from it; exit
  // normally from the mixer screen. No-op on web/iOS — @capacitor/app only fires this on Android.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let handle: PluginListenerHandle | undefined
    CapacitorApp.addListener('backButton', () => {
      setScreen((prev) => {
        if (prev === 'settings') return 'mixer'
        void CapacitorApp.exitApp()
        return prev
      })
    }).then((h) => {
      handle = h
    })
    return () => {
      void handle?.remove()
    }
  }, [])

  return (
    <>
      <div className={isPlaying ? 'so-backdrop is-playing' : 'so-backdrop'} aria-hidden="true" />
      {/* Mounted at the app root (not inside the mixer screen) so an idle dim still fires while
          the settings screen is open. */}
      <ScreenDimOverlay />
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '0.5rem',
          padding: '1.5rem 0 6rem',
          position: 'relative',
          color: 'var(--so-text-primary, #f0f0f5)',
          fontFamily: 'var(--so-font-family, system-ui, sans-serif)',
        }}
      >
        <h1 style={{ fontSize: 'var(--so-font-size-md, 1.25rem)', fontWeight: 600, letterSpacing: '.02em', margin: 0 }}>
          {t('app.title')}
        </h1>
        {/* Only on the mixer: the settings screen has its own close button, and stacking a gear
            above an X reads as two competing exits. */}
        {screen === 'mixer' && (
        <button
          type="button"
          className="app-header-icon-button"
          onClick={() => setScreen('settings')}
          aria-label={t('app.settings.open')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        )}
        {screen === 'mixer' ? <Mixer /> : <Settings onClose={() => setScreen('mixer')} />}
      </main>
    </>
  )
}
