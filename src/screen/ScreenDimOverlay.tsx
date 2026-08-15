import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useScreenStore } from './store'
import './screen.css'

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart'] as const

/**
 * Full-screen blackout after N idle minutes (5/10/30, picked in ScreenDimSettings). Audio keeps
 * playing straight through — this component never calls into soundEngine, only CSS + the wake
 * lock (store.ts owns that decoupling). Mount once near the app root; `position: fixed; inset: 0`
 * means placement in the tree doesn't matter, it always covers the full viewport when dimmed.
 */
export function ScreenDimOverlay() {
  const { t } = useTranslation()
  const dimmed = useScreenStore((s) => s.dimmed)
  const noteActivity = useScreenStore((s) => s.noteActivity)

  useEffect(() => {
    noteActivity() // arms the timer (+ wake lock) for a dim setting restored from a past session
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, noteActivity, { passive: true })
    document.addEventListener('visibilitychange', noteActivity)
    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, noteActivity)
      document.removeEventListener('visibilitychange', noteActivity)
    }
  }, [noteActivity])

  if (!dimmed) return null

  // No onClick/onKeyDown needed: the window-level listeners above already catch the tap/key
  // that dismisses this (they bubble regardless of what's focused).
  return (
    <div className="screen-dim-overlay" role="button" tabIndex={0} aria-label={t('screen.dim.hint')}>
      <span className="screen-dim-hint">{t('screen.dim.hint')}</span>
    </div>
  )
}
