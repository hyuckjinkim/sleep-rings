import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { radiusToVolume, volumeToRadius } from './geometry'

interface OrbControlsProps {
  placementId: string
  label: string
  onClose: () => void
}

/** Tap popover: volume (radius remap), lock toggle, delete. Bottom sheet, mobile-first. */
export function OrbControls({ placementId, label, onClose }: OrbControlsProps) {
  const { t } = useTranslation()
  const placement = useMixStore((s) => s.current.placements.find((p) => p.id === placementId))
  const updatePlacement = useMixStore((s) => s.updatePlacement)
  const toggleLocked = useMixStore((s) => s.toggleLocked)
  const removePlacement = useMixStore((s) => s.removePlacement)

  if (!placement) return null

  const volumePercent = Math.round(radiusToVolume(placement.radius) * 100)

  return (
    <div className="mixer-controls" role="dialog" aria-label={label}>
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
    </div>
  )
}
