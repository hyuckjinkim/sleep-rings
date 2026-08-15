import { useTranslation } from 'react-i18next'
import { useScreenStore, type DimMinutes } from './store'
import './screen.css'

const PRESET_MINUTES: DimMinutes[] = [5, 10, 30, null]

/** Screen-auto-dim picker (5/10/30/off). Deliberately its own panel, not folded into the sleep
 * timer above it — sleep timer stops audio, this only blacks out the display, and mixing the two
 * rows together is exactly the confusion the spec calls out avoiding. */
export function ScreenDimSettings() {
  const { t } = useTranslation()
  const dimAfterMinutes = useScreenStore((s) => s.dimAfterMinutes)
  const setDimAfterMinutes = useScreenStore((s) => s.setDimAfterMinutes)

  return (
    <div className="screen-dim-settings" aria-label={t('screen.dim.title')}>
      <span className="screen-dim-settings-label">{t('screen.dim.title')}</span>
      <div className="screen-dim-settings-row">
        {PRESET_MINUTES.map((minutes) => (
          <button
            key={minutes ?? 'off'}
            type="button"
            aria-pressed={dimAfterMinutes === minutes}
            className={dimAfterMinutes === minutes ? 'is-selected' : ''}
            onClick={() => setDimAfterMinutes(minutes)}
          >
            {minutes === null ? t('screen.dim.off') : t('screen.dim.minutes', { minutes })}
          </button>
        ))}
      </div>
    </div>
  )
}
