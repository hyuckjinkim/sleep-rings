import { useRef } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { unitToPolar } from './geometry'
import { catalog, isAvailable } from '../library/catalog'
import type { Locale, Sound } from './types'

interface PaletteProps {
  fieldRef: RefObject<HTMLDivElement | null>
}

interface PaletteItemProps {
  sound: Sound
  label: string
  available: boolean
  fieldRef: RefObject<HTMLDivElement | null>
  addPlacement: (soundId: string, radius: number, angle: number) => string
}

/** Drag a catalog chip onto the field to add it as a new orb. Pointer Events cover touch+mouse. */
function PaletteItem({ sound, label, available, fieldRef, addPlacement }: PaletteItemProps) {
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const drag = useRef<{ startX: number; startY: number } | null>(null)

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !chipRef.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    chipRef.current.style.transform = `translate(${dx}px, ${dy}px)`
    chipRef.current.style.zIndex = '10'
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return
    drag.current = null
    if (chipRef.current) {
      chipRef.current.style.transform = ''
      chipRef.current.style.zIndex = ''
    }

    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
    if (!inside) return

    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const r = rect.width / 2
    const { radius, angle } = unitToPolar((e.clientX - cx) / r, (e.clientY - cy) / r)
    addPlacement(sound.id, radius, angle)
  }

  return (
    <button
      ref={chipRef}
      type="button"
      className="mixer-palette-item"
      style={{ '--orb-color': `var(--so-orb-${sound.category})` } as React.CSSProperties}
      disabled={!available}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {available ? label : `🔒 ${label}`}
    </button>
  )
}

export function Palette({ fieldRef }: PaletteProps) {
  const { t, i18n } = useTranslation()
  const locale = (i18n.language === 'en' ? 'en' : 'ko') as Locale
  const addPlacement = useMixStore((s) => s.addPlacement)

  return (
    <div className="mixer-palette" aria-label={t('mixer.palette.label')}>
      {catalog.map((sound) => (
        <PaletteItem
          key={sound.id}
          sound={sound}
          label={sound.name[locale]}
          available={isAvailable(sound.id)}
          fieldRef={fieldRef}
          addPlacement={addPlacement}
        />
      ))}
    </div>
  )
}
