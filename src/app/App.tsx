import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Mixer } from '../mixer/Mixer'
import { useMixStore } from '../mixer/store'
import { decodeShareUrl, shareParam } from '../mixer/share'
import { playLastMix, saveMix } from '../sleep/persistence'
import { BEDTIME_NOTIFICATION_ID, onClosedAppReminderTap } from '../mobile/notifications'
import { onPlayLastMixShortcut, setPlayLastMixShortcut } from '../mobile/app-shortcuts'
import { onPlayLastMixIntent } from '../mobile/app-intents'
import { ScreenDimOverlay } from '../screen/ScreenDimOverlay'
import { Settings } from './Settings'
import { getPurchaseAdapter, isPurchaseAvailable, usePlanStore } from '../plan'
import type { Plan } from '../plan'
import { UpgradeSheet } from '../plan/UpgradeSheet'
import './backdrop.css'
// theme.css is imported once in main.tsx

type Screen = 'mixer' | 'settings'

// iOS can hand the same cold-start link to both getLaunchUrl() and appUrlOpen.
let lastShareUrl: string | null = null

export function App() {
  const { t, i18n } = useTranslation()
  // §2.2: the background layer breathes only while something is actually audible.
  const isPlaying = useMixStore((s) => s.current.placements.length > 0 && !s.sleeping && s.bedtimeAt === null)
  const [screen, setScreen] = useState<Screen>('mixer')
  const [shareUpsell, setShareUpsell] = useState<Exclude<Plan, 'free'> | null>(null)
  const [lastMixOffer, setLastMixOffer] = useState(false)

  // Entitlements are the store's truth, not ours: the locally persisted plan says nothing about a
  // subscription that expired, was refunded, or was bought on another device. Re-read it once at
  // boot so a lapsed subscriber stops getting paid sounds and a returning one keeps them
  // (.omc/reviews/v040-review.md HIGH-2). No-op without a purchase backend.
  useEffect(() => {
    if (!isPurchaseAvailable()) return
    void getPurchaseAdapter()
      .getPlan()
      .then((plan) => usePlanStore.getState().setPlan(plan))
      .catch(() => {
        /* offline or store unreachable: keep the last known plan rather than downgrading a payer */
      })
  }, [])

  // Share links (src/mixer/share.ts): the page URL on web, appUrlOpen/launch URL on native — one
  // decode path. This effect runs after Mixer's restoreMix() (child effects run first), so the
  // saved mix doesn't overwrite the shared one.
  useEffect(() => {
    function openShareLink(url: string) {
      if (url === lastShareUrl) return
      lastShareUrl = url
      const shared = decodeShareUrl(url, usePlanStore.getState().plan)
      if (!shared) return
      if (shared.mix.placements.length > 0) {
        useMixStore.getState().openMix(shared.mix)
        // Save now, not after the autosave debounce: a Mixer remount (or StrictMode's effect
        // re-run) restores from storage and would bring the previous mix back.
        try {
          saveMix(useMixStore.getState().current)
        } catch {
          // ponytail: storage full/blocked — the shared mix still plays for this session
        }
      }
      if (shared.lockedPlan) setShareUpsell(shared.lockedPlan)
    }

    if (shareParam(location.href) !== null) {
      openShareLink(location.href)
      history.replaceState(history.state, '', location.pathname + location.search)
    }
    if (!Capacitor.isNativePlatform()) return
    let handle: PluginListenerHandle | undefined
    void CapacitorApp.getLaunchUrl().then((launch) => {
      if (launch?.url) openShareLink(launch.url)
    })
    void CapacitorApp.addListener('appUrlOpen', ({ url }) => openShareLink(url)).then((h) => {
      handle = h
    })
    return () => {
      void handle?.remove()
    }
  }, [])

  // "Play last mix" from outside the app (launcher shortcut, Siri). If the WebView still wouldn't start
  // audio without a tap, the mix is on screen and the offer below asks for that tap.
  function startLastMix() {
    setScreen('mixer')
    void playLastMix().then((playing) => {
      if (!playing && useMixStore.getState().current.placements.length > 0) setLastMixOffer(true)
    })
  }

  useEffect(() => onPlayLastMixShortcut(startLastMix), [])
  useEffect(() => onPlayLastMixIntent(startLastMix), [])

  useEffect(() => {
    void setPlayLastMixShortcut(t('app.shortcut.playLastMix'))
  }, [t, i18n.language])

  // Bedtime reminder tapped after the app was closed: the armed start died with it, so offer the
  // (already restored) last mix instead of starting it unasked.
  useEffect(
    () =>
      onClosedAppReminderTap((id) => {
        if (id === BEDTIME_NOTIFICATION_ID && useMixStore.getState().current.placements.length > 0) setLastMixOffer(true)
      }),
    [],
  )

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
        <h1 className="app-title">
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
      {lastMixOffer && (
        <div className="mixer-last-mix" role="status">
          <span>{t('mixer.lastMix.offer')}</span>
          <button
            type="button"
            onClick={() => {
              setLastMixOffer(false)
              void playLastMix()
            }}
          >
            {t('mixer.lastMix.play')}
          </button>
          <button type="button" onClick={() => setLastMixOffer(false)}>
            {t('mixer.lastMix.dismiss')}
          </button>
        </div>
      )}
      {shareUpsell && (
        <UpgradeSheet
          plan={shareUpsell}
          message={t('mixer.share.lockedBody', { tier: t(`plan.tier.${shareUpsell}`) })}
          onClose={() => setShareUpsell(null)}
        />
      )}
    </>
  )
}
