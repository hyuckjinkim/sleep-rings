import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import '../i18n'
import { Settings } from './Settings'
import { usePlanStore } from '../plan'
import { useScreenStore } from '../screen/store'
import { usePlaybackSettings } from '../sleep/settings'
import { NURSERY_VOLUME_CAP } from '../sleep/persistence'

const showBannerWhenReady = vi.fn().mockResolvedValue(undefined)
const hideBanner = vi.fn().mockResolvedValue(undefined)

vi.mock('./ads-lifecycle', () => ({
  showBannerWhenReady: (...args: unknown[]) => showBannerWhenReady(...args),
  hideBanner: (...args: unknown[]) => hideBanner(...args),
}))

beforeEach(() => {
  showBannerWhenReady.mockClear()
  hideBanner.mockClear()
  usePlanStore.setState({ plan: 'free' })
  useScreenStore.setState({ dimmed: false })
})

afterEach(cleanup)

describe('Settings banner wiring', () => {
  it('requests the banner on a free, non-dimmed screen and revokes it through the same gate on unmount', () => {
    const { unmount } = render(<Settings onClose={() => {}} />)
    expect(showBannerWhenReady).toHaveBeenCalledWith(true)

    unmount()
    // Must go through showBannerWhenReady(false), not a bare hideBanner(): while ads init is still
    // pending, hideBanner() no-ops and the queued show would later paint over the mixer
    // (.omc/reviews/v040-review.md HIGH-1).
    expect(showBannerWhenReady).toHaveBeenLastCalledWith(false)
  })

  it('never requests the banner on a paid plan', () => {
    usePlanStore.setState({ plan: 'tier2000' })
    render(<Settings onClose={() => {}} />)
    expect(showBannerWhenReady).toHaveBeenCalledWith(false)
  })

  it('never requests the banner while the screen is dimmed', () => {
    useScreenStore.setState({ dimmed: true })
    render(<Settings onClose={() => {}} />)
    expect(showBannerWhenReady).toHaveBeenCalledWith(false)
  })
})

describe('Settings screen', () => {
  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<Settings onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the current plan tier name', () => {
    render(<Settings onClose={() => {}} />)
    expect(screen.getByText('무료')).toBeInTheDocument()
  })
})

describe('Settings plan section', () => {
  it('gives a free user a way to actually reach the purchase sheet', () => {
    // The upgrade hint used to be the end of the road: buying was only reachable by tapping a
    // locked palette chip, which nobody browsing settings would think to do.
    render(<Settings onClose={() => {}} />)
    const tier = screen.getByRole('button', { name: '2,000원 플랜' })
    fireEvent.click(tier)
    expect(screen.getByRole('dialog', { name: '업그레이드 안내' })).toBeTruthy()
  })

  it('does not offer plan buttons to someone who already paid', () => {
    usePlanStore.setState({ plan: 'tier5000' })
    render(<Settings onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: '2,000원 플랜' })).toBeNull()
  })
})

describe('Settings theme section', () => {
  afterEach(() => {
    localStorage.removeItem('so.theme')
    document.documentElement.removeAttribute('data-theme')
  })

  it('applies and persists an explicit Light choice', () => {
    render(<Settings onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '라이트' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('so.theme')).toBe('light')
    expect(screen.getByRole('button', { name: '라이트' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('removes the attribute again when System is chosen', () => {
    render(<Settings onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '다크' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: '시스템' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem('so.theme')).toBe('system')
  })

  it('starts from the saved choice', () => {
    localStorage.setItem('so.theme', 'dark')
    render(<Settings onClose={() => {}} />)
    expect(screen.getByRole('button', { name: '다크' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Settings fade preferences', () => {
  it('marks the current fade-in/out choice pressed and updates it on tap', () => {
    usePlaybackSettings.setState({ fadeInSec: 0, sleepFadeSec: 60 })
    render(<Settings onClose={() => {}} />)
    const fadeIn = screen.getByRole('group', { name: '시작 페이드인' })
    expect(within(fadeIn).getByRole('button', { name: '끔' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(fadeIn).getByRole('button', { name: '30초' }))
    expect(usePlaybackSettings.getState().fadeInSec).toBe(30)

    const fadeOut = screen.getByRole('group', { name: '타이머 페이드아웃' })
    expect(within(fadeOut).getByRole('button', { name: '1분' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(fadeOut).getByRole('button', { name: '10분' }))
    expect(usePlaybackSettings.getState().sleepFadeSec).toBe(600)
  })
})

describe('Settings volume cap', () => {
  it('nursery sets the low cap and shows the keep-away guidance; other choices hide it', () => {
    usePlaybackSettings.setState({ volumeCap: 1 })
    render(<Settings onClose={() => {}} />)
    const group = screen.getByRole('group', { name: '최대 볼륨' })
    expect(within(group).getByRole('button', { name: '제한 없음' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/아기 침대/)).toBeNull()

    fireEvent.click(within(group).getByRole('button', { name: '아기방' }))
    expect(usePlaybackSettings.getState().volumeCap).toBe(NURSERY_VOLUME_CAP)
    expect(screen.getByText(/아기 침대/)).toBeInTheDocument()

    fireEvent.click(within(group).getByRole('button', { name: '50%' }))
    expect(usePlaybackSettings.getState().volumeCap).toBe(0.5)
    expect(screen.queryByText(/아기 침대/)).toBeNull()
  })
})
