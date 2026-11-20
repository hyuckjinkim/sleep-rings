import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { nextAlarmAt, useMixStore } from '../mixer/store'
import { PUBLIC_WEB_URL, shareUrl } from '../mixer/share'
import { usePlaybackSettings } from './settings'
import { soundName } from '../library/catalog'
import { canUseSound, requiredPlan, usePlanStore } from '../plan'
// Gentle existing synth sounds; the first is free so the alarm itself always is. The others keep
// their catalog tier (alarm-sound variety is a paid depth, docs/research/feature-candidates.md).
const WAKE_SOUNDS = ['nature-brook', 'birds', 'singing-bowl']

const PRESET_MINUTES = [15, 30, 45, 60, 90]

const SHARE_STATUS_MS = 3000

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Restrained sleep-timer + named-preset panel, per benchmark §4/§6 and task #10. */
export function SleepControls() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en' : 'ko'
  const plan = usePlanStore((s) => s.plan)
  const alarmAt = useMixStore((s) => s.alarmAt)
  const alarmRinging = useMixStore((s) => s.alarmRinging)
  const armAlarm = useMixStore((s) => s.armAlarm)
  const dismissAlarm = useMixStore((s) => s.dismissAlarm)
  const [wakeTime, setWakeTime] = useState('07:00')
  const [wakeSound, setWakeSound] = useState(WAKE_SOUNDS[0])
  const bedtimeAt = useMixStore((s) => s.bedtimeAt)
  const armBedtime = useMixStore((s) => s.armBedtime)
  const cancelBedtime = useMixStore((s) => s.cancelBedtime)
  const [bedtime, setBedtime] = useState('23:00')
  const sleepEndsAt = useMixStore((s) => s.sleepEndsAt)
  const sleeping = useMixStore((s) => s.sleeping)
  const startSleepTimer = useMixStore((s) => s.startSleepTimer)
  const cancelSleepTimer = useMixStore((s) => s.cancelSleepTimer)
  const presets = useMixStore((s) => s.presets)
  const savePreset = useMixStore((s) => s.savePreset)
  const presetLimitNotice = useMixStore((s) => s.presetLimitNotice)
  const loadPreset = useMixStore((s) => s.loadPreset)
  const deletePreset = useMixStore((s) => s.deletePreset)
  const masterVolume = useMixStore((s) => s.current.masterVolume)
  const setMasterVolume = useMixStore((s) => s.setMasterVolume)
  const sleepFadeSec = usePlaybackSettings((s) => s.sleepFadeSec)
  const [customHours, setCustomHours] = useState('')
  const [customMinutes, setCustomMinutes] = useState('')
  const customTotal = (Number(customHours) || 0) * 60 + (Number(customMinutes) || 0)
  const [presetName, setPresetName] = useState('')
  const hasPlacements = useMixStore((s) => s.current.placements.length > 0)
  const [shareStatus, setShareStatus] = useState<'copied' | 'failed' | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!sleepEndsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sleepEndsAt])

  useEffect(() => {
    if (!shareStatus) return
    const id = setTimeout(() => setShareStatus(null), SHARE_STATUS_MS)
    return () => clearTimeout(id)
  }, [shareStatus])

  // Native share sheet where there is one, else copy to the clipboard. Native builds link to the
  // public web app — their own origin (capacitor://localhost) means nothing to the receiver.
  async function handleShare() {
    const url = shareUrl(useMixStore.getState().current, Capacitor.isNativePlatform() ? PUBLIC_WEB_URL : location.href)
    if (navigator.share) {
      try {
        await navigator.share({ title: t('app.title'), url })
        return
      } catch (err) {
        if ((err as Error | null)?.name === 'AbortError') return // the user closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('copied')
    } catch {
      setShareStatus('failed')
    }
  }

  function handleSave() {
    const name = presetName.trim()
    if (!name) return
    savePreset(name)
    setPresetName('')
  }

  return (
    <>
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
            <button key={minutes} type="button" onClick={() => startSleepTimer(minutes, sleepFadeSec)}>
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
          <span className="mixer-sleep-custom">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={23}
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              aria-label={t('mixer.sleep.customHours')}
              placeholder={t('mixer.sleep.hoursShort')}
            />
            <span aria-hidden="true">:</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              aria-label={t('mixer.sleep.customMinutes')}
              placeholder={t('mixer.sleep.minutesShort')}
            />
            <button
              type="button"
              disabled={!(customTotal > 0)}
              onClick={() => startSleepTimer(customTotal, sleepFadeSec)}
            >
              {t('mixer.sleep.customStart')}
            </button>
          </span>
        </div>

        <div className="mixer-alarm" role="group" aria-labelledby="mixer-bedtime-title">
          <span className="mixer-alarm-title" id="mixer-bedtime-title">
            {t('mixer.bedtime.title')}
          </span>
          {bedtimeAt ? (
            <div className="mixer-alarm-row">
              <span className="mixer-sleep-remaining">
                {t('mixer.bedtime.armed', {
                  time: new Date(bedtimeAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
                })}
              </span>
              <button type="button" onClick={cancelBedtime}>
                {t('mixer.bedtime.cancel')}
              </button>
            </div>
          ) : (
            <div className="mixer-alarm-row">
              <input
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                aria-label={t('mixer.bedtime.time')}
              />
              <button type="button" disabled={!bedtime || !hasPlacements} onClick={() => armBedtime(nextAlarmAt(bedtime))}>
                {t('mixer.bedtime.set')}
              </button>
            </div>
          )}
          <p className="mixer-alarm-note">{t('mixer.bedtime.note')}</p>
        </div>

        <div className="mixer-alarm" role="group" aria-labelledby="mixer-alarm-title">
          <span className="mixer-alarm-title" id="mixer-alarm-title">
            {t('mixer.alarm.title')}
          </span>
          {alarmRinging ? (
            <button type="button" className="mixer-alarm-stop" onClick={dismissAlarm}>
              {t('mixer.alarm.stop')}
            </button>
          ) : alarmAt ? (
            <div className="mixer-alarm-row">
              <span className="mixer-sleep-remaining">
                {t('mixer.alarm.armed', {
                  time: new Date(alarmAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
                })}
              </span>
              <button type="button" onClick={dismissAlarm}>
                {t('mixer.alarm.cancel')}
              </button>
            </div>
          ) : (
            <>
              <div className="mixer-alarm-row">
                <input
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  aria-label={t('mixer.alarm.time')}
                />
                <button type="button" disabled={!wakeTime} onClick={() => armAlarm(nextAlarmAt(wakeTime), wakeSound)}>
                  {t('mixer.alarm.set')}
                </button>
              </div>
              <div className="mixer-alarm-row" role="group" aria-label={t('mixer.alarm.sound')}>
                {WAKE_SOUNDS.map((id) => {
                  const name = soundName(id, locale)
                  const locked = !canUseSound(id, plan)
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={wakeSound === id}
                      disabled={locked}
                      title={locked ? t('plan.upgrade.body', { sound: name, tier: t(`plan.tier.${requiredPlan(id)}`) }) : undefined}
                      onClick={() => setWakeSound(id)}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <p className="mixer-alarm-note">{t('mixer.alarm.note')}</p>
        </div>

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
            <button type="button" onClick={() => void handleShare()} disabled={!hasPlacements}>
              {t('mixer.share.button')}
            </button>
          </div>
          {shareStatus && (
            <p className="mixer-preset-notice" role="status">
              {t(`mixer.share.${shareStatus}`)}
            </p>
          )}
          {presetLimitNotice && (
            <p className="mixer-preset-notice" role="status">
              {t('mixer.presetLimit', { name: presetLimitNotice.droppedName })}
            </p>
          )}
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
