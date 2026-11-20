// Backup local notifications for the wake alarm and the bedtime start (native only). The real
// alarm/start runs on the Web Audio clock and needs the app alive; if the app was closed, this
// notification is all that's left — it only notifies, it can't play the mix.
import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// Stable ids. Not 1 — that's the Android keep-alive foreground-service notification.
export const ALARM_NOTIFICATION_ID = 1001
export const BEDTIME_NOTIFICATION_ID = 1002

/** Translated by the caller — this module stays i18n-free, like foreground-service.ts. */
export interface ReminderText {
  title: string
  body: string
}

const scheduledThisSession = new Set<number>()

/**
 * Schedule (or replace) the backup notification `id` at atMs. Asks for permission here, at arm
 * time, never at boot. Resolves false when notifications aren't allowed — the in-app alarm/start
 * still works, the caller just shows that there's no backup. `isArmed` is re-checked after the
 * permission prompt, so a cancel during it doesn't leave a stray notification. No-op on web.
 */
export async function scheduleReminder(
  id: number,
  atMs: number,
  text: ReminderText,
  isArmed: () => boolean,
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  try {
    let { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted' && display !== 'denied') display = (await LocalNotifications.requestPermissions()).display
    if (display !== 'granted') return false
    // Exact only if the user already allows it: isExactNotification:true without that permission
    // makes schedule() jump to the system "Alarms & reminders" screen on every arm tap. Inexact
    // (allowWhileIdle) may arrive a few minutes late on Android 12+.
    const exact =
      Capacitor.getPlatform() === 'android' &&
      (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted'
    if (!isArmed()) return true
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: text.title,
          body: text.body,
          schedule: { at: new Date(atMs), allowWhileIdle: true },
          smallIcon: 'ic_stat_sleeprings',
          isExactNotification: exact,
        },
      ],
    })
    scheduledThisSession.add(id)
    return true
  } catch (err) {
    console.warn('[notifications] schedule failed', err)
    return false
  }
}

/** Whether the user already refused notifications — checked without prompting. False on web. */
export async function areRemindersDenied(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    return (await LocalNotifications.checkPermissions()).display === 'denied'
  } catch {
    return false
  }
}

/** Drop a pending (or already shown) backup notification. No-op on web. */
export function cancelReminder(id: number): void {
  if (!Capacitor.isNativePlatform()) return
  void LocalNotifications.cancel({ notifications: [{ id }] }).catch((err: unknown) => {
    console.warn('[notifications] cancel failed', err)
  })
}

/**
 * Taps on a backup notification this app session never scheduled — the app was closed in between,
 * so the in-app alarm/start it backed up is gone. Plugin events are retained until a listener
 * consumes them, so a tap that cold-started the app still arrives. No-op on web.
 */
export function onClosedAppReminderTap(onTap: (id: number) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let handle: PluginListenerHandle | undefined
  void LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    if (!scheduledThisSession.has(notification.id)) onTap(notification.id)
  }).then((h) => {
    handle = h
  })
  return () => {
    void handle?.remove()
  }
}
