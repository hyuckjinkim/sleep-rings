import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { orbColor, soundCategory, soundName } from '../library/catalog'
import { SoundIcon } from '../icons/SoundIcon'
import type { Locale } from './types'

/** The field pops out once this fraction of it has scrolled above the viewport, and docks back
    when scrolled up past FULL_AT. The gap is hysteresis against scroll jitter at the boundary. */
const MINI_AT = 0.5
const FULL_AT = 0.3
const EDGE_GAP_PX = 8
const MINI_PAD_PX = 16 // .is-mini horizontal padding, both sides (mixer.css)
const MINI_CHROME_H_PX = 60 // .is-mini header (44) + bottom padding
const MINI_MIN_PX = 110
const MINI_MAX_PX = 360

type View = 'orbit' | 'strip'

interface Gesture {
  kind: 'move' | 'resize'
  offsetX: number // pointer offset inside the dock (move)
  offsetY: number
  startX: number // pointer x at start (resize)
  startW: number // field width at start (resize)
}

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max))

/** "ㅡ" view: one row of the placed sounds' icons. Tapping one opens its controls. */
function PlacedStrip({ onSelect }: { onSelect: (id: string) => void }) {
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

/**
 * Hosts the orbit field inline (full) or as a floating, always-on-top mini window that can be
 * moved and resized, in either the orbit view or the one-row icon strip. Scrolling the field out
 * of view minimizes it and scrolling back up docks it again; the button toggles it directly.
 *
 * While mini, a spacer keeps the field's slot in the page. Without it the page height would change
 * on every toggle, shifting/clamping scrollY across the thresholds and flip-flopping the mode.
 *
 * The orbit field stays mounted in strip view (just hidden): OrbitField's frame loop is also what
 * moves each sound around the listener, so unmounting it would freeze the spatial audio.
 */
export function FieldDock({ children, onSelect }: { children: ReactNode; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  const [isMini, setIsMini] = useState(false)
  const [view, setView] = useState<View>('orbit')
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null) // null = CSS default corner
  const [miniSize, setMiniSize] = useState<number | null>(null) // null = CSS default size
  const [spacerH, setSpacerH] = useState(0)
  const dockRef = useRef<HTMLDivElement>(null)
  const isMiniRef = useRef(false)
  const slot = useRef({ top: 0, h: 0 }) // the inline dock's page position, measured while inline
  const gesture = useRef<Gesture | null>(null)

  function measureSlot() {
    const r = dockRef.current?.getBoundingClientRect()
    if (r) slot.current = { top: r.top + window.scrollY, h: r.height }
  }

  function setMini(next: boolean) {
    if (next === isMiniRef.current) return
    if (next) {
      measureSlot()
      setSpacerH(slot.current.h)
    }
    isMiniRef.current = next
    setIsMini(next)
  }

  useEffect(() => {
    let prevY = window.scrollY
    function onScroll() {
      const y = window.scrollY
      if (!isMiniRef.current) measureSlot()
      const { top, h } = slot.current
      // Capped at half the scrollable range: on a short page the field never scrolls half out
      // of view (phone: max scroll 136px vs 243px), and the mode would be unreachable by scroll.
      // The spacer keeps the range constant across toggles, so the cap itself doesn't move.
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      const miniAt = Math.min(top + h * MINI_AT, maxScroll * 0.5)
      const fullAt = miniAt * (FULL_AT / MINI_AT)
      // Edge-triggered, so a manual minimize at the top isn't undone by the next tiny scroll.
      if (prevY <= miniAt && y > miniAt) setMini(true)
      else if (prevY >= fullAt && y < fullAt) setMini(false)
      prevY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setMini only touches refs + stable setters
  }, [])

  function toggleMini() {
    if (!isMini) {
      setMini(true)
      return
    }
    setMini(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startGesture(kind: Gesture['kind']) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      const r = dockRef.current?.getBoundingClientRect()
      if (!r) return
      e.currentTarget.setPointerCapture(e.pointerId)
      gesture.current = { kind, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top, startX: e.clientX, startW: r.width - MINI_PAD_PX }
      setPos({ x: r.left, y: r.top }) // pin to left/top so a resize grows right/down from here
    }
  }

  // ponytail: position/size aren't re-clamped on viewport resize/rotation; add a resize listener
  // if a rotated phone ever strands the window off-screen (the app is portrait-locked on iOS).
  function handleGestureMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    const r = dockRef.current?.getBoundingClientRect()
    if (!g || !r) return
    if (g.kind === 'move') {
      setPos({
        x: clamp(e.clientX - g.offsetX, EDGE_GAP_PX, window.innerWidth - r.width - EDGE_GAP_PX),
        y: clamp(e.clientY - g.offsetY, EDGE_GAP_PX, window.innerHeight - r.height - EDGE_GAP_PX),
      })
      return
    }
    const maxW = Math.min(
      MINI_MAX_PX,
      window.innerWidth - r.left - MINI_PAD_PX - EDGE_GAP_PX,
      window.innerHeight - r.top - MINI_CHROME_H_PX - EDGE_GAP_PX,
    )
    setMiniSize(clamp(g.startW + (e.clientX - g.startX), MINI_MIN_PX, maxW))
  }

  function endGesture() {
    gesture.current = null
  }

  const gestureHandlers = { onPointerMove: handleGestureMove, onPointerUp: endGesture, onPointerCancel: endGesture }
  const style = isMini
    ? ({
        ...(pos && { left: pos.x, top: pos.y, right: 'auto' }),
        ...(miniSize && { '--mini-size': `${miniSize}px` }),
      } as React.CSSProperties)
    : undefined
  const className = ['mixer-field-dock', isMini && 'is-mini', view === 'strip' && 'is-strip'].filter(Boolean).join(' ')

  return (
    <>
      {isMini && <div style={{ height: spacerH, flexShrink: 0 }} aria-hidden="true" />}
      <div ref={dockRef} className={className} style={style}>
        {isMini && (
          <div className="mixer-field-dock-handle" role="separator" aria-label={t('mixer.field.move')} onPointerDown={startGesture('move')} {...gestureHandlers}>
            <svg viewBox="0 0 24 8" width="24" height="8" aria-hidden="true">
              <path d="M2 2h20M2 6h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}
        <div className="mixer-field-dock-actions">
          <button
            type="button"
            className="mixer-field-dock-button"
            aria-label={t(view === 'orbit' ? 'mixer.field.stripView' : 'mixer.field.orbitView')}
            onClick={() => setView(view === 'orbit' ? 'strip' : 'orbit')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              {view === 'orbit' ? (
                <path d="M3 12h18M5 12a1 1 0 1 0 0 .01M12 12a1 1 0 1 0 0 .01M19 12a1 1 0 1 0 0 .01" />
              ) : (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="4" />
                </>
              )}
            </svg>
          </button>
          <button
            type="button"
            className="mixer-field-dock-button"
            aria-label={t(isMini ? 'mixer.field.expand' : 'mixer.field.minimize')}
            onClick={toggleMini}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {isMini ? <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /> : <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />}
            </svg>
          </button>
        </div>
        {view === 'strip' && <PlacedStrip onSelect={onSelect} />}
        {children}
        {isMini && view === 'orbit' && (
          <div className="mixer-field-dock-resize" role="separator" aria-label={t('mixer.field.resize')} onPointerDown={startGesture('resize')} {...gestureHandlers}>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="M11 4 4 11M11 8l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
    </>
  )
}
