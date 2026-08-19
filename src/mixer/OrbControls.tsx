import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { useDialogFocus } from '../a11y/useDialogFocus'
import { radiusToVolume, volumeToRadius } from './geometry'
import { shapeForEccentricity } from './Orb'

interface OrbControlsProps {
  placementId: string
  label: string
  onClose: () => void
}

// Approval-scope sliders (docs/PLAN.md v0.2.0): orbit speed and shape are normalized to a
// 0-100% slider range over these caps rather than exposing the raw radians/eccentricity units.
const MAX_ORBIT_SPEED = 0.3
const MAX_ECCENTRICITY = 0.85

// E5a: default depth when the "volume swell" toggle is first turned on (v020-review.md MEDIUM-1
// — the engine/math side was already done in E3, this just gives it a UI path).
const DEFAULT_VOLUME_CURVE_DEPTH = 0.5

/** Tap popover: volume (radius remap), lock toggle, delete, orbit mode/speed/shape. Bottom sheet, mobile-first. */
export function OrbControls({ placementId, label, onClose }: OrbControlsProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const placement = useMixStore((s) => s.current.placements.find((p) => p.id === placementId))
  const updatePlacement = useMixStore((s) => s.updatePlacement)
  const toggleLocked = useMixStore((s) => s.toggleLocked)
  const removePlacement = useMixStore((s) => s.removePlacement)

  useDialogFocus(rootRef, onClose)

  // B13: close on a tap/click outside the popover. Taps on an orb are left alone — Orb.tsx's
  // own onTap wiring already selects/reselects correctly, and closing here first would just
  // make it flicker shut-then-open again.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element
      if (rootRef.current?.contains(target)) return
      if (target.closest?.('.mixer-orb')) return
      onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  if (!placement) return null

  const volumePercent = Math.round(radiusToVolume(placement.radius) * 100)
  const eccentricity = placement.orbit.shape.kind === 'ellipse' ? placement.orbit.shape.eccentricity : 0
  const isFixed = placement.orbit.mode === 'fixed'
  const curveDepth = placement.orbit.volumeCurve?.depth ?? 0
  const hasCurve = curveDepth > 0

  return (
    <div
      ref={rootRef}
      className="mixer-controls"
      role="dialog"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose() // B13
      }}
    >
      <div className="mixer-controls-row">
        <strong>{label}</strong>
        <button type="button" onClick={onClose} aria-label={t('mixer.controls.close')}>
          ✕
        </button>
      </div>
      <div className="mixer-controls-row">
        <label htmlFor="orb-volume">{t('mixer.controls.volume')}</label>
        <input
          id="orb-volume"
          type="range"
          min={0}
          max={100}
          value={volumePercent}
          onChange={(e) => updatePlacement(placementId, { radius: volumeToRadius(Number(e.target.value) / 100) })}
        />
        <span>{volumePercent}%</span>
      </div>
      <div className="mixer-controls-row">
        <button type="button" onClick={() => toggleLocked(placementId)}>
          {placement.locked ? t('mixer.controls.unlock') : t('mixer.controls.lock')}
        </button>
        <button
          type="button"
          onClick={() => {
            removePlacement(placementId)
            onClose()
          }}
        >
          {t('mixer.controls.delete')}
        </button>
      </div>

      <hr className="mixer-controls-divider" />

      <div className="mixer-controls-row">
        <button
          type="button"
          aria-pressed={isFixed}
          onClick={() => updatePlacement(placementId, { orbit: { mode: isFixed ? 'random' : 'fixed' } })}
        >
          {isFixed ? t('mixer.controls.orbitRandom') : t('mixer.controls.orbitFixed')}
        </button>
      </div>
      <div className="mixer-controls-row">
        <label htmlFor="orb-speed">{t('mixer.controls.orbitSpeed')}</label>
        <input
          id="orb-speed"
          type="range"
          min={0}
          max={100}
          value={Math.round((placement.orbit.speed / MAX_ORBIT_SPEED) * 100)}
          onChange={(e) => updatePlacement(placementId, { orbit: { speed: (Number(e.target.value) / 100) * MAX_ORBIT_SPEED } })}
        />
      </div>
      <div className="mixer-controls-row">
        <label htmlFor="orb-shape">{t('mixer.controls.orbitShape')}</label>
        <input
          id="orb-shape"
          type="range"
          min={0}
          max={100}
          value={Math.round((eccentricity / MAX_ECCENTRICITY) * 100)}
          onChange={(e) =>
            updatePlacement(placementId, {
              orbit: { shape: shapeForEccentricity((Number(e.target.value) / 100) * MAX_ECCENTRICITY) },
            })
          }
        />
      </div>
      <div className="mixer-controls-row">
        <button
          type="button"
          aria-pressed={hasCurve}
          onClick={() =>
            updatePlacement(placementId, {
              orbit: { volumeCurve: hasCurve ? undefined : { depth: DEFAULT_VOLUME_CURVE_DEPTH } },
            })
          }
        >
          {hasCurve ? t('mixer.controls.volumeCurveOff') : t('mixer.controls.volumeCurveOn')}
        </button>
      </div>
      {hasCurve && (
        <div className="mixer-controls-row">
          <label htmlFor="orb-curve-depth">{t('mixer.controls.volumeCurveDepth')}</label>
          <input
            id="orb-curve-depth"
            type="range"
            min={0}
            max={100}
            value={Math.round(curveDepth * 100)}
            onChange={(e) => updatePlacement(placementId, { orbit: { volumeCurve: { depth: Number(e.target.value) / 100 } } })}
          />
        </div>
      )}
    </div>
  )
}
