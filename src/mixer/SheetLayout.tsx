import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const PEEK_PX = 260 // palette + master volume visible
const TOP_RESERVE_PX = 150 // space left above a fully expanded sheet (header + small field)
const FIELD_GAP_PX = 12
const MIN_SCALE = 0.22
const PROJECT_S = 0.2 // release velocity × this = projected travel (seconds), estimate to tune

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max))

/**
 * "바텀시트형" (Google Maps style): the orbit stays at the top, the palette + controls live in a
 * bottom sheet with two snap heights. Dragging the sheet up shrinks the field continuously with the
 * finger (transform scale — orb positions use the field's layout width, so no double scaling).
 * The page itself doesn't scroll, so there's no slot/spacer problem at all; the sheet body scrolls
 * once expanded.
 */
export function SheetLayout({ field, children }: { field: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()
  const sheetRef = useRef<HTMLElement>(null)
  const fieldWrapRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(PEEK_PX)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startY: number; startH: number; samples: { y: number; t: number }[]; moved: boolean } | null>(null)

  const expandedPx = () => Math.max(PEEK_PX, window.innerHeight - TOP_RESERVE_PX)
  const isExpanded = height > (PEEK_PX + expandedPx()) / 2

  /** Field scale follows the sheet's *rendered* height every frame (drag or snap transition). */
  function fitField() {
    const sheet = sheetRef.current
    const wrap = fieldWrapRef.current
    if (!sheet || !wrap) return
    // offsetTop/offsetHeight are layout values (unaffected by the transform we write below).
    const fieldTop = wrap.parentElement ? wrap.parentElement.getBoundingClientRect().top : 0
    const available = sheet.getBoundingClientRect().top - fieldTop - FIELD_GAP_PX
    const s = clamp(available / wrap.offsetHeight, MIN_SCALE, 1)
    // Centre the (scaled) field in the space above the sheet instead of pinning it to the top.
    const offset = Math.max(0, (available - wrap.offsetHeight * s) / 2)
    wrap.style.transform = `translateY(${offset}px) scale(${s})`
  }

  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    fitField()
    // Fires per frame while the height transitions. Absent in jsdom and very old WebViews — then
    // the field just refits on drag/resize instead of tracking the snap animation.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitField)
    ro?.observe(sheet)
    window.addEventListener('resize', fitField)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', fitField)
    }
  }, [])

  // The page under a sheet must not scroll (and must not be scrolled to the middle on entry).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startY: e.clientY, startH: height, samples: [{ y: e.clientY, t: e.timeStamp }], moved: false }
    setDragging(true)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientY - d.startY) > 6) d.moved = true // slop: below this it's a tap
    d.samples.push({ y: e.clientY, t: e.timeStamp })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 100) d.samples.shift()
    setHeight(clamp(d.startH - (e.clientY - d.startY), PEEK_PX - 40, expandedPx()))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d) return
    if (!d.moved) {
      setHeight(isExpanded ? PEEK_PX : expandedPx()) // tap on the handle toggles
      return
    }
    const first = d.samples[0]
    const dt = Math.max(1, e.timeStamp - first.t)
    const stale = e.timeStamp - d.samples[d.samples.length - 1].t > 80 // paused before lifting
    const velocity = stale ? 0 : ((first.y - e.clientY) / dt) * 1000 // px/s, + = upward
    const projected = height + velocity * PROJECT_S
    setHeight(Math.abs(projected - PEEK_PX) < Math.abs(projected - expandedPx()) ? PEEK_PX : expandedPx())
  }

  return (
    <div className="sheet-layout">
      <div ref={fieldWrapRef} className="sheet-field">
        {field}
      </div>
      <section
        ref={sheetRef}
        className={['mixer-sheet', dragging && 'is-dragging', isExpanded && 'is-expanded'].filter(Boolean).join(' ')}
        style={{ height }}
        aria-label={t('mixer.sheet.label')}
      >
        <div
          className="mixer-sheet-handle"
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          aria-label={t(isExpanded ? 'mixer.sheet.collapse' : 'mixer.sheet.expand')}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setHeight(isExpanded ? PEEK_PX : expandedPx())
            }
          }}
        >
          <span />
        </div>
        <div className="mixer-sheet-body">{children}</div>
      </section>
    </div>
  )
}
