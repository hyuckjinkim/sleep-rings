import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { orbColor, soundCategory, soundName } from '../library/catalog'
import { SoundIcon } from '../icons/SoundIcon'
import type { Locale } from './types'

/** The field pops out once this fraction of it has scrolled above the viewport, and docks back
    when scrolled up past FULL_AT. The gap is hysteresis against scroll jitter at the boundary. */
const MINI_AT = 0.5
const FULL_AT = 0.3
// Container-transform timings (Material: 250ms exit / 300ms enter), docs/research/floating-transition.md.
const TO_MINI_MS = 250
const TO_INLINE_MS = 300
const EDGE_GAP_PX = 8
const PAD_X = 8 // .is-floating padding at --m 1 (mixer.css)
const PAD_TOP = 44
const DEFAULT_TOP_PX = 196 // upper bound for the default mini top
const MINI_MIN_PX = 110
const MINI_MAX_PX = 360
const STRIP_ITEM_PX = 40
const STRIP_GAP_PX = 8

type View = 'orbit' | 'strip'
type Mode = 'inline' | 'floating' // floating = flying either way, or settled as the mini window

interface Gesture {
  kind: 'move' | 'resize'
  offsetX: number // pointer offset inside the dock (move)
  offsetY: number
  startX: number // pointer x at start (resize)
  startW: number // field width at start (resize)
}

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max))
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
// Ease-in-out: the field travels between two on-screen places (Material "standard" easing family).
// Ease-out started too fast — 40–70px on the first frame read as a jump.
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

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
 * Hosts the orbit field inline (full) or as a floating, always-on-top mini window (movable,
 * resizable), in either the orbit view or the one-row icon strip.
 *
 * Transition = one progress value m (0 inline … 1 mini) animated over time. Every frame re-reads
 * the slot's live rect and the mini target and interpolates between them, so the field *flies*
 * between the two along the same path both ways, follows the slot while the page scrolls, and can
 * reverse mid-flight from wherever it is (docs/research/floating-transition.md).
 *
 * The slot (a dashed outline button) holds the field's place while it floats: the page height never
 * changes on a toggle, so scrollY can't clamp across the thresholds and flip-flop the mode.
 *
 * Never portal the dock elsewhere: a remount restarts OrbitField's frame loop, which also drives
 * the spatial audio. And no transform/filter on its ancestors — that would capture position:fixed.
 */
export function FieldDock({ children, onSelect }: { children: ReactNode; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  const placementCount = useMixStore((s) => s.current.placements.length)
  const [mode, setMode] = useState<Mode>('inline')
  const [isMini, setIsMini] = useState(false) // logical target — drives the toggle icon/label
  const [view, setView] = useState<View>('orbit')
  const [slotSize, setSlotSize] = useState({ w: 0, h: 0 })

  const dockRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLButtonElement>(null)
  const modeRef = useRef<Mode>('inline')
  const isMiniRef = useRef(false)
  const viewRef = useRef<View>('orbit')
  const countRef = useRef(placementCount)
  const progress = useRef(0)
  const morphRaf = useRef(0)
  const pos = useRef<{ x: number; y: number } | null>(null) // mini dock top-left; null = default corner
  const miniSize = useRef<number | null>(null) // mini field width; null = default
  const slot = useRef({ top: 0, h: 0 }) // page coords of the field's place, for scroll thresholds
  const gesture = useRef<Gesture | null>(null)
  const activePointers = useRef(new Set<number>())
  const pendingMini = useRef<boolean | null>(null)
  viewRef.current = view
  countRef.current = placementCount

  function miniFieldWidth(): number {
    return miniSize.current ?? Math.min(window.innerWidth * 0.42, 160)
  }

  function stripMiniWidth(): number {
    const n = countRef.current
    const content = n === 0 ? 184 : n * STRIP_ITEM_PX + (n - 1) * STRIP_GAP_PX + 8
    return clamp(content + 2 * PAD_X, 140, window.innerWidth - 2 * EDGE_GAP_PX)
  }

  /** Default mini top: never on the palette anywhere it can scroll to — chips must stay
      draggable into the window. The palette spans [highest, lowest] over the reachable scroll
      range (sticky at 0 if the page is long enough); take the band above that if the window fits,
      else the band below. */
  function defaultTop(dockH: number): number {
    const r = document.querySelector('.mixer-top')?.getBoundingClientRect()
    if (!r) return DEFAULT_TOP_PX
    const pageTop = r.top + window.scrollY
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    const highestTop = Math.max(0, pageTop - maxScroll)
    const above = highestTop - dockH - 12
    if (above >= EDGE_GAP_PX) return Math.min(above, DEFAULT_TOP_PX)
    return Math.min(pageTop + r.height + 12, window.innerHeight - dockH - EDGE_GAP_PX)
  }

  /** Lay the floating dock out at progress k between the slot (k 0) and the mini window (k 1). */
  function layout(k: number) {
    const dock = dockRef.current
    const slotEl = slotRef.current
    if (!dock || !slotEl) return
    const a = slotEl.getBoundingClientRect()
    const isStrip = viewRef.current === 'strip'
    const miniW = isStrip ? stripMiniWidth() : miniFieldWidth()
    const dockW = isStrip ? miniW : miniW + 2 * PAD_X
    const dockH = isStrip ? 100 : miniW + PAD_TOP + PAD_X // settled mini height (strip: header + one row)
    const p = pos.current ?? { x: window.innerWidth - EDGE_GAP_PX - 4 - dockW, y: defaultTop(dockH) }
    dock.style.setProperty('--m', String(k))
    slotEl.style.setProperty('--m', String(k))
    const field = dock.querySelector<HTMLElement>('.mixer-field')
    if (isStrip) {
      dock.style.width = `${lerp(a.width, miniW, k)}px`
      dock.style.transform = `translate3d(${lerp(a.left, p.x, k)}px, ${lerp(a.top, p.y, k)}px, 0)`
      return
    }
    dock.style.width = ''
    // Interpolate the *field* rect (what the eye tracks); the chrome padding grows around it.
    const fx = lerp(a.left, p.x + PAD_X, k)
    const fy = lerp(a.top, p.y + PAD_TOP, k)
    dock.style.transform = `translate3d(${fx - PAD_X * k}px, ${fy - PAD_TOP * k}px, 0)`
    if (field) field.style.width = `${lerp(a.width, miniW, k)}px`
  }

  function clearFloatingStyles() {
    const dock = dockRef.current
    if (!dock) return
    dock.style.transform = ''
    dock.style.width = ''
    dock.style.removeProperty('--m')
    const field = dock.querySelector<HTMLElement>('.mixer-field')
    if (field) field.style.width = ''
  }

  function measureSlot() {
    // While floating the dock is fixed+translated; the slot element holds the real in-flow place.
    const el = modeRef.current === 'floating' ? slotRef.current : dockRef.current
    const r = el?.getBoundingClientRect()
    if (r) slot.current = { top: r.top + window.scrollY, h: r.height }
  }

  function morphTo(target: 0 | 1) {
    const dock = dockRef.current
    if (!dock) return
    if (modeRef.current === 'inline') {
      if (target === 0) return
      const r = dock.getBoundingClientRect()
      modeRef.current = 'floating'
      flushSync(() => {
        setSlotSize({ w: r.width, h: r.height })
        setMode('floating')
      }) // slot is in the DOM from here on, so layout() can read it this same frame
      layout(0)
    }
    cancelAnimationFrame(morphRaf.current)
    const from = progress.current // a reversal starts from wherever the flight is
    const duration = prefersReducedMotion() ? 0 : (target ? TO_MINI_MS : TO_INLINE_MS) * Math.abs(target - from)
    const t0 = performance.now()
    dock.classList.add('is-morphing')
    const step = (now: number) => {
      // rAF's frame timestamp can precede t0 (taken later in the same frame) — clamp, or t < 0
      // extrapolates past the start (field briefly grew to 377px from 359px in sampling).
      const t = duration ? clamp((now - t0) / duration, 0, 1) : 1
      progress.current = from + (target - from) * easeInOutCubic(t)
      layout(progress.current)
      if (t < 1) {
        morphRaf.current = requestAnimationFrame(step)
        return
      }
      dock.classList.remove('is-morphing')
      if (target === 0) {
        // Back in flow at the slot's exact place and size — no jump. Clear the fixed-position
        // styles and drop the class in one synchronous block so no frame paints in between.
        clearFloatingStyles()
        modeRef.current = 'inline'
        flushSync(() => setMode('inline'))
      }
    }
    morphRaf.current = requestAnimationFrame(step)
  }

  function setMini(next: boolean) {
    // Don't yank the field out from under a finger (orb drag, chip being dropped onto it, window
    // move): apply when the last pointer lifts. Touch *scrolling* fires pointercancel, so it
    // doesn't count as held.
    if (activePointers.current.size > 0) {
      pendingMini.current = next
      return
    }
    pendingMini.current = null
    if (next === isMiniRef.current) return
    isMiniRef.current = next
    setIsMini(next)
    morphTo(next ? 1 : 0)
  }

  useEffect(() => {
    let prevY = window.scrollY
    function onScroll() {
      const y = window.scrollY
      measureSlot()
      const { top, h } = slot.current
      // Capped at half the scrollable range: on a short page the field never scrolls half out
      // of view (phone: max scroll 136px vs 243px), and the mode would be unreachable by scroll.
      // The slot keeps the range constant across toggles, so the cap itself doesn't move.
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      const miniAt = Math.min(top + h * MINI_AT, maxScroll * 0.5)
      const fullAt = miniAt * (FULL_AT / MINI_AT)
      // Edge-triggered, so a manual minimize at the top isn't undone by the next tiny scroll.
      if (prevY <= miniAt && y > miniAt) setMini(true)
      else if (prevY >= fullAt && y < fullAt) setMini(false)
      prevY = y
    }
    function onPointerDown(e: PointerEvent) {
      activePointers.current.add(e.pointerId)
    }
    function onPointerEnd(e: PointerEvent) {
      activePointers.current.delete(e.pointerId)
      if (activePointers.current.size === 0 && pendingMini.current !== null) setMini(pendingMini.current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerEnd, true)
    document.addEventListener('pointercancel', onPointerEnd, true)
    return () => {
      cancelAnimationFrame(morphRaf.current)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerEnd, true)
      document.removeEventListener('pointercancel', onPointerEnd, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only touch refs + stable setters
  }, [])

  // Settled mini: re-lay out when the view or the strip's content changes its target size.
  useLayoutEffect(() => {
    if (modeRef.current === 'floating') layout(progress.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layout reads refs
  }, [view, placementCount, mode])

  function expand() {
    setMini(false)
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  function startGesture(kind: Gesture['kind']) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      const r = dockRef.current?.getBoundingClientRect()
      const field = dockRef.current?.querySelector<HTMLElement>('.mixer-field')
      if (!r || progress.current < 1) return
      e.currentTarget.setPointerCapture(e.pointerId)
      gesture.current = { kind, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top, startX: e.clientX, startW: field?.offsetWidth ?? 0 }
      pos.current = { x: r.left, y: r.top } // pin top-left so a resize grows right/down from here
      dockRef.current?.classList.add('is-morphing') // solid tint instead of blur while moving
    }
  }

  // ponytail: position/size aren't re-clamped on viewport resize/rotation; add a resize listener
  // if a rotated phone ever strands the window off-screen (the app is portrait-locked on iOS).
  function handleGestureMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    const r = dockRef.current?.getBoundingClientRect()
    if (!g || !r) return
    if (g.kind === 'move') {
      pos.current = {
        x: clamp(e.clientX - g.offsetX, EDGE_GAP_PX, window.innerWidth - r.width - EDGE_GAP_PX),
        y: clamp(e.clientY - g.offsetY, EDGE_GAP_PX, window.innerHeight - r.height - EDGE_GAP_PX),
      }
    } else {
      const maxW = Math.min(
        MINI_MAX_PX,
        window.innerWidth - r.left - 2 * PAD_X - EDGE_GAP_PX,
        window.innerHeight - r.top - PAD_TOP - PAD_X - EDGE_GAP_PX,
      )
      miniSize.current = clamp(g.startW + (e.clientX - g.startX), MINI_MIN_PX, maxW)
    }
    layout(1)
  }

  function endGesture() {
    gesture.current = null
    dockRef.current?.classList.remove('is-morphing')
  }

  const gestureHandlers = { onPointerMove: handleGestureMove, onPointerUp: endGesture, onPointerCancel: endGesture }
  const isFloating = mode === 'floating'
  const className = ['mixer-field-dock', isFloating && 'is-floating', view === 'strip' && 'is-strip'].filter(Boolean).join(' ')

  return (
    <>
      {isFloating && (
        <button
          ref={slotRef}
          type="button"
          className={view === 'strip' ? 'mixer-dock-slot is-strip' : 'mixer-dock-slot'}
          style={{ width: slotSize.w, height: slotSize.h }}
          onClick={expand}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          <span>{t('mixer.field.docked')}</span>
        </button>
      )}
      <div ref={dockRef} className={className}>
        {isFloating && (
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
            onClick={isMini ? expand : () => setMini(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {isMini ? <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /> : <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />}
            </svg>
          </button>
        </div>
        {view === 'strip' && <PlacedStrip onSelect={onSelect} />}
        {children}
        {isFloating && view === 'orbit' && (
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
