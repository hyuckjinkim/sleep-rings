import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { PlacedStrip } from './PlacedStrip'

const SHOW_BELOW_RATIO = 0.35 // bar appears once less than this much of the field is on screen

/**
 * "하단 미니 바" (music-app now-playing bar): the page scrolls normally; when the orbit field has
 * mostly scrolled out of view, a bar slides up from the bottom with the playing sounds' icons.
 * Tapping an icon opens its controls; tapping the bar elsewhere scrolls back to the full field.
 */
export function MiniBar({ fieldRef, onSelect }: { fieldRef: RefObject<HTMLDivElement | null>; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const field = fieldRef.current
    if (!field || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio < SHOW_BELOW_RATIO), {
      threshold: [0, SHOW_BELOW_RATIO, 1],
    })
    io.observe(field)
    return () => io.disconnect()
  }, [fieldRef])

  function expand() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div
      className={visible ? 'mixer-minibar is-visible' : 'mixer-minibar'}
      aria-hidden={!visible}
      inert={!visible}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('.mixer-strip-item')) expand()
      }}
    >
      <svg className="mixer-minibar-rings" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeOpacity="0.35" />
        <circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" strokeOpacity="0.5" />
        <circle cx="20" cy="20" r="4" fill="currentColor" />
      </svg>
      <div className="mixer-minibar-icons">
        <PlacedStrip onSelect={onSelect} />
      </div>
      <button type="button" className="mixer-field-dock-button" aria-label={t('mixer.field.expand')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
    </div>
  )
}
