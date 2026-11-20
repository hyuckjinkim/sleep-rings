import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ name: 'android' }))
const WakeAlarm = vi.hoisted(() => ({
  schedule: vi.fn(),
  cancel: vi.fn(),
  canScheduleExact: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.name !== 'web',
    getPlatform: () => platform.name,
  },
  registerPlugin: () => WakeAlarm,
}))

const LocalNotifications = vi.hoisted(() => ({ changeExactNotificationSetting: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications }))

const notifications = vi.hoisted(() => ({
  ALARM_NOTIFICATION_ID: 1001,
  scheduleReminder: vi.fn(),
  cancelReminder: vi.fn(),
  requestReminderPermission: vi.fn(),
}))
vi.mock('./notifications', () => notifications)

import {
  NATIVE_ALARM_DELAY_MS,
  cancelNativeWakeAlarm,
  canScheduleNativeWakeAlarm,
  openExactAlarmSettings,
  scheduleAlarmBackup,
} from './wake-alarm'

const TEXT = { title: 'Wake alarm', body: "It's your wake time." }
const AT = new Date('2026-01-02T07:00:00').getTime()
const FADE = 300
const armed = () => true

beforeEach(() => {
  platform.name = 'android'
  WakeAlarm.schedule.mockReset().mockResolvedValue(undefined)
  WakeAlarm.cancel.mockReset().mockResolvedValue(undefined)
  WakeAlarm.canScheduleExact.mockReset().mockResolvedValue({ value: true })
  LocalNotifications.changeExactNotificationSetting.mockReset().mockResolvedValue({ exact_alarm: 'granted' })
  notifications.scheduleReminder.mockReset().mockResolvedValue(true)
  notifications.cancelReminder.mockReset()
  notifications.requestReminderPermission.mockReset().mockResolvedValue(true)
})

describe('scheduleAlarmBackup', () => {
  it('arms the native alarm a little after the wake time, instead of the backup notification', async () => {
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: false,
      exactAlarm: true,
    })
    expect(WakeAlarm.schedule).toHaveBeenCalledWith({ at: AT + NATIVE_ALARM_DELAY_MS, soundId: 'birds', fadeSec: FADE })
    expect(notifications.scheduleReminder).not.toHaveBeenCalled()
    expect(notifications.cancelReminder).toHaveBeenCalledWith(1001) // no second notification for a dead app
    expect(notifications.requestReminderPermission).toHaveBeenCalled() // the ring notification's Stop needs it
  })

  it('reports refused notifications even when the native alarm is set', async () => {
    notifications.requestReminderPermission.mockResolvedValue(false)
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: true,
      exactAlarm: true,
    })
  })

  it('falls back to the backup notification without the exact-alarm permission', async () => {
    WakeAlarm.canScheduleExact.mockResolvedValue({ value: false })
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: false,
      exactAlarm: false,
    })
    expect(WakeAlarm.schedule).not.toHaveBeenCalled()
    expect(notifications.scheduleReminder).toHaveBeenCalledWith(1001, AT, TEXT, armed)
  })

  it('falls back to the backup notification when the native schedule fails', async () => {
    WakeAlarm.schedule.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)
    expect(notifications.scheduleReminder).toHaveBeenCalledWith(1001, AT, TEXT, armed)
  })

  it('does not arm an alarm cancelled while the permission check was pending', async () => {
    await scheduleAlarmBackup(AT, 'birds', FADE, TEXT, () => false)
    expect(WakeAlarm.schedule).not.toHaveBeenCalled()
  })
})

describe('cancelNativeWakeAlarm', () => {
  it('cancels on Android', () => {
    cancelNativeWakeAlarm()
    expect(WakeAlarm.cancel).toHaveBeenCalledTimes(1)
  })
})

describe('openExactAlarmSettings', () => {
  it('opens the system screen and reports the result', async () => {
    await expect(openExactAlarmSettings()).resolves.toBe(true)
    LocalNotifications.changeExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })
    await expect(openExactAlarmSettings()).resolves.toBe(false)
  })
})

describe.each(['web', 'ios'])('on %s', (name) => {
  beforeEach(() => {
    platform.name = name
  })

  it('makes no native calls and keeps the backup notification', async () => {
    await expect(canScheduleNativeWakeAlarm()).resolves.toBeNull()
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: false,
      exactAlarm: null,
    })
    cancelNativeWakeAlarm()
    await expect(openExactAlarmSettings()).resolves.toBe(false)
    expect(WakeAlarm.canScheduleExact).not.toHaveBeenCalled()
    expect(WakeAlarm.schedule).not.toHaveBeenCalled()
    expect(WakeAlarm.cancel).not.toHaveBeenCalled()
    expect(LocalNotifications.changeExactNotificationSetting).not.toHaveBeenCalled()
    expect(notifications.scheduleReminder).toHaveBeenCalledWith(1001, AT, TEXT, armed)
  })
})
