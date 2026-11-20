// B3 regression: the "Off" button used disabled={!sleepEndsAt}, which can't tell "no timer was
// ever set" apart from "the timer just finished naturally" — startSleepTimer's completion
// callback clears sleepEndsAt too. Both looked the same to the button, so it stayed disabled
// exactly when the user most wanted to hit it. See functional-qa.md 5b.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '../i18n'
import { SleepControls } from './SleepControls'
import { useMixStore } from '../mixer/store'
import { usePlaybackSettings } from './settings'

beforeEach(() => {
  useMixStore.setState({
    current: { ...useMixStore.getState().current, placements: [] },
    loadingIds: new Set(),
    erroredIds: new Set(),
    presets: [],
    sleepEndsAt: null,
    sleeping: false,
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
