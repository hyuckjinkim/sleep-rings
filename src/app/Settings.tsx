import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenDimSettings } from '../screen/ScreenDimSettings'
import { useScreenStore } from '../screen/store'
import { usePlanStore } from '../plan'
import { shouldShowBanner } from '../ads'
import { showBannerWhenReady } from './ads-lifecycle'
import { getPurchaseAdapter, isPurchaseAvailable } from '../plan'
import pkg from '../../package.json'
import './settings.css'

interface SettingsProps {
  onClose: () => void
}

/**
 * Non-playback screen (docs/ads-setup.md §5/§6): the only surface allowed to host the AdMob
 * banner, since the mixer screen is all playback controls. Banner is shown only while this
 * component is mounted, on a free plan, and the screen isn't dimmed — any of those going false
 * hides it again (including unmount, via the effect's cleanup).
 */
export function Settings({ onClose }: SettingsProps) {
  const { t, i18n } = useTranslation()
  const plan = usePlanStore((s) => s.plan)
  const dimmed = useScreenStore((s) => s.dimmed)
  const bannerActive = shouldShowBanner(plan === 'free') && !dimmed

  useEffect(() => {
    void showBannerWhenReady(bannerActive)
    return () => {
      // Go through the same gate on unmount, not a bare hideBanner(): if init is still pending,
      // hideBanner() is a no-op while the queued show survives and later paints a banner over the
      // mixer (.omc/reviews/v040-review.md HIGH-1).
      void showBannerWhenReady(false)
    }
  }, [bannerActive])

  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState(false)

  async function handleRestore() {
    setRestoring(true)
    setRestoreError(false)
    try {
      const restored = await getPurchaseAdapter().restore()
      usePlanStore.getState().setPlan(restored)
    } catch {
      setRestoreError(true)
    } finally {
      setRestoring(false)
    }
  }

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === 'ko' ? 'en' : 'ko')
  }

  return (
    <div
      className={bannerActive ? 'settings-screen has-banner' : 'settings-screen'}
      role="dialog"
      aria-label={t('app.settings.title')}
    >
      <div className="settings-header">
        <strong>{t('app.settings.title')}</strong>
        <button type="button" className="settings-close" onClick={onClose} aria-label={t('mixer.controls.close')}>
          ✕
        </button>
      </div>

      <ScreenDimSettings />

      <section className="settings-section">
        <button type="button" className="app-lang-toggle" onClick={toggleLanguage}>
          {t('app.toggleLanguage')}
        </button>
      </section>

      <section className="settings-section settings-plan">
        <span className="settings-label">{t('plan.settings.currentLabel')}</span>
        <strong>{t(`plan.tier.${plan}`)}</strong>
        {plan === 'free' && <p className="settings-plan-hint">{t('plan.settings.upgradeHint')}</p>}
        {/* Restore lives here, not only behind a locked palette chip: App Store 3.1.1 requires a
            reachable restore path, and a subscriber reinstalling has no locked chip to tap since
            their tier already unlocks everything (.omc/reviews/v040-review.md HIGH-3). */}
        {isPurchaseAvailable() && (
          <button
            type="button"
            className="settings-restore"
            onClick={handleRestore}
            disabled={restoring}
          >
            {restoring ? t('plan.upgrade.restoring') : t('plan.upgrade.restore')}
          </button>
        )}
        {restoreError && <p className="settings-plan-hint">{t('plan.upgrade.failed')}</p>}
      </section>

      <section className="settings-section settings-about">
        <span className="settings-label">{t('app.version.label')}</span>
        <span>{pkg.version}</span>
      </section>
    </div>
  )
}
