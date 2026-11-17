import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { orbColor, soundCategory, soundName } from '../library/catalog'
import { SoundIcon } from '../icons/SoundIcon'
import type { Locale } from './types'

/** "ㅡ" view: one row of the placed sounds' icons. Tapping one opens its controls. */
export function PlacedStrip({ onSelect }: { onSelect: (id: string) => void }) {
  const { t, i18n } = useTranslation()
  const locale = (i18n.language === 'en' ? 'en' : 'ko') as Locale
  const placements = useMixStore((s) => s.current.placements)
  if (placements.length === 0) return <p className="mixer-strip-empty">{t('mixer.field.hint')}</p>
  return (
    <ul className="mixer-strip" aria-label={t('mixer.field.label')}>
      {placements.map((p) => {
        const category = soundCategory(p.soundId)
        return (
          <li key={p.id}>
            <button
              type="button"
              className="mixer-strip-item"
              aria-label={soundName(p.soundId, locale)}
              style={category ? ({ '--orb-color': orbColor(p.soundId, category) } as React.CSSProperties) : undefined}
              onClick={() => onSelect(p.id)}
            >
              <SoundIcon soundId={p.soundId} category={category} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
