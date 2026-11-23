import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { useDialogFocus } from '../a11y/useDialogFocus'
import { radiusToVolume, shapeForEccentricity, volumeToRadius } from './geometry'
import { soundCategory } from '../library/catalog'
import { canUseFeature, featurePlan, usePlanStore } from '../plan'
import type { PaidFeature } from '../plan'
import { UpgradeSheet } from '../plan/UpgradeSheet'

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

// 탭 뒤 호환 click 은 수십 ms 안에 온다. 사람이 패널을 보고 다시 누르기엔 짧은 여유.
const OPEN_CLICK_GUARD_MS = 400

/** Tap popover: volume (radius remap), lock toggle, delete, orbit mode/speed/shape. Bottom sheet, mobile-first. */
export function OrbControls({ placementId, label, onClose }: OrbControlsProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const placement = useMixStore((s) => s.current.placements.find((p) => p.id === placementId))
  const updatePlacement = useMixStore((s) => s.updatePlacement)
  const toggleLocked = useMixStore((s) => s.toggleLocked)
  const removePlacement = useMixStore((s) => s.removePlacement)
  const plan = usePlanStore((s) => s.plan)
  const [upsell, setUpsell] = useState<PaidFeature | null>(null)

  useDialogFocus(rootRef, onClose)

  // 터치 탭의 pointerup 에서 이 패널이 그려지면(또는 다른 오브로 바뀌면), Chromium 이 그 탭의 호환 click 을 손가락 아래에 새로 생긴
  // 버튼(잠금·삭제·✕)에 떨어뜨린다. 열린 직후 새 pointerdown 없이 오는 포인터 click 한 번은 그 잔여 click 이라
  // 삼킨다. detail 0(키보드·보조기기 활성화)은 그대로 둔다.
  useEffect(() => {
    function swallow(e: MouseEvent) {
      if (e.detail > 0) {
        e.stopPropagation()
        e.preventDefault()
      }
      disarm()
    }
    function disarm() {
      window.clearTimeout(timer)
      document.removeEventListener('click', swallow, true)
      document.removeEventListener('pointerdown', disarm, true)
    }
    const timer = window.setTimeout(disarm, OPEN_CLICK_GUARD_MS)
    document.addEventListener('click', swallow, true)
    document.addEventListener('pointerdown', disarm, true)
    return disarm
  }, [placementId]) // 열린 채 다른 오브를 탭하면 내용만 바뀐다 — 그때도 다시 건다

  // B13: close on a tap/click outside the popover. Taps on an orb are left alone — Orb.tsx's
  // own onTap wiring already selects/reselects correctly, and closing here first would just
  // make it flicker shut-then-open again.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element
      if (rootRef.current?.contains(target)) return
      if (target.closest?.('.mixer-orb')) return
      if (target.closest?.('.mixer-upgrade-backdrop')) return // the paid-control upsell opened from here
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
  const isNoise = soundCategory(placement.soundId) === 'noise'
  const tonePercent = Math.round((placement.tone ?? 0) * 100)

  /** Paid control: the real thing when the plan includes it, else a button that explains + sells it. */
  function paidControl(feature: PaidFeature, control: ReactNode) {
    if (canUseFeature(feature, plan)) return control
    return (
      <div className="mixer-controls-row">
        <button type="button" onClick={() => setUpsell(feature)}>
          {t('mixer.controls.paidLocked', {
            feature: t(`mixer.paidFeature.${feature}`),
            tier: t(`plan.tier.${featurePlan(feature)}`),
          })}
        </button>
      </div>
    )
  }

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
        {/* Action label, not a state label ("궤도 고정" means "tap to fix it"), so this is a plain
            button like the lock button above — aria-pressed on top of it announced "궤도 랜덤,
            pressed", which states the opposite of what the label says. */}
        <button
          type="button"
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
      {isNoise &&
        paidControl(
          'tone',
          <div className="mixer-controls-row">
            <label htmlFor="orb-tone">{t('mixer.controls.tone')}</label>
            <input
              id="orb-tone"
              type="range"
              min={-100}
              max={100}
              step={10}
              value={tonePercent}
              aria-valuetext={
                tonePercent === 0
                  ? t('mixer.controls.toneNeutral')
                  : tonePercent < 0
                    ? t('mixer.controls.toneDarker')
                    : t('mixer.controls.toneBrighter')
              }
              onChange={(e) => updatePlacement(placementId, { tone: Number(e.target.value) / 100 })}
            />
          </div>,
        )}
      {paidControl(
        'variation',
        <div className="mixer-controls-row">
          <button
            type="button"
            onClick={() => updatePlacement(placementId, { variation: placement.variation ? undefined : true })}
          >
            {placement.variation ? t('mixer.controls.variationOff') : t('mixer.controls.variationOn')}
          </button>
        </div>,
      )}
      {upsell && (
        <UpgradeSheet
          plan={featurePlan(upsell)}
          message={t('plan.upgrade.featureBody', {
            feature: t(`mixer.paidFeature.${upsell}`),
            tier: t(`plan.tier.${featurePlan(upsell)}`),
          })}
          onClose={() => setUpsell(null)}
        />
      )}
    </div>
  )
}
