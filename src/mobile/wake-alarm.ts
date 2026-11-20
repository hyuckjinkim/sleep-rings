// Closed-app wake alarm. The in-app alarm runs on the Web Audio clock and dies with the app; this one
// rings with the app killed. Android (android/app/src/main/java/com/sleeprings/app/WakeAlarm*.kt):
// AlarmManager.setAlarmClock plus a native USAGE_ALARM player. iOS 26+
// (ios/App/App/WakeAlarmPlugin.swift): AlarmKit, system alarm sound, no fade. Below iOS 26 the
// plugin reports UNAVAILABLE and iOS keeps the stage 3 backup notification.
//
// Double-alarm rule — JS disarms it: the native trigger sits NATIVE_ALARM_DELAY_MS after the wake
// time, and the in-app alarm cancels it when it fires on time (store.ts). A late in-app timer means
// the WebView was stalled, so its audio clock can't be trusted either and the native alarm is left
// to ring. The failure mode is two alarms, never none. The native side never guesses app state.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  ALARM_NOTIFICATION_ID,
  areRemindersDenied,
  cancelReminder,
  requestReminderPermission,
  scheduleReminder,
} from './notifications'
import type { ReminderText } from './notifications'

interface WakeAlarmPlugin {
  /** title: the iOS alarm's label, already translated (Android uses its own strings.xml). */
  schedule(options: { at: number; soundId: string; fadeSec: number; title: string }): Promise<void>
  cancel(): Promise<void>
  canScheduleExact(): Promise<{ value: boolean }>
  /** iOS only: the app's Settings page; resolves with the alarm access on return. */
  openSettings(): Promise<{ value: boolean }>
}

const WakeAlarm = registerPlugin<WakeAlarmPlugin>('WakeAlarm')

export const NATIVE_ALARM_DELAY_MS = 15_000

const isAndroid = () => Capacitor.getPlatform() === 'android'
const isIos = () => Capacitor.getPlatform() === 'ios'

/**
 * Whether the native alarm can be set: Android 12+ needs the user-granted "Alarms & reminders"
 * (SCHEDULE_EXACT_ALARM) access, iOS the AlarmKit access (true while undecided — the system asks
 * when the alarm is armed). A check, never a prompt. null = no native alarm here (web, iOS < 26).
 */
export async function canScheduleNativeWakeAlarm(): Promise<boolean | null> {
  if (!isAndroid() && !isIos()) return null
  try {
    return (await WakeAlarm.canScheduleExact()).value
  } catch (err) {
    // UNAVAILABLE = iOS below 26, an expected answer rather than a failure.
    if ((err as { code?: string } | null)?.code !== 'UNAVAILABLE') console.warn('[wake-alarm] canScheduleExact failed', err)
    return null
  }
}

export interface AlarmBackup {
  notificationsDenied: boolean
  /** As canScheduleNativeWakeAlarm(): false = the native alarm needs the exact-alarm/AlarmKit permission. */
  exactAlarm: boolean | null
}

/**
 * Arm the closed-app backup for the in-app alarm at atMs: the native alarm when Android allows
 * exact alarms or iOS allows AlarmKit, else the stage 3 notification (1001) — never both, or a
 * dead app gets two.
 */
export async function scheduleAlarmBackup(
  atMs: number,
  soundId: string,
  fadeSec: number,
  text: ReminderText,
  isArmed: () => boolean,
): Promise<AlarmBackup> {
  let exactAlarm = await canScheduleNativeWakeAlarm()
  if (exactAlarm) {
    try {
      if (isArmed()) await WakeAlarm.schedule({ at: atMs + NATIVE_ALARM_DELAY_MS, soundId, fadeSec, title: text.title })
      cancelReminder(ALARM_NOTIFICATION_ID) // one set before the permission was granted
      // Android's ringing notification carries the Stop action, so it still wants notification
      // permission. AlarmKit draws its own alert: on iOS only report, don't prompt.
      const denied = isIos() ? await areRemindersDenied() : !(await requestReminderPermission().catch(() => false))
      return { notificationsDenied: denied, exactAlarm }
    } catch (err) {
      console.warn('[wake-alarm] schedule failed', err)
      // e.g. the iOS AlarmKit prompt was just refused: false shows the way to Settings. Anything
      // else: null, so the UI promises the notification below, not a closed-app sound.
      exactAlarm = (await canScheduleNativeWakeAlarm()) === false ? false : null
    }
  }
  // Same offset as the native alarm: at atMs itself it would land on the in-app alarm's own start,
  // before the in-app timer could drop it.
  const shown = await scheduleReminder(ALARM_NOTIFICATION_ID, atMs + NATIVE_ALARM_DELAY_MS, text, isArmed)
  return { notificationsDenied: !shown, exactAlarm }
}

/** Drop a pending native alarm and silence one that is ringing. No-op on web. */
export function cancelNativeWakeAlarm(): void {
  if (!isAndroid() && !isIos()) return
  void WakeAlarm.cancel().catch((err: unknown) => console.warn('[wake-alarm] cancel failed', err))
}

/**
 * Open the system "Alarms & reminders" screen (Android, through local-notifications, which already
 * wraps it) or the app's Settings page (iOS, for the AlarmKit access) and resolve with whether
 * access is granted once the user comes back. False on web.
 */
export async function openExactAlarmSettings(): Promise<boolean> {
  if (!isAndroid() && !isIos()) return false
  try {
    if (isIos()) return (await WakeAlarm.openSettings()).value
    return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === 'granted'
  } catch (err) {
    console.warn('[wake-alarm] exact alarm settings failed', err)
    return false
  }
}
