import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { enginePlacement, useMixStore } from './store'
import { polarToUnit } from './geometry'
import { isInDeleteZone } from './deleteZone'
import { soundEngine } from './engine/instance'
import { soundCategory, soundName } from '../library/catalog'
import { Orb } from './Orb'
import type { Locale } from './types'

const RANDOM_FLIP_MIN_MS = 8000
const RANDOM_FLIP_MAX_MS = 20000

interface OrbitFieldProps {
  fieldRef: RefObject<HTMLDivElement | null>
  selectedId: string | null
  onSelect: (id: string) => void
}

export function OrbitField({ fieldRef, selectedId, onSelect }: OrbitFieldProps) {
  const { t, i18n } = useTranslation()
  const placements = useMixStore((s) => s.current.placements)
  const locale = (i18n.language === 'en' ? 'en' : 'ko') as Locale

  const orbRefs = useRef(new Map<string, HTMLDivElement>()).current
  const liveAngles = useRef(new Map<string, number>()).current
  const storeAngles = useRef(new Map<string, number>()).current // liveAngles 를 시작한 store angle
  const nextFlipAt = useRef(new Map<string, number>()).current
  const interactingIds = useRef(new Set<string>()).current
  // B11: the delete zone should only be visible while an orb is actually being dragged, not
  // just because a popover is open (that path adds to interactingIds separately below via
  const [isDragging, setIsDragging] = useState(false)

  function registerEl(id: string, el: HTMLDivElement | null) {
    if (el) {
      orbRefs.set(id, el)
    } else {
      orbRefs.delete(id)
      liveAngles.delete(id)
      storeAngles.delete(id)
      nextFlipAt.delete(id)
    }
  }

  function beginInteraction(id: string): number | undefined {
    interactingIds.add(id)
    // Derive from the id set, not a counter: a pinch fires begin once per finger but end only
    // once for the orb, so the counter drifted upward and never returned to 0 — leaving the
    // delete-zone banner stuck on until reload (.omc/qa4/functional.md MEDIUM-1).
    setIsDragging(interactingIds.size > 0)
    return liveAngles.get(id)
  }
  // L1 fix: only drop the live angle when the gesture actually committed a new one to the
  // store (drag/swipe). store.angle is otherwise stale (orbit motion never writes it back —
  // it only lives in liveAngles), so a blind delete here snapped taps/deselects back to the
  // placement's original creation angle instead of wherever the orbit had actually spun it to.
  function endInteraction(id: string, committedPosition = false) {
    interactingIds.delete(id)
    if (committedPosition) liveAngles.delete(id)
    setIsDragging(interactingIds.size > 0)
  }

  // Freeze the orb behind an open control popover so its radius slider isn't fighting orbit
  // motion. The popover never touches angle (see OrbControls.tsx), so no liveAngles reset here.
  useEffect(() => {
    if (!selectedId) return
    interactingIds.add(selectedId)
    return () => {
      interactingIds.delete(selectedId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    let raf: number
    let last = performance.now()
    // visual-theme.md §9: reduced-motion is this layer's responsibility, not CSS's — freeze orbiting.
    const reducedMotion =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      // Layout width, not the rendered rect: the orb's translate lives *inside* the field, so if a
      // layout scales the field with transform, the rect width would apply that scale twice.
      const r = fieldRef.current?.offsetWidth ?? 0
      const fieldRadiusPx = r / 2
      const state = useMixStore.getState()
      const current = state.current.placements

      for (const p of current) {
        const el = orbRefs.get(p.id)
        if (!el || interactingIds.has(p.id)) continue

        // store angle 이 바뀌면(같은 id 를 쓰는 프리셋 불러오기 등) 그 자리부터 다시 돈다.
        if (storeAngles.get(p.id) !== p.angle) {
          storeAngles.set(p.id, p.angle)
          liveAngles.delete(p.id)
        }
        let angle = liveAngles.get(p.id) ?? p.angle
        if (!reducedMotion && !state.sleeping && !p.locked && p.orbit.speed > 0) {
          if (p.orbit.mode === 'random') {
            const flipAt = nextFlipAt.get(p.id)
            if (flipAt == null) {
              nextFlipAt.set(p.id, now + RANDOM_FLIP_MIN_MS + Math.random() * (RANDOM_FLIP_MAX_MS - RANDOM_FLIP_MIN_MS))
            } else if (now >= flipAt) {
              useMixStore.getState().updatePlacement(p.id, { orbit: { direction: p.orbit.direction === 1 ? -1 : 1 } })
              nextFlipAt.set(p.id, now + RANDOM_FLIP_MIN_MS + Math.random() * (RANDOM_FLIP_MAX_MS - RANDOM_FLIP_MIN_MS))
            }
          }
          angle += p.orbit.speed * p.orbit.direction * dt
          liveAngles.set(p.id, angle)
          // engine throttles/ramps internally (audio-engine.md §2) — safe to call every frame.
          soundEngine.setPlacement(enginePlacement({ ...p, angle }))
        } else {
          liveAngles.set(p.id, angle)
        }

        const { x, y } = polarToUnit(p.radius, angle, p.orbit.shape)
        el.style.transform = `translate(${x * fieldRadiusPx}px, ${y * fieldRadiusPx}px)`
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mixer-field" ref={fieldRef} role="region" aria-label={t('mixer.field.label')}>
      {/* B16: 25/50/75% radius guides (100% is already the field's own border), per
          visual-theme.md §4 — pure decoration, opacity rises toward the center for depth. */}
      <div className="orbit-ring" style={{ width: '25%', height: '25%', opacity: 0.5 }} aria-hidden="true" />
      <div className="orbit-ring" style={{ width: '50%', height: '50%', opacity: 0.4 }} aria-hidden="true" />
      <div className="orbit-ring" style={{ width: '75%', height: '75%', opacity: 0.3 }} aria-hidden="true" />
      {placements.length === 0 && <p className="mixer-field-hint">{t('mixer.field.hint')}</p>}
      <div className="mixer-field-head" aria-hidden="true">
        {/* B5: was a literal 🌙 emoji — unreliable cold-start rendering and no visual tie to
            assets/icon.svg. Same subtract-circle crescent technique, inlined so no asset path
            is needed. The second circle is filled with the head's own background to "cut out". */}
        <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
          <circle cx="50" cy="50" r="42" fill="var(--so-text-primary, #f0f0f5)" />
          <circle cx="64" cy="38" r="38" fill="var(--so-bg-elevated, #12182b)" />
        </svg>
      </div>
      {placements.map((p) => (
        <Orb
          key={p.id}
          placement={p}
          label={soundName(p.soundId, locale)}
          category={soundCategory(p.soundId)}
          fieldRef={fieldRef}
          registerEl={registerEl}
          isDeleteZone={(clientY) => isInDeleteZone(fieldRef, clientY)}
          selected={p.id === selectedId}
          onTap={onSelect}
          beginInteraction={beginInteraction}
          endInteraction={endInteraction}
        />
      ))}
      <div className={`mixer-field-delete-zone${isDragging ? ' is-visible' : ''}`} aria-hidden="true">
        {t('mixer.field.deleteZone')}
      </div>
    </div>
  )
}
