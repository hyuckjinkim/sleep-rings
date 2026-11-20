// Closed-app wake alarm, Android only (android/app/src/main/java/com/sleeprings/app/WakeAlarm*.kt).
// The in-app alarm runs on the Web Audio clock and dies with the app; this one is
// AlarmManager.setAlarmClock plus a native USAGE_ALARM player, so it rings with the app killed.
//
// Double-alarm rule — JS disarms it: the native trigger sits NATIVE_ALARM_DELAY_MS after the wake
// time, and the in-app alarm cancels it when it fires on time (store.ts). A late in-app timer means
// the WebView was stalled, so its audio clock can't be trusted either and the native alarm is left
// to ring. The failure mode is two alarms, never none. The native side never guesses app state.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { ALARM_NOTIFICATION_ID, cancelReminder, requestReminderPermission, scheduleReminder } from './notifications'
import type { ReminderText } from './notifications'

interface WakeAlarmPlugin {
  schedule(options: { at: number; soundId: string; fadeSec: number }): Promise<void>
  cancel(): Promise<void>
  canScheduleExact(): Promise<{ value: boolean }>
}

const WakeAlarm = registerPlugin<WakeAlarmPlugin>('WakeAlarm')

export const NATIVE_ALARM_DELAY_MS = 15_000

const isAndroid = () => Capacitor.getPlatform() === 'android'

/**
 * Whether the native alarm can be set: Android 12+ needs the user-granted "Alarms & reminders"
 * (SCHEDULE_EXACT_ALARM) access. A check, never a prompt. null = no native alarm here (web, iOS).
 */
export async function canScheduleNativeWakeAlarm(): Promise<boolean | null> {
  if (!isAndroid()) return null
  try {
    return (await WakeAlarm.canScheduleExact()).value
  } catch (err) {
    console.warn('[wake-alarm] canScheduleExact failed', err)
    return null
  }
}

export interface AlarmBackup {
  notificationsDenied: boolean
  /** As canScheduleNativeWakeAlarm(): false = the native alarm needs the exact-alarm permission. */
  exactAlarm: boolean | null
}

/**
 * Arm the closed-app backup for the in-app alarm at atMs: the native alarm when Android allows
 * exact alarms, else the stage 3 notification (1001) — never both, or a dead app gets two.
 */
export async function scheduleAlarmBackup(
  atMs: number,
  soundId: string,
  fadeSec: number,
  text: ReminderText,
  isArmed: () => boolean,
): Promise<AlarmBackup> {
  const exactAlarm = await canScheduleNativeWakeAlarm()
  if (exactAlarm) {
    try {
      if (isArmed()) await WakeAlarm.schedule({ at: atMs + NATIVE_ALARM_DELAY_MS, soundId, fadeSec })
      cancelReminder(ALARM_NOTIFICATION_ID) // one set before the permission was granted
      // Its ringing notification carries the Stop action, so it still wants notification permission.
      const allowed = await requestReminderPermission().catch(() => false)
      return { notificationsDenied: !allowed, exactAlarm }
    } catch (err) {
      console.warn('[wake-alarm] schedule failed', err)
    }
  }
  return { notificationsDenied: !(await scheduleReminder(ALARM_NOTIFICATION_ID, atMs, text, isArmed)), exactAlarm }
}

/** Drop a pending native alarm and silence one that is ringing. No-op off Android. */
export function cancelNativeWakeAlarm(): void {
  if (!isAndroid()) return
  void WakeAlarm.cancel().catch((err: unknown) => console.warn('[wake-alarm] cancel failed', err))
}

/**
 * Open the system "Alarms & reminders" screen (through local-notifications, which already wraps it)
 * and resolve with whether access is granted once the user comes back. False off Android.
 */
export async function openExactAlarmSettings(): Promise<boolean> {
  if (!isAndroid()) return false
  try {
    return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === 'granted'
  } catch (err) {
    console.warn('[wake-alarm] exact alarm settings failed', err)
    return false
  }
}
