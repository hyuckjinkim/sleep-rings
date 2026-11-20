import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ name: 'android' }))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.name !== 'web',
    getPlatform: () => platform.name,
  },
}))

let actionListener: ((e: { notification: { id: number } }) => void) | undefined
const LocalNotifications = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  addListener: vi.fn(),
}))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications }))

const TEXT = { title: 'Wake alarm', body: "It's your wake time." }
const AT = new Date('2026-01-02T07:00:00').getTime()
const armed = () => true

beforeEach(() => {
  vi.resetModules() // the "scheduled this session" set must start empty per test
  platform.name = 'android'
  LocalNotifications.checkPermissions.mockReset().mockResolvedValue({ display: 'granted' })
  LocalNotifications.requestPermissions.mockReset().mockResolvedValue({ display: 'granted' })
  LocalNotifications.checkExactNotificationSetting.mockReset().mockResolvedValue({ exact_alarm: 'granted' })
  LocalNotifications.schedule.mockReset().mockResolvedValue({ notifications: [] })
  LocalNotifications.cancel.mockReset().mockResolvedValue(undefined)
  LocalNotifications.addListener.mockReset().mockImplementation((_event: string, cb: typeof actionListener) => {
    actionListener = cb
    return Promise.resolve({ remove: vi.fn() })
  })
})

describe('scheduleReminder', () => {
  it('schedules the stable id at the wake time, exact and allowed in Doze', async () => {
    const { ALARM_NOTIFICATION_ID, scheduleReminder } = await import('./notifications')
    await expect(scheduleReminder(ALARM_NOTIFICATION_ID, AT, TEXT, armed)).resolves.toBe(true)
    expect(LocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          id: 1001,
          title: TEXT.title,
          body: TEXT.body,
          schedule: { at: new Date(AT), allowWhileIdle: true },
          isExactNotification: true,
        }),
      ],
    })
  })

  it('asks for permission at arm time when it has not been decided yet', async () => {
    LocalNotifications.checkPermissions.mockResolvedValue({ display: 'prompt' })
    const { BEDTIME_NOTIFICATION_ID, scheduleReminder } = await import('./notifications')
    await expect(scheduleReminder(BEDTIME_NOTIFICATION_ID, AT, TEXT, armed)).resolves.toBe(true)
    expect(LocalNotifications.requestPermissions).toHaveBeenCalled()
    expect(LocalNotifications.schedule.mock.calls[0][0].notifications[0].id).toBe(1002)
  })

  it('resolves false and schedules nothing when permission is denied', async () => {
    LocalNotifications.checkPermissions.mockResolvedValue({ display: 'prompt' })
    LocalNotifications.requestPermissions.mockResolvedValue({ display: 'denied' })
    const { ALARM_NOTIFICATION_ID, scheduleReminder } = await import('./notifications')
    await expect(scheduleReminder(ALARM_NOTIFICATION_ID, AT, TEXT, armed)).resolves.toBe(false)
    expect(LocalNotifications.schedule).not.toHaveBeenCalled()
  })

  it('does not re-prompt once denied', async () => {
    LocalNotifications.checkPermissions.mockResolvedValue({ display: 'denied' })
    const { ALARM_NOTIFICATION_ID, scheduleReminder } = await import('./notifications')
    await expect(scheduleReminder(ALARM_NOTIFICATION_ID, AT, TEXT, armed)).resolves.toBe(false)
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled()
  })

  it('falls back to inexact instead of opening the exact-alarm settings screen', async () => {
    LocalNotifications.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })
    const { ALARM_NOTIFICATION_ID, scheduleReminder } = await import('./notifications')
    await scheduleReminder(ALARM_NOTIFICATION_ID, AT, TEXT, armed)
    expect(LocalNotifications.schedule.mock.calls[0][0].notifications[0].isExactNotification).toBe(false)
  })

  it('skips the exact-alarm check on iOS', async () => {
    platform.name = 'ios'
    const { ALARM_NOTIFICATION_ID, scheduleReminder } = await import('./notifications')
    await scheduleReminder(ALARM_NOTIFICATION_ID, AT, TEXT, armed)
    expect(LocalNotifications.checkExactNotificationSetting).not.toHaveBeenCalled()
    expect(LocalNotifications.schedule).toHaveBeenCalled()
  })

  it('schedules nothing if the alarm was cancelled during the permission prompt', async () => {
    const { ALARM_NOTIFICATION_ID, scheduleReminder } = await import('./notifications')
    await scheduleReminder(ALARM_NOTIFICATION_ID, AT, TEXT, () => false)
    expect(LocalNotifications.schedule).not.toHaveBeenCalled()
  })

  it('resolves false (no backup) when the plugin fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    LocalNotifications.schedule.mockRejectedValue(new Error('OS-PLUG-LNOT-0005'))
    const { ALARM_NOTIFICATION_ID, scheduleReminder } = await import('./notifications')
    await expect(scheduleReminder(ALARM_NOTIFICATION_ID, AT, TEXT, armed)).resolves.toBe(false)
  })

  it('is a no-op on web', async () => {
    platform.name = 'web'
    const { ALARM_NOTIFICATION_ID, scheduleReminder } = await import('./notifications')
    await expect(scheduleReminder(ALARM_NOTIFICATION_ID, AT, TEXT, armed)).resolves.toBe(true)
    expect(LocalNotifications.checkPermissions).not.toHaveBeenCalled()
    expect(LocalNotifications.schedule).not.toHaveBeenCalled()
  })
})

describe('cancelReminder', () => {
  it('cancels by id on native, nothing on web', async () => {
    const { BEDTIME_NOTIFICATION_ID, cancelReminder } = await import('./notifications')
    cancelReminder(BEDTIME_NOTIFICATION_ID)
    expect(LocalNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1002 }] })
    platform.name = 'web'
    cancelReminder(BEDTIME_NOTIFICATION_ID)
    expect(LocalNotifications.cancel).toHaveBeenCalledTimes(1)
  })
})

describe('onClosedAppReminderTap', () => {
  it('reports taps on reminders an earlier (closed) session scheduled, not this one', async () => {
    const { ALARM_NOTIFICATION_ID, BEDTIME_NOTIFICATION_ID, onClosedAppReminderTap, scheduleReminder } =
      await import('./notifications')
    const onTap = vi.fn()
    onClosedAppReminderTap(onTap)
    await scheduleReminder(ALARM_NOTIFICATION_ID, AT, TEXT, armed)

    actionListener!({ notification: { id: ALARM_NOTIFICATION_ID } })
    expect(onTap).not.toHaveBeenCalled() // this session is alive — the in-app alarm handles it
    actionListener!({ notification: { id: BEDTIME_NOTIFICATION_ID } })
    expect(onTap).toHaveBeenCalledWith(BEDTIME_NOTIFICATION_ID)
  })
})
