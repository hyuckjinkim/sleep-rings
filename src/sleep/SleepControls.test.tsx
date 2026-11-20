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
    fireEvent.click(startButton)
    expect(useMixStore.getState().bedtimeAt).toBe(new Date('2026-01-01T22:30:00').getTime())
    expect(screen.getByText(/에 시작$/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '지금 재생' }))
    expect(useMixStore.getState().bedtimeAt).toBeNull()
  })
})
