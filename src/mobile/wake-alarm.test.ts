import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ name: 'android' }))
const WakeAlarm = vi.hoisted(() => ({
  schedule: vi.fn(),
  cancel: vi.fn(),
  canScheduleExact: vi.fn(),
  openSettings: vi.fn(),
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
  areRemindersDenied: vi.fn(),
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
  vi.restoreAllMocks() // console.warn spies from earlier tests
  platform.name = 'android'
  WakeAlarm.schedule.mockReset().mockResolvedValue(undefined)
  WakeAlarm.cancel.mockReset().mockResolvedValue(undefined)
  WakeAlarm.canScheduleExact.mockReset().mockResolvedValue({ value: true })
  WakeAlarm.openSettings.mockReset().mockResolvedValue({ value: true })
  LocalNotifications.changeExactNotificationSetting.mockReset().mockResolvedValue({ exact_alarm: 'granted' })
  notifications.scheduleReminder.mockReset().mockResolvedValue(true)
  notifications.cancelReminder.mockReset()
  notifications.requestReminderPermission.mockReset().mockResolvedValue(true)
  notifications.areRemindersDenied.mockReset().mockResolvedValue(false)
})

describe('scheduleAlarmBackup', () => {
  it('arms the native alarm a little after the wake time, instead of the backup notification', async () => {
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: false,
      exactAlarm: true,
    })
    expect(WakeAlarm.schedule).toHaveBeenCalledWith({
      at: AT + NATIVE_ALARM_DELAY_MS,
      soundId: 'birds',
      fadeSec: FADE,
      title: TEXT.title,
    })
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
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: false,
      exactAlarm: null, // promise the notification, not a closed-app sound
    })
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

describe('on iOS (AlarmKit)', () => {
  beforeEach(() => {
    platform.name = 'ios'
  })

  it('arms the AlarmKit alarm a little after the wake time, without a notification prompt', async () => {
    notifications.areRemindersDenied.mockResolvedValue(true)
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: true, // reported, so the bedtime section still says so
      exactAlarm: true,
    })
    expect(WakeAlarm.schedule).toHaveBeenCalledWith({
      at: AT + NATIVE_ALARM_DELAY_MS,
      soundId: 'birds',
      fadeSec: FADE,
      title: TEXT.title,
    })
    expect(notifications.cancelReminder).toHaveBeenCalledWith(1001)
    expect(notifications.scheduleReminder).not.toHaveBeenCalled()
    expect(notifications.requestReminderPermission).not.toHaveBeenCalled() // AlarmKit draws its own alert
  })

  it('keeps the backup notification below iOS 26, quietly', async () => {
    WakeAlarm.canScheduleExact.mockRejectedValue(Object.assign(new Error('AlarmKit needs iOS 26'), { code: 'UNAVAILABLE' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: false,
      exactAlarm: null,
    })
    expect(WakeAlarm.schedule).not.toHaveBeenCalled()
    expect(notifications.scheduleReminder).toHaveBeenCalledWith(1001, AT, TEXT, armed)
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back to the notification and asks for Settings when the AlarmKit prompt is refused', async () => {
    WakeAlarm.canScheduleExact.mockResolvedValueOnce({ value: true }).mockResolvedValueOnce({ value: false })
    WakeAlarm.schedule.mockRejectedValue(new Error('AlarmKit access was not granted'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: false,
      exactAlarm: false,
    })
    expect(notifications.scheduleReminder).toHaveBeenCalledWith(1001, AT, TEXT, armed)
  })

  it('keeps the notification without AlarmKit access', async () => {
    WakeAlarm.canScheduleExact.mockResolvedValue({ value: false })
    await expect(scheduleAlarmBackup(AT, 'birds', FADE, TEXT, armed)).resolves.toEqual({
      notificationsDenied: false,
      exactAlarm: false,
    })
    expect(WakeAlarm.schedule).not.toHaveBeenCalled()
  })

  it('cancels through the plugin and opens the app Settings page for access', async () => {
    cancelNativeWakeAlarm()
    expect(WakeAlarm.cancel).toHaveBeenCalledTimes(1)
    await expect(openExactAlarmSettings()).resolves.toBe(true)
    expect(WakeAlarm.openSettings).toHaveBeenCalledTimes(1)
    expect(LocalNotifications.changeExactNotificationSetting).not.toHaveBeenCalled()
  })
})

describe('on web', () => {
  beforeEach(() => {
    platform.name = 'web'
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
    expect(WakeAlarm.openSettings).not.toHaveBeenCalled()
    expect(LocalNotifications.changeExactNotificationSetting).not.toHaveBeenCalled()
    expect(notifications.scheduleReminder).toHaveBeenCalledWith(1001, AT, TEXT, armed)
  })
})
