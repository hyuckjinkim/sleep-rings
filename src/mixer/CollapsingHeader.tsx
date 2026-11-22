import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PlacedStrip } from './PlacedStrip'

const COMPACT_H = 64 // visible header height once collapsed
const COMPACT_FIELD = 48 // field size inside the compact bar
const COMPACT_LEFT = 16
const SNAP_IDLE_MS = 140 // scroll idle time before snapping to fully open/closed

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1)
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/**
 * "접히는 상단 헤더": the field shrinks *continuously with scroll* into a compact sticky bar
 * (small orbit + icon row), Material collapsing-toolbar style, and snaps open/closed once scrolling
 * stops.
 *
 * Loop-free by construction: the header's in-flow height never changes. It is sticky with a
 * negative top (-range), so the page scrolls it up until only its bottom COMPACT_H band shows;
 * the field is moved/scaled with transform into that band. Scale is safe because orb positions use
 * the field's layout width (OrbitField/Orb), not its rendered rect.
 */
export function CollapsingHeader({ children, onSelect }: { children: ReactNode; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  const headerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const geo = useRef({ range: 0, pageTop: 0, barH: 0 })

  function apply() {
    const header = headerRef.current
    const wrap = wrapRef.current
    if (!header || !wrap) return
    const { range, pageTop, barH } = geo.current
    const end = pageTop + range - barH // scrollY at which the header is fully collapsed (and stuck)
    const p = end > 0 ? clamp01(window.scrollY / end) : 0
    const w = wrap.offsetWidth
    const x0 = (header.clientWidth - w) / 2
    const yTarget = range + (COMPACT_H - COMPACT_FIELD) / 2
    wrap.style.transform = `translate(${lerp(0, COMPACT_LEFT - x0, p)}px, ${lerp(0, yTarget, p)}px) scale(${lerp(1, COMPACT_FIELD / w, p)})`
    header.style.setProperty('--p', p.toFixed(3))
    header.classList.toggle('is-collapsed', p > 0.95)
  }

  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return
    function measure() {
      if (!header) return
      const range = Math.max(0, header.offsetHeight - COMPACT_H)
      // Pinned app bar (title + settings) above us — mixer.css --app-bar-h.
      const barH = parseFloat(getComputedStyle(header).getPropertyValue('--app-bar-h')) || 0
      header.style.top = `${barH - range}px`
      // Page position from the natural (unstuck) offset — getBoundingClientRect would include the
      // sticky shift once collapsed.
      geo.current = { range, pageTop: header.offsetTop, barH }
      apply()
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads refs only
  }, [])

  useEffect(() => {
    let raf = 0
    let snapTimer = 0
    function onScroll() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(apply)
      clearTimeout(snapTimer)
      snapTimer = window.setTimeout(() => {
        const end = geo.current.pageTop + geo.current.range - geo.current.barH
        const y = window.scrollY
        if (y > 0 && y < end) window.scrollTo({ top: y < end / 2 ? 0 : end, behavior: 'smooth' })
      }, SNAP_IDLE_MS)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(snapTimer)
      window.removeEventListener('scroll', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads refs only
  }, [])

  function expand() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div ref={headerRef} className="mixer-collapse-header">
      <div className="mixer-collapse-band" aria-hidden={false}>
        <div className="mixer-collapse-icons">
          <PlacedStrip onSelect={onSelect} />
        </div>
        <button type="button" className="mixer-field-dock-button" aria-label={t('mixer.field.expand')} onClick={expand}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
      </div>
      {/* Once shrunk, the field is a thumbnail: taps expand instead of hitting 7px orbs. */}
      <div ref={wrapRef} className="mixer-collapse-field" onClick={(e) => e.currentTarget.closest('.is-collapsed') && expand()}>
        {children}
      </div>
    </div>
  )
}
