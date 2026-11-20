import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'
import '../i18n'
import { useMixStore } from '../mixer/store'
import { usePlanStore } from '../plan'
import { shareUrl } from '../mixer/share'
import type { Mix } from '../mixer/types'

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
