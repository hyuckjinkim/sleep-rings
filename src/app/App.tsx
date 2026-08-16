import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Mixer } from '../mixer/Mixer'
import { useMixStore } from '../mixer/store'
import { usePlanStore } from '../plan'
import { useScreenStore } from '../screen'
import { initAds, showBanner, hideBanner, shouldShowBanner } from '../ads'
import './backdrop.css'
// theme.css is imported once in main.tsx

export function App() {
  const { t, i18n } = useTranslation()
  // §2.2: the background layer breathes only while something is actually audible.
  const isPlaying = useMixStore((s) => s.current.placements.length > 0 && !s.sleeping)
  const plan = usePlanStore((s) => s.plan)
  const dimmed = useScreenStore((s) => s.dimmed)

  // Banner lifecycle (roadmap-v030.md §3). Free tier only, and never while the screen is dimmed —
  // an ad lighting up a blacked-out sleep screen is both hostile and an AdMob placement risk.
  // No-op on web; the ads module guards the platform itself.
  useEffect(() => {
    void initAds()
  }, [])

  useEffect(() => {
    if (shouldShowBanner(plan === 'free') && !dimmed) void showBanner('bottom')
    else void hideBanner()
  }, [plan, dimmed])

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'ko' ? 'en' : 'ko')
  }

  return (
    <>
      <div className={isPlaying ? 'so-backdrop is-playing' : 'so-backdrop'} aria-hidden="true" />
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
        <button className="app-lang-toggle app-lang-toggle--icon" onClick={toggleLanguage} aria-label={t('app.toggleLanguage')}>
          {i18n.language === 'ko' ? 'EN' : '한'}
        </button>
        <Mixer />
      </main>
    </>
  )
}
