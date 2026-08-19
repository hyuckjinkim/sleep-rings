import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import '../i18n'
import { Settings } from './Settings'
import { usePlanStore } from '../plan'
import { useScreenStore } from '../screen/store'

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
