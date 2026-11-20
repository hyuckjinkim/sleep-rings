import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'
import '../i18n'
import { useMixStore } from '../mixer/store'
import { usePlanStore } from '../plan'
import { shareUrl } from '../mixer/share'
import type { Mix } from '../mixer/types'
import { BEDTIME_NOTIFICATION_ID } from '../mobile/notifications'
import { playLastMix } from '../sleep/persistence'

const reminderTap = vi.hoisted(() => ({ fire: (_id: number) => {} }))
vi.mock('../mobile/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mobile/notifications')>()),
  onClosedAppReminderTap: (cb: (id: number) => void) => {
    reminderTap.fire = cb
    return () => {}
  },
}))
const shortcutTap = vi.hoisted(() => ({ fire: () => {} }))
vi.mock('../mobile/app-shortcuts', () => ({
  setPlayLastMixShortcut: vi.fn(),
  onPlayLastMixShortcut: (cb: () => void) => {
    shortcutTap.fire = cb
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
