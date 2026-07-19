import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { polarToUnit } from './geometry'
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

/** Bottom band (as a fraction of field height) where dropping/releasing an orb deletes it. */
export function isInDeleteZone(fieldRef: RefObject<HTMLDivElement | null>, clientY: number): boolean {
  const rect = fieldRef.current?.getBoundingClientRect()
  if (!rect) return false
  return clientY >= rect.bottom - rect.height * 0.22
}

export function OrbitField({ fieldRef, selectedId, onSelect }: OrbitFieldProps) {
  const { t, i18n } = useTranslation()
  const placements = useMixStore((s) => s.current.placements)
  const locale = (i18n.language === 'en' ? 'en' : 'ko') as Locale

  const orbRefs = useRef(new Map<string, HTMLDivElement>()).current
  const liveAngles = useRef(new Map<string, number>()).current
  const nextFlipAt = useRef(new Map<string, number>()).current
  const interactingIds = useRef(new Set<string>()).current

  function registerEl(id: string, el: HTMLDivElement | null) {
    if (el) {
      orbRefs.set(id, el)
    } else {
      orbRefs.delete(id)
      liveAngles.delete(id)
      nextFlipAt.delete(id)
    }
  }

  function beginInteraction(id: string) {
    interactingIds.add(id)
  }
  // L1 fix: only drop the live angle when the gesture actually committed a new one to the
  // store (drag/swipe). store.angle is otherwise stale (orbit motion never writes it back —
  // it only lives in liveAngles), so a blind delete here snapped taps/deselects back to the
  // placement's original creation angle instead of wherever the orbit had actually spun it to.
  function endInteraction(id: string, committedPosition = false) {
    interactingIds.delete(id)
    if (committedPosition) liveAngles.delete(id)
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
      const r = fieldRef.current?.getBoundingClientRect().width ?? 0
      const fieldRadiusPx = r / 2
      const state = useMixStore.getState()
      const current = state.current.placements

      for (const p of current) {
        const el = orbRefs.get(p.id)
        if (!el || interactingIds.has(p.id)) continue

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
          soundEngine.setPlacement({ ...p, angle })
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
    <div className="mixer-field" ref={fieldRef} aria-label={t('mixer.field.label')}>
      <div className="mixer-field-head" aria-hidden="true">
        🌙
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
      <div className="mixer-field-delete-zone" aria-hidden="true">
        {t('mixer.field.deleteZone')}
      </div>
    </div>
  )
}
