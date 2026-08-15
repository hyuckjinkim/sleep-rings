import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMixStore } from '../mixer/store'
import { ScreenDimSettings } from '../screen/ScreenDimSettings'
import { ScreenDimOverlay } from '../screen/ScreenDimOverlay'

const PRESET_MINUTES = [15, 30, 45, 60, 90]

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Restrained sleep-timer + named-preset panel, per benchmark §4/§6 and task #10. */
export function SleepControls() {
  const { t } = useTranslation()
  const sleepEndsAt = useMixStore((s) => s.sleepEndsAt)
  const sleeping = useMixStore((s) => s.sleeping)
  const startSleepTimer = useMixStore((s) => s.startSleepTimer)
  const cancelSleepTimer = useMixStore((s) => s.cancelSleepTimer)
  const presets = useMixStore((s) => s.presets)
  const savePreset = useMixStore((s) => s.savePreset)
  const loadPreset = useMixStore((s) => s.loadPreset)
  const deletePreset = useMixStore((s) => s.deletePreset)
  const masterVolume = useMixStore((s) => s.current.masterVolume)
  const setMasterVolume = useMixStore((s) => s.setMasterVolume)
  const [presetName, setPresetName] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!sleepEndsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sleepEndsAt])

  function handleSave() {
    const name = presetName.trim()
    if (!name) return
    savePreset(name)
    setPresetName('')
  }

  return (
    <>
      {/* Fixed-position full-viewport overlay — lives here only because this component is
          already mounted near the app root (via Mixer.tsx); DOM position doesn't matter for it. */}
      <ScreenDimOverlay />
      <div className="mixer-sleep" aria-label={t('mixer.sleep.title')}>
        <div className="mixer-master">
          <label htmlFor="master-volume">{t('mixer.master.volume')}</label>
          <input
            id="master-volume"
            type="range"
            min={0}
            max={100}
            value={Math.round(masterVolume * 100)}
            onChange={(e) => setMasterVolume(Number(e.target.value) / 100)}
          />
          <span>{Math.round(masterVolume * 100)}%</span>
        </div>

        <div className="mixer-sleep-timer">
          {PRESET_MINUTES.map((minutes) => (
            <button key={minutes} type="button" onClick={() => startSleepTimer(minutes)}>
              {t('mixer.sleep.minutes', { minutes })}
            </button>
          ))}
          {/* B3: disabled={!sleepEndsAt} couldn't distinguish "no timer set" from "timer just
              finished" — both zero out sleepEndsAt, but only the first should disable "Off".
              B17 keeps `sleeping` in sync elsewhere so this only needs the one extra check. */}
          <button type="button" onClick={cancelSleepTimer} disabled={!sleepEndsAt && !sleeping}>
            {t('mixer.sleep.off')}
          </button>
          {sleepEndsAt && (
            <span className="mixer-sleep-remaining">{formatRemaining(sleepEndsAt - now)}</span>
          )}
        </div>

        <ScreenDimSettings />

        <div className="mixer-presets">
          <div className="mixer-presets-save">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={t('mixer.presets.namePlaceholder')}
              aria-label={t('mixer.presets.namePlaceholder')}
            />
            <button type="button" onClick={handleSave} disabled={!presetName.trim()}>
              {t('mixer.presets.save')}
            </button>
          </div>
          {presets.length > 0 && (
            <ul className="mixer-presets-list">
              {presets.map((preset) => (
                <li key={preset.id}>
                  <span>{preset.name}</span>
                  <button type="button" onClick={() => loadPreset(preset.id)}>
                    {t('mixer.presets.load')}
                  </button>
                  <button type="button" onClick={() => deletePreset(preset.id)}>
                    {t('mixer.presets.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
