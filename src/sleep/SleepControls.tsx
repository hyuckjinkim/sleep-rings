import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { ALARM_FADE_SEC, WAKE_SOUNDS, nextAlarmAt, useMixStore } from '../mixer/store'
import { PUBLIC_WEB_URL, shareUrl } from '../mixer/share'
import { usePlaybackSettings } from './settings'
import { soundName } from '../library/catalog'
import { canUseSound, requiredPlan, usePlanStore } from '../plan'
import { ALARM_NOTIFICATION_ID, BEDTIME_NOTIFICATION_ID, areRemindersDenied, scheduleReminder } from '../mobile/notifications'
import { NATIVE_ALARM_DELAY_MS, canScheduleNativeWakeAlarm, openExactAlarmSettings, scheduleAlarmBackup } from '../mobile/wake-alarm'

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
  const [pickedWakeSound, setWakeSound] = useState(WAKE_SOUNDS[0])
  // A pick the plan no longer includes (a downgrade) falls back to the free one, or Set would do nothing.
  const wakeSound = canUseSound(pickedWakeSound, plan) ? pickedWakeSound : WAKE_SOUNDS[0]
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
  const [notificationsDenied, setNotificationsDenied] = useState(false) // app-wide, so both sections
  const [exactAlarm, setExactAlarm] = useState<boolean | null>(null) // closed-app alarm, wake-alarm.ts
  const isNative = Capacitor.isNativePlatform()
  const alarmIos = Capacitor.getPlatform() === 'ios' ? 'Ios' : '' // AlarmKit: no fade, Settings-page access

  useEffect(() => {
    if (!sleepEndsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sleepEndsAt])

  useEffect(() => {
    void areRemindersDenied().then(setNotificationsDenied) // a check, never a prompt
    void canScheduleNativeWakeAlarm().then(setExactAlarm) // likewise
  }, [])

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

  // Native backup notification for when the app gets closed before atMs. The in-app alarm/start is
  // already armed; a denied permission only costs the backup, which the note below says.
  function scheduleBackup(id: number, atMs: number, kind: 'alarm' | 'bedtime') {
    const isArmed = () => {
      const s = useMixStore.getState()
      return (kind === 'alarm' ? s.alarmAt : s.bedtimeAt) === atMs
    }
    if (!isArmed()) return
    const text = { title: t(`mixer.${kind}.notificationTitle`), body: t(`mixer.${kind}.notificationBody`) }
    if (kind === 'alarm') {
      void scheduleAlarmBackup(atMs, wakeSound, ALARM_FADE_SEC, text, isArmed).then((backup) => {
        setNotificationsDenied(backup.notificationsDenied)
        setExactAlarm(backup.exactAlarm)
      })
      return
    }
    // Offset like the alarm's, so the in-app start at atMs drops it before it shows.
    void scheduleReminder(id, atMs + NATIVE_ALARM_DELAY_MS, text, isArmed).then((ok) => setNotificationsDenied(!ok))
  }

  // Back from the system "Alarms & reminders" screen (iOS: the app's Settings page): move an armed
  // alarm's backup to the native one.
  async function handleOpenExactAlarmSettings() {
    if (!(await openExactAlarmSettings())) return
    setExactAlarm(true)
    const at = useMixStore.getState().alarmAt
    if (at) scheduleBackup(ALARM_NOTIFICATION_ID, at, 'alarm')
  }

  function handleArmAlarm() {
    const at = nextAlarmAt(wakeTime)
    armAlarm(at, wakeSound)
    scheduleBackup(ALARM_NOTIFICATION_ID, at, 'alarm')
  }

  function handleArmBedtime() {
    const at = nextAlarmAt(bedtime)
    armBedtime(at)
    scheduleBackup(BEDTIME_NOTIFICATION_ID, at, 'bedtime')
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
              <button type="button" disabled={!bedtime || !hasPlacements} onClick={handleArmBedtime}>
                {t('mixer.bedtime.set')}
              </button>
            </div>
          )}
          <p className="mixer-alarm-note">{t('mixer.bedtime.note')}</p>
          {isNative && (
            <p className="mixer-alarm-note" role="status">
              {t(notificationsDenied ? 'mixer.notificationsDenied' : 'mixer.bedtime.nativeNote')}
            </p>
          )}
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
                <button type="button" disabled={!wakeTime} onClick={handleArmAlarm}>
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
          {/* With the native alarm, "closing the app turns it off" is no longer true — closedAppSound says it all. */}
          {!exactAlarm && <p className="mixer-alarm-note">{t('mixer.alarm.note')}</p>}
          {isNative && (
            <p className="mixer-alarm-note" role="status">
              {t(
                exactAlarm
                  ? `mixer.alarm.closedAppSound${alarmIos}`
                  : notificationsDenied
                    ? 'mixer.notificationsDenied'
                    : 'mixer.alarm.nativeNote',
              )}
            </p>
          )}
          {exactAlarm === false && (
            <>
              <p className="mixer-alarm-note">{t(`mixer.alarm.exactNeeded${alarmIos}`)}</p>
              <div className="mixer-alarm-row">
                <button type="button" onClick={() => void handleOpenExactAlarmSettings()}>
                  {t(`mixer.alarm.exactOpen${alarmIos}`)}
                </button>
              </div>
            </>
          )}
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
