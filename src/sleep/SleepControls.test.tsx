// B3 regression: the "Off" button used disabled={!sleepEndsAt}, which can't tell "no timer was
// ever set" apart from "the timer just finished naturally" — startSleepTimer's completion
// callback clears sleepEndsAt too. Both looked the same to the button, so it stayed disabled
// exactly when the user most wanted to hit it. See functional-qa.md 5b.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react'
import '../i18n'
import { SleepControls } from './SleepControls'
import { useMixStore } from '../mixer/store'
import { usePlaybackSettings } from './settings'
import { usePlanStore } from '../plan'
import { Capacitor } from '@capacitor/core'
import { ALARM_NOTIFICATION_ID, BEDTIME_NOTIFICATION_ID, areRemindersDenied, scheduleReminder } from '../mobile/notifications'
import { NATIVE_ALARM_DELAY_MS, canScheduleNativeWakeAlarm, openExactAlarmSettings, scheduleAlarmBackup } from '../mobile/wake-alarm'
import { ALARM_FADE_SEC } from '../mixer/store'

vi.mock('../mobile/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mobile/notifications')>()),
  scheduleReminder: vi.fn().mockResolvedValue(true),
  areRemindersDenied: vi.fn().mockResolvedValue(false),
}))
vi.mock('../mobile/wake-alarm', async (importOriginal) => {
  const real = await importOriginal<typeof import('../mobile/wake-alarm')>()
  return {
    ...real,
    canScheduleNativeWakeAlarm: vi.fn().mockResolvedValue(null),
    openExactAlarmSettings: vi.fn().mockResolvedValue(false),
    scheduleAlarmBackup: vi.fn(real.scheduleAlarmBackup),
  }
})

beforeEach(() => {
  useMixStore.setState({
    current: { ...useMixStore.getState().current, placements: [] },
    loadingIds: new Set(),
    erroredIds: new Set(),
    presets: [],
    sleepEndsAt: null,
    sleeping: false,
    alarmAt: null,
    alarmRinging: false,
    lastRemoved: null,
  })
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('SleepControls "Off" button', () => {
  it('is disabled when no timer has ever been set', () => {
    render(<SleepControls />)
    expect(screen.getByRole('button', { name: '해제' })).toBeDisabled()
  })

  it('stays enabled after the timer completes naturally, and clicking it returns to the normal state', () => {
    render(<SleepControls />)
    fireEvent.click(screen.getByText('15분'))

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(true)

    const offButton = screen.getByRole('button', { name: '해제' })
    expect(offButton).toBeEnabled()

    fireEvent.click(offButton)
    expect(useMixStore.getState().sleeping).toBe(false)
    expect(useMixStore.getState().sleepEndsAt).toBeNull()
    expect(offButton).toBeDisabled() // back to the normal "no timer" state
  })
})

describe('custom h:m sleep timer', () => {
  it('is disabled until a non-zero duration is entered, then starts with the saved fade length', () => {
    usePlaybackSettings.setState({ sleepFadeSec: 300 })
    const startSpy = vi.spyOn(useMixStore.getState(), 'startSleepTimer')
    render(<SleepControls />)
    const start = screen.getByRole('button', { name: '시작' })
    expect(start).toBeDisabled()

    fireEvent.change(screen.getByLabelText('직접 설정 시간'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('직접 설정 분'), { target: { value: '30' } })
    fireEvent.click(start)
    expect(startSpy).toHaveBeenCalledWith(90, 300)
  })

  it('stays disabled for 0:00', () => {
    render(<SleepControls />)
    fireEvent.change(screen.getByLabelText('직접 설정 분'), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: '시작' })).toBeDisabled()
  })
})

describe('wake alarm controls', () => {
  it('shows the stay-open note, arms with the chosen time, and locks paid wake sounds on free', () => {
    usePlanStore.setState({ plan: 'free' })
    const armSpy = vi.spyOn(useMixStore.getState(), 'armAlarm')
    render(<SleepControls />)
    expect(screen.getByText(/앱을 종료하면 알람도 꺼져요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새소리' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '여울 소리' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.change(screen.getByLabelText('기상 시각'), { target: { value: '06:30' } })
    fireEvent.click(screen.getByRole('button', { name: '알람 켜기' }))
    const [atMs, soundId] = armSpy.mock.calls[0]
    expect(soundId).toBe('nature-brook')
    expect(new Date(atMs).getHours()).toBe(6)
    expect(new Date(atMs).getMinutes()).toBe(30)
  })

  it('schedules the backup notification for the armed time and says when notifications are off', async () => {
    usePlanStore.setState({ plan: 'free' })
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.mocked(scheduleReminder).mockClear().mockResolvedValueOnce(false)
    render(<SleepControls />)
    await act(async () => {})
    expect(screen.getByText('앱이 종료돼 있으면 소리 대신 알림이 와요.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('기상 시각'), { target: { value: '06:30' } })
    fireEvent.click(screen.getByRole('button', { name: '알람 켜기' }))
    await act(async () => {}) // the alarm's backup first checks for the native alarm (wake-alarm.ts)
    const [id, atMs, text, isArmed] = vi.mocked(scheduleReminder).mock.calls[0]
    expect(id).toBe(ALARM_NOTIFICATION_ID)
    expect(atMs).toBe(useMixStore.getState().alarmAt! + NATIVE_ALARM_DELAY_MS) // after the in-app start, not on it
    expect(text).toEqual({ title: '기상 알람', body: '일어날 시간이에요.' })
    expect(isArmed()).toBe(true)
    await act(async () => {}) // let the denied result land (fake timers: no findBy polling)
    // The denied note replaces the "you'll get a notification" promise in both sections.
    expect(screen.getAllByText(/알림이 꺼져 있어/)).toHaveLength(2)
    expect(screen.queryByText('앱이 종료돼 있으면 소리 대신 알림이 와요.')).not.toBeInTheDocument()
    act(() => useMixStore.getState().dismissAlarm())
    expect(isArmed()).toBe(false)
    vi.mocked(Capacitor.isNativePlatform).mockRestore()
  })

  it('shows an earlier refusal on open, without prompting', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.mocked(areRemindersDenied).mockResolvedValueOnce(true)
    render(<SleepControls />)
    await act(async () => {})
    expect(screen.getAllByText(/알림이 꺼져 있어/)).toHaveLength(2)
    vi.mocked(Capacitor.isNativePlatform).mockRestore()
  })

  it('on Android with "Alarms & reminders" access, promises the closed-app sound', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.mocked(canScheduleNativeWakeAlarm).mockResolvedValueOnce(true)
    render(<SleepControls />)
    await act(async () => {})
    expect(screen.getByText(/앱이 종료돼 있어도 울려요/)).toBeInTheDocument()
    expect(screen.queryByText(/앱을 종료하면 알람도 꺼져요/)).not.toBeInTheDocument() // no longer true
    expect(screen.queryByText('앱이 종료돼 있으면 소리 대신 알림이 와요.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '권한 설정 열기' })).not.toBeInTheDocument()
  })

  it('without that access, says so, and granting it moves the armed alarm to the native one', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.mocked(canScheduleNativeWakeAlarm).mockResolvedValueOnce(false)
    render(<SleepControls />)
    await act(async () => {})
    expect(screen.getByText(/‘알람 및 리마인더’ 권한/)).toBeInTheDocument()
    expect(screen.getByText('앱이 종료돼 있으면 소리 대신 알림이 와요.')).toBeInTheDocument() // the stage 3 backup

    vi.mocked(scheduleAlarmBackup).mockClear().mockResolvedValueOnce({ notificationsDenied: false, exactAlarm: false })
    fireEvent.click(screen.getByRole('button', { name: '알람 켜기' }))
    const at = useMixStore.getState().alarmAt
    expect(vi.mocked(scheduleAlarmBackup).mock.calls[0].slice(0, 3)).toEqual([at, 'nature-brook', ALARM_FADE_SEC])
    await act(async () => {})

    vi.mocked(openExactAlarmSettings).mockResolvedValueOnce(true)
    vi.mocked(scheduleAlarmBackup).mockClear().mockResolvedValueOnce({ notificationsDenied: false, exactAlarm: true })
    fireEvent.click(screen.getByRole('button', { name: '권한 설정 열기' }))
    await act(async () => {})
    expect(vi.mocked(scheduleAlarmBackup).mock.calls[0][0]).toBe(at)
    expect(screen.getByText(/앱이 종료돼 있어도 울려요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '권한 설정 열기' })).not.toBeInTheDocument()
  })

  it('on iOS, says what AlarmKit plays and points to Settings, not "Alarms & reminders"', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios')
    vi.mocked(canScheduleNativeWakeAlarm).mockResolvedValueOnce(false)
    render(<SleepControls />)
    await act(async () => {})
    expect(screen.getByText(/설정에서 SleepRings의 알람을 허용/)).toBeInTheDocument()
    expect(screen.queryByText(/‘알람 및 리마인더’ 권한/)).not.toBeInTheDocument()

    vi.mocked(openExactAlarmSettings).mockResolvedValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: '설정 앱 열기' }))
    await act(async () => {})
    expect(screen.getByText(/대신 시스템 알람음이 울려요/)).toBeInTheDocument()
    expect(screen.queryByText(/알람 볼륨으로 천천히 커져요/)).not.toBeInTheDocument() // Android's fade promise
  })

  it('shows no native notes on web', () => {
    render(<SleepControls />)
    expect(screen.queryByText(/소리 대신 알림이 와요/)).not.toBeInTheDocument()
  })

  it('after a downgrade, a picked wake sound the plan lost falls back to the free one (Set still arms)', () => {
    usePlanStore.setState({ plan: 'tier10000' })
    render(<SleepControls />)
    fireEvent.click(screen.getByRole('button', { name: '새소리' }))
    act(() => usePlanStore.setState({ plan: 'free' }))
    expect(screen.getByRole('button', { name: '여울 소리' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '알람 켜기' }))
    expect(useMixStore.getState().alarmSound).toBe('nature-brook')
    act(() => useMixStore.getState().dismissAlarm())
  })

  it('offers a stop button while ringing', () => {
    useMixStore.setState({ alarmAt: Date.now(), alarmRinging: true })
    render(<SleepControls />)
    fireEvent.click(screen.getByRole('button', { name: '알람 멈추기' }))
    expect(useMixStore.getState().alarmRinging).toBe(false)
  })
})

describe('share button', () => {
  it('is disabled for an empty mix, and copies the link when there is no share sheet', async () => {
    vi.useRealTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<SleepControls />)
    expect(screen.getByRole('button', { name: '공유' })).toBeDisabled()

    act(() => {
      useMixStore.getState().addPlacement('fan', 0.3, 0)
    })
    fireEvent.click(screen.getByRole('button', { name: '공유' }))
    expect(await screen.findByText('링크를 복사했어요')).toBeInTheDocument()
    expect(writeText.mock.calls[0][0]).toMatch(/#mix=[\w-]+$/)
  })

  it('says so when copying fails', async () => {
    vi.useRealTimers()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    act(() => {
      useMixStore.getState().addPlacement('fan', 0.3, 0)
    })
    render(<SleepControls />)
    fireEvent.click(screen.getByRole('button', { name: '공유' }))
    expect(await screen.findByText('링크를 복사하지 못했어요')).toBeInTheDocument()
  })
})

describe('bedtime start', () => {
  it('is disabled for an empty mix, arms for the picked time, and can be cancelled', () => {
    const now = new Date('2026-01-01T21:00:00')
    vi.setSystemTime(now)
    useMixStore.setState({ bedtimeAt: null })
    render(<SleepControls />)
    const startButton = screen.getByRole('button', { name: '이때 시작' })
    expect(startButton).toBeDisabled()
    expect(screen.getByText(/SleepRings가 켜져 있어야 해요/)).toBeInTheDocument()

    act(() => {
      useMixStore.getState().addPlacement('fan', 0.3, 0)
    })
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '22:30' } })
    vi.mocked(scheduleReminder).mockClear()
    fireEvent.click(startButton)
    expect(useMixStore.getState().bedtimeAt).toBe(new Date('2026-01-01T22:30:00').getTime())
    expect(vi.mocked(scheduleReminder).mock.calls[0].slice(0, 2)).toEqual([
      BEDTIME_NOTIFICATION_ID,
      new Date('2026-01-01T22:30:00').getTime() + NATIVE_ALARM_DELAY_MS,
    ])
    expect(screen.getByText(/에 시작$/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '지금 재생' }))
    expect(useMixStore.getState().bedtimeAt).toBeNull()
  })
})
