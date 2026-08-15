import { useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { TAU, unitToPolar } from './geometry'
import { catalog, isAvailable } from '../library/catalog'
import { SoundIcon } from '../icons/SoundIcon'
import type { Category, Locale, Sound } from './types'

const DRAG_THRESHOLD_PX = 4

interface PaletteProps {
  fieldRef: RefObject<HTMLDivElement | null>
}

export type DragIntent = 'tap' | 'pan' | 'place'

/**
 * Classify a chip pointer gesture once total movement clears DRAG_THRESHOLD_PX. Horizontal-
 * dominant movement pans the palette strip (chips already use pointerdown->field drag to place
 * an orb, so panning needs its own axis to avoid colliding with that gesture); vertical/diagonal
 * movement keeps the existing field-placement drag. Below threshold it's still a tap. Pure
 * function so the direction split can be unit-tested without pointer-event plumbing.
 */
export function classifyDrag(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): DragIntent {
  if (Math.hypot(dx, dy) <= threshold) return 'tap'
  return Math.abs(dx) > Math.abs(dy) ? 'pan' : 'place'
}

interface PaletteItemProps {
  sound: Sound
  label: string
  available: boolean
  fieldRef: RefObject<HTMLDivElement | null>
  stripRef: RefObject<HTMLDivElement | null>
  addPlacement: (soundId: string, radius: number, angle: number) => string
}

/** Drag a catalog chip onto the field to add it as a new orb, or drag it sideways to pan the
    palette strip. Pointer Events cover touch+mouse. */
function PaletteItem({ sound, label, available, fieldRef, stripRef, addPlacement }: PaletteItemProps) {
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const drag = useRef<{ startX: number; startY: number; lastX: number } | null>(null)
  const intent = useRef<DragIntent>('tap') // decided on first move past DRAG_THRESHOLD_PX
  const suppressClick = useRef(false)

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY, lastX: e.clientX }
    intent.current = 'tap'
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !chipRef.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY

    if (intent.current === 'tap') intent.current = classifyDrag(dx, dy)

    if (intent.current === 'pan') {
      stripRef.current?.scrollBy({ left: -(e.clientX - drag.current.lastX) })
      drag.current.lastX = e.clientX
      return
    }
    if (intent.current === 'place') {
      chipRef.current.style.transform = `translate(${dx}px, ${dy}px)`
      chipRef.current.style.zIndex = '10'
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return
    const finalIntent = intent.current
    drag.current = null
    if (chipRef.current) {
      chipRef.current.style.transform = ''
      chipRef.current.style.zIndex = ''
    }
    if (finalIntent === 'tap') return // let the click handler (below) place it

    suppressClick.current = true // real drag (pan or place) — the click that follows must no-op
    if (finalIntent === 'pan') return // panning never places an orb

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
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    addPlacement(sound.id, 0.25 + Math.random() * 0.5, Math.random() * TAU)
  }

  return (
    <button
      ref={chipRef}
      type="button"
      className="mixer-palette-item"
      disabled={!available}
      style={{ '--orb-color': `var(--so-orb-${sound.category})` } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      <SoundIcon soundId={sound.id} category={sound.category} className="so-icon--sm" />
      <span>{label}</span>
    </button>
  )
}

export function Palette({ fieldRef }: PaletteProps) {
  const { t, i18n } = useTranslation()
  const locale = (i18n.language === 'en' ? 'en' : 'ko') as Locale
  const addPlacement = useMixStore((s) => s.addPlacement)
  const hasPlacements = useMixStore((s) => s.current.placements.length > 0)
  const clearAll = useMixStore((s) => s.clearAll)
  const stripRef = useRef<HTMLDivElement | null>(null)

  // Categories are derived from whatever the catalog actually contains (no hardcoded list),
  // in first-appearance order. The default tab is whichever category has the most sounds.
  const categoryOrder = useMemo(() => {
    const order: Category[] = []
    for (const sound of catalog) if (!order.includes(sound.category)) order.push(sound.category)
    return order
  }, [])
  const [activeCategory, setActiveCategory] = useState<Category>(() => {
    let best = categoryOrder[0]
    let bestCount = 0
    for (const c of categoryOrder) {
      const n = catalog.filter((s) => s.category === c).length
      if (n > bestCount) {
        best = c
        bestCount = n
      }
    }
    return best
  })

  // A category whose sounds are ALL unavailable (no real asset yet) still gets a tab — hiding
  // the tab itself would make it look like the category doesn't exist. Within the tab, L-4's
  // hide-unavailable-entirely rule still applies as long as it leaves at least one sound visible;
  // it only falls back to showing (disabled) entries when hiding them would empty the tab.
  const soundsInTab = useMemo(() => {
    const inCategory = catalog.filter((s) => s.category === activeCategory)
    const available = inCategory.filter((s) => isAvailable(s.id))
    return available.length > 0 ? available : inCategory
  }, [activeCategory])

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const next = categoryOrder[(index + dir + categoryOrder.length) % categoryOrder.length]
    setActiveCategory(next)
    document.getElementById(`mixer-tab-${next}`)?.focus()
  }

  return (
    <div className="mixer-palette-wrap">
      <div className="mixer-palette-toolbar">
        <div className="mixer-palette-tabs" role="tablist" aria-label={t('mixer.palette.label')}>
          {categoryOrder.map((category, i) => (
            <button
              key={category}
              type="button"
              role="tab"
              id={`mixer-tab-${category}`}
              aria-selected={activeCategory === category}
              aria-controls="mixer-tabpanel"
              tabIndex={activeCategory === category ? 0 : -1}
              className="mixer-palette-tab"
              style={{ '--orb-color': `var(--so-orb-${category})` } as React.CSSProperties}
              onClick={() => setActiveCategory(category)}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
            >
              {t(`mixer.category.${category}`)}
            </button>
          ))}
        </div>
        {/* "모두 제거": only worth showing once there's something on the field to clear. */}
        {hasPlacements && (
          <button type="button" className="mixer-palette-clear" onClick={clearAll}>
            {t('mixer.palette.clearAll')}
          </button>
        )}
      </div>
      <div ref={stripRef} id="mixer-tabpanel" className="mixer-palette" role="tabpanel" aria-labelledby={`mixer-tab-${activeCategory}`}>
        {soundsInTab.map((sound) => (
          <PaletteItem
            key={sound.id}
            sound={sound}
            label={sound.name[locale]}
            available={isAvailable(sound.id)}
            fieldRef={fieldRef}
            stripRef={stripRef}
            addPlacement={addPlacement}
          />
        ))}
      </div>
    </div>
  )
}
