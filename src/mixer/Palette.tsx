import { useRef } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { TAU, unitToPolar } from './geometry'
import { catalog, isAvailable } from '../library/catalog'
import type { Locale, Sound } from './types'

const DRAG_THRESHOLD_PX = 4

interface PaletteProps {
  fieldRef: RefObject<HTMLDivElement | null>
}

interface PaletteItemProps {
  sound: Sound
  label: string
  fieldRef: RefObject<HTMLDivElement | null>
  addPlacement: (soundId: string, radius: number, angle: number) => string
}

/** Drag a catalog chip onto the field to add it as a new orb. Pointer Events cover touch+mouse. */
function PaletteItem({ sound, label, fieldRef, addPlacement }: PaletteItemProps) {
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const drag = useRef<{ startX: number; startY: number } | null>(null)
  const moved = useRef(false)

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY }
    moved.current = false
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !chipRef.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) moved.current = true
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

  // B1/B2: a real drag is handled entirely by the pointer handlers above (and does its own
  // drop-target check). This only fires for keyboard activation (Enter/Space on a focused
  // button) or a plain click/tap with no drag — both of which previously did nothing at all.
  function handleClick() {
    if (moved.current) {
      moved.current = false
      return
    }
    addPlacement(sound.id, 0.25 + Math.random() * 0.5, Math.random() * TAU)
  }

  return (
    <button
      ref={chipRef}
      type="button"
      className="mixer-palette-item"
      style={{ '--orb-color': `var(--so-orb-${sound.category})` } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      {label}
    </button>
  )
}

export function Palette({ fieldRef }: PaletteProps) {
  const { t, i18n } = useTranslation()
  const locale = (i18n.language === 'en' ? 'en' : 'ko') as Locale
  const addPlacement = useMixStore((s) => s.addPlacement)

  return (
    <div className="mixer-palette" role="group" aria-label={t('mixer.palette.label')}>
      {/* L-4: sounds with no real asset yet are hidden rather than shown locked (store review
          risk) — they reappear automatically once catalog.ts flips them available. */}
      {catalog
        .filter((sound) => isAvailable(sound.id))
        .map((sound) => (
          <PaletteItem key={sound.id} sound={sound} label={sound.name[locale]} fieldRef={fieldRef} addPlacement={addPlacement} />
        ))}
    </div>
  )
}
