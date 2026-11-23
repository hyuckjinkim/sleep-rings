import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'
import '../i18n'
import { useMixStore } from '../mixer/store'
import { usePlanStore } from '../plan'
import { shareUrl } from '../mixer/share'
import type { Mix } from '../mixer/types'
import { BEDTIME_NOTIFICATION_ID } from '../mobile/notifications'
import { playLastMix, saveMix } from '../sleep/persistence'
import { soundEngine } from '../mixer/engine/instance'

const reminderTap = vi.hoisted(() => ({ fire: (_id: number) => {} }))
vi.mock('../mobile/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mobile/notifications')>()),
  onClosedAppReminderTap: (cb: (id: number) => void) => {
    reminderTap.fire = cb
    return () => {}
  },
}))
const shortcutTap = vi.hoisted(() => ({ fire: () => {} }))
vi.mock('../mobile/appShortcuts', () => ({
  setPlayLastMixShortcut: vi.fn(),
  onPlayLastMixShortcut: (cb: () => void) => {
    shortcutTap.fire = cb
    return () => {}
  },
}))
const siriIntent = vi.hoisted(() => ({ fire: () => {} }))
vi.mock('../mobile/appIntents', () => ({
  onPlayLastMixIntent: (cb: () => void) => {
    siriIntent.fire = cb
    return () => {}
  },
}))
vi.mock('../sleep/persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sleep/persistence')>()),
  playLastMix: vi.fn().mockResolvedValue(true),
}))

afterEach(cleanup)

describe('App', () => {
  it('renders the mixer screen by default', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'SleepRings' })).toBeInTheDocument()
    expect(document.querySelector('.mixer-field')).toBeInTheDocument()
  })

  it('opens the settings screen from the header button and returns to the mixer on close', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }))
    expect(screen.getByRole('dialog', { name: '설정' })).toBeInTheDocument()
    expect(document.querySelector('.mixer-field')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog', { name: '설정' })).not.toBeInTheDocument()
    expect(document.querySelector('.mixer-field')).toBeInTheDocument()
  })

  it('shows both languages in settings, switches, and remembers the choice', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }))
    expect(screen.getByRole('button', { name: '한국어' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '한국어' })).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('so.lang')).toBe('en')
    expect(document.documentElement.lang).toBe('en')

    fireEvent.click(screen.getByRole('button', { name: '한국어' })) // restore for later tests
  })
})

describe('App restores the saved mix once, not on every Mixer mount', () => {
  function settingsRoundTrip() {
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
  }

  it('keeps an orb added just before opening Settings (autosave still pending)', () => {
    render(<App />)
    act(() => {
      useMixStore.getState().clearAll()
      useMixStore.getState().addPlacement('fan', 0.3, 0)
    })
    settingsRoundTrip()
    expect(useMixStore.getState().current.placements.map((p) => p.soundId)).toEqual(['fan'])
  })

  it('오브 패널이 열린 동안 필드를 패널 위 공간에 맞게 줄이고, 닫으면 되돌린다', () => {
    // jsdom 에는 레이아웃이 없다: 필드는 위 50px·높이 300px, 패널은 위 200px 에서 시작한다고 둔다.
    const rect = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: height, width: height, x: 0, y: top }) as DOMRect
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('mixer-field')) return rect(50, 300)
      if (this.classList.contains('mixer-controls')) return rect(200, 440)
      return rect(0, 0)
    })
    render(<App />)
    act(() => {
      useMixStore.getState().clearAll()
      useMixStore.getState().addPlacement('fan', 0.3, 0)
    })
    const field = document.querySelector<HTMLElement>('.mixer-field')!

    fireEvent.keyDown(document.querySelector('.mixer-orb')!, { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: '선풍기 소리' })).toBeInTheDocument()
    expect(field.style.transform).toBe(`scale(${(200 - 12 - 50) / 300})`) // 필드 아래 끝 = 패널 위 12px

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(field.style.transform).toBe('')
    spy.mockRestore()
  })

  it('does not restart a mix the sleep timer ended', async () => {
    render(<App />)
    act(() => {
      useMixStore.getState().clearAll()
      useMixStore.getState().addPlacement('fan', 0.3, 0)
    })
    saveMix(useMixStore.getState().current)
    await act(async () => {}) // the add's own load().then(play)
    act(() => useMixStore.setState({ sleeping: true }))
    const playSpy = vi.spyOn(soundEngine, 'play')
    settingsRoundTrip()
    await act(async () => {})
    expect(playSpy).not.toHaveBeenCalled()
    expect(useMixStore.getState().sleeping).toBe(true)
    playSpy.mockRestore()
    act(() => useMixStore.setState({ sleeping: false }))
  })
})

describe('App share links', () => {
  const sharedMix = (soundIds: string[]): Mix => ({
    id: 'm',
    name: 'Shared',
    masterVolume: 0.6,
    updatedAt: 0,
    placements: soundIds.map((soundId, i) => ({
      id: `p${i}`,
      soundId,
      radius: 0.3,
      angle: 1,
      volume: 1,
      locked: false,
      orbit: { mode: 'random', shape: { kind: 'circle' }, speed: 0.1, direction: 1 },
    })),
  })

  afterEach(() => {
    vi.useRealTimers() // a failing fake-timer test must not leak its clock into the next one
    history.replaceState(null, '', '/')
    usePlanStore.setState({ plan: 'free' })
  })

  it('opens a mix from the page URL and strips the param', () => {
    history.replaceState(null, '', shareUrl(sharedMix(['noise-brown', 'fan']), location.href).replace(location.origin, ''))
    render(<App />)
    const { current } = useMixStore.getState()
    expect(current.name).toBe('Shared')
    expect(current.masterVolume).toBe(0.6)
    expect(current.placements.map((p) => p.soundId)).toEqual(['noise-brown', 'fan'])
    expect(location.hash).toBe('')
  })

  it('shows the upsell for sounds the plan does not include, keeping the rest', () => {
    history.replaceState(null, '', shareUrl(sharedMix(['birds', 'fan']), location.href).replace(location.origin, ''))
    render(<App />)
    expect(useMixStore.getState().current.placements.map((p) => p.soundId)).toEqual(['fan'])
    expect(screen.getByText(/공유받은 믹스의 일부 소리는/)).toBeInTheDocument()
  })

  it('opens a link pasted into the already open tab (hash change, no reload)', () => {
    render(<App />)
    act(() => {
      history.replaceState(null, '', shareUrl(sharedMix(['noise-pink']), location.href).replace(location.origin, ''))
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(useMixStore.getState().current.placements.map((p) => p.soundId)).toEqual(['noise-pink'])
    expect(location.hash).toBe('')
  })

  it('opens the same link again later (only a near-simultaneous duplicate is dropped)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const url = shareUrl(sharedMix(['noise-white']), location.href).replace(location.origin, '')
    history.replaceState(null, '', url)
    render(<App />)
    act(() => useMixStore.getState().clearAll())
    vi.setSystemTime(Date.now() + 5000)
    act(() => {
      history.replaceState(null, '', url)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(useMixStore.getState().current.placements.map((p) => p.soundId)).toEqual(['noise-white'])
  })

  it('ignores a malformed link without breaking the app', () => {
    history.replaceState(null, '', '/#mix=garbage!!')
    render(<App />)
    expect(document.querySelector('.mixer-field')).toBeInTheDocument()
    expect(location.hash).toBe('')
  })
})

describe('App bedtime reminder tapped after the app was closed', () => {
  it('offers the last mix, and plays it on tap', () => {
    render(<App />)
    act(() => {
      useMixStore.getState().addPlacement('fan', 0.3, 0)
    })
    act(() => reminderTap.fire(BEDTIME_NOTIFICATION_ID))
    expect(screen.getByText('마지막 믹스를 재생할까요?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '재생' }))
    expect(playLastMix).toHaveBeenCalled()
    expect(screen.queryByText('마지막 믹스를 재생할까요?')).not.toBeInTheDocument()
  })

  it('offers nothing when there is no mix to play', () => {
    render(<App />)
    act(() => useMixStore.getState().clearAll())
    act(() => reminderTap.fire(BEDTIME_NOTIFICATION_ID))
    expect(screen.queryByText('마지막 믹스를 재생할까요?')).not.toBeInTheDocument()
  })
})

describe('App "play last mix" launcher shortcut', () => {
  it('plays the last mix, back on the mixer screen', async () => {
    vi.mocked(playLastMix).mockClear().mockResolvedValueOnce(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }))
    await act(async () => shortcutTap.fire())
    expect(playLastMix).toHaveBeenCalled()
    expect(document.querySelector('.mixer-field')).toBeInTheDocument()
    expect(screen.queryByText('마지막 믹스를 재생할까요?')).not.toBeInTheDocument()
  })

  it('asks for a tap when the WebView would not start audio on its own', async () => {
    vi.mocked(playLastMix).mockClear().mockResolvedValueOnce(false)
    render(<App />)
    act(() => {
      useMixStore.getState().addPlacement('fan', 0.3, 0)
    })
    await act(async () => shortcutTap.fire())
    expect(screen.getByText('마지막 믹스를 재생할까요?')).toBeInTheDocument()
  })
})

describe('App Siri "Play last mix" intent', () => {
  it('takes the same path as the launcher shortcut', async () => {
    vi.mocked(playLastMix).mockClear().mockResolvedValueOnce(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }))
    await act(async () => siriIntent.fire())
    expect(playLastMix).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.mixer-field')).toBeInTheDocument()
  })
})
