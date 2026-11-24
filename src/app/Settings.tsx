import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenDimSettings } from '../screen/ScreenDimSettings'
import { useScreenStore } from '../screen/store'
import { usePlanStore } from '../plan'
import { shouldShowBanner } from '../ads'
import { showBannerWhenReady } from './adsLifecycle'
import { useDialogFocus } from '../a11y/useDialogFocus'
import { getThemeMode, setThemeMode } from './themeMode'
import { MIXER_LAYOUTS, useLayoutStore } from '../mixer/layout'
import type { ThemeMode } from './themeMode'
import { UpgradeSheet } from '../plan/UpgradeSheet'
import type { Plan } from '../plan'
import { getPurchaseAdapter, isPurchaseAvailable } from '../plan'
import { usePlaybackSettings } from '../sleep/settings'
import { FADE_IN_OPTIONS, NURSERY_VOLUME_CAP, SLEEP_FADE_OPTIONS, VOLUME_CAP_OPTIONS } from '../sleep/persistence'
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
const LANGUAGES = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English' },
] as const

const THEMES: ThemeMode[] = ['system', 'light', 'dark']

function fadeLabel(t: (key: string, opts?: Record<string, unknown>) => string, sec: number): string {
  if (sec === 0) return t('app.settings.fadeOption.off')
  return sec < 60 ? t('app.settings.fadeOption.seconds', { count: sec }) : t('app.settings.fadeOption.minutes', { count: sec / 60 })
}

export function Settings({ onClose }: SettingsProps) {
  const { t, i18n } = useTranslation()
  const plan = usePlanStore((s) => s.plan)
  // ponytail: two paid tiers, so 'everything above mine' is just these two cases.
  const upgradeTiers: Exclude<Plan, 'free'>[] = plan === 'free' ? ['tier2000', 'tier5000'] : plan === 'tier2000' ? ['tier5000'] : []
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

  const [theme, setTheme] = useState<ThemeMode>(getThemeMode)
  const layout = useLayoutStore((s) => s.layout)
  const setLayout = useLayoutStore((s) => s.setLayout)

  const fadeInSec = usePlaybackSettings((s) => s.fadeInSec)
  const setFadeInSec = usePlaybackSettings((s) => s.setFadeInSec)
  const sleepFadeSec = usePlaybackSettings((s) => s.sleepFadeSec)
  const setSleepFadeSec = usePlaybackSettings((s) => s.setSleepFadeSec)
  const volumeCap = usePlaybackSettings((s) => s.volumeCap)
  const setVolumeCap = usePlaybackSettings((s) => s.setVolumeCap)

  const rootRef = useRef<HTMLDivElement>(null)
  useDialogFocus(rootRef, onClose)
  const [upgradeTarget, setUpgradeTarget] = useState<Exclude<Plan, 'free'> | null>(null)
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


  return (
    <div
      ref={rootRef}
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
        <span className="settings-label" id="settings-fade-in-label">
          {t('app.settings.fadeIn')}
        </span>
        <div className="settings-lang" role="group" aria-labelledby="settings-fade-in-label">
          {FADE_IN_OPTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              className="app-lang-toggle"
              aria-pressed={fadeInSec === sec}
              onClick={() => setFadeInSec(sec)}
            >
              {fadeLabel(t, sec)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <span className="settings-label" id="settings-fade-out-label">
          {t('app.settings.fadeOut')}
        </span>
        <div className="settings-lang" role="group" aria-labelledby="settings-fade-out-label">
          {SLEEP_FADE_OPTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              className="app-lang-toggle"
              aria-pressed={sleepFadeSec === sec}
              onClick={() => setSleepFadeSec(sec)}
            >
              {fadeLabel(t, sec)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <span className="settings-label" id="settings-cap-label">
          {t('app.settings.volumeCap')}
        </span>
        <div className="settings-lang" role="group" aria-labelledby="settings-cap-label">
          {[...VOLUME_CAP_OPTIONS, NURSERY_VOLUME_CAP].map((cap) => (
            <button
              key={cap}
              type="button"
              className="app-lang-toggle"
              aria-pressed={volumeCap === cap}
              onClick={() => setVolumeCap(cap)}
            >
              {cap === NURSERY_VOLUME_CAP
                ? t('app.settings.capOption.nursery')
                : cap === 1
                  ? t('app.settings.capOption.none')
                  : t('app.settings.capOption.percent', { percent: Math.round(cap * 100) })}
            </button>
          ))}
        </div>
        {volumeCap === NURSERY_VOLUME_CAP && <p className="settings-plan-hint">{t('app.settings.nurseryHint')}</p>}
      </section>

      <section className="settings-section">
        <span className="settings-label" id="settings-lang-label">
          {t('app.settings.language')}
        </span>
        {/* Both options always visible (a single toggle only ever showed the *other* language,
            hiding which one is active). Names stay in their own language, never translated. */}
        <div className="settings-lang" role="group" aria-labelledby="settings-lang-label">
          {LANGUAGES.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              className="app-lang-toggle"
              lang={code}
              aria-pressed={i18n.language === code}
              onClick={() => void i18n.changeLanguage(code)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <span className="settings-label" id="settings-theme-label">
          {t('app.settings.theme')}
        </span>
        <div className="settings-lang" role="group" aria-labelledby="settings-theme-label">
          {THEMES.map((mode) => (
            <button
              key={mode}
              type="button"
              className="app-lang-toggle"
              aria-pressed={theme === mode}
              onClick={() => {
                setThemeMode(mode)
                setTheme(mode)
              }}
            >
              {t(`app.settings.themeOption.${mode}`)}
            </button>
          ))}
        </div>
      </section>

      {/* How the orbit stays in view while using the controls below it — four variants kept side by
          side so they can be compared on a real device (src/mixer/layout.ts). */}
      <section className="settings-section">
        <span className="settings-label" id="settings-layout-label">
          {t('app.settings.layout')}
        </span>
        <div className="settings-lang" role="group" aria-labelledby="settings-layout-label">
          {MIXER_LAYOUTS.map((option) => (
            <button
              key={option}
              type="button"
              className="app-lang-toggle"
              aria-pressed={layout === option}
              onClick={() => setLayout(option)}
            >
              {t(`app.settings.layoutOption.${option}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section settings-plan">
        <span className="settings-label">{t('plan.settings.currentLabel')}</span>
        <strong>{t(`plan.tier.${plan}`)}</strong>
        {plan === 'free' && <p className="settings-plan-hint">{t('plan.settings.upgradeHint')}</p>}
        {/* The hint above told free users to upgrade and then offered no way to do it — the plan
            section was a dead end, and buying was only reachable by tapping a locked palette chip
            (which a user browsing settings has no reason to think of). Same sheet, opened with the
            tier the user picked rather than the tier some sound happens to require. A Pro owner sees
            Pro Max here too — purchases are one-time, so without this the only way up was a locked chip. */}
        {upgradeTiers.length > 0 && (
          <>
            <span className="settings-label">{t('plan.settings.choose')}</span>
            <div className="settings-plan-tiers">
              {upgradeTiers.map((tier) => (
                <button key={tier} type="button" className="settings-plan-tier" onClick={() => setUpgradeTarget(tier)}>
                  {t(`plan.tier.${tier}`)}
                </button>
              ))}
            </div>
          </>
        )}
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

      {upgradeTarget && <UpgradeSheet plan={upgradeTarget} onClose={() => setUpgradeTarget(null)} />}

      <section className="settings-section settings-about">
        <span className="settings-label">{t('app.version.label')}</span>
        <span>{pkg.version}</span>
      </section>
    </div>
  )
}
