import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../i18n'
import { OrbControls } from './OrbControls'
import { useMixStore } from './store'
import { usePlanStore } from '../plan'

function placeOrb(soundId: string): string {
  return useMixStore.getState().addPlacement(soundId, 0.5, 0)
}

beforeEach(() => {
  useMixStore.setState({ current: { ...useMixStore.getState().current, placements: [] }, sleeping: false })
})
afterEach(cleanup)

describe('OrbControls noise tone (paid)', () => {
  it('free plan: shows a locked entry that opens the upgrade sheet instead of the slider', () => {
    usePlanStore.setState({ plan: 'free' })
    const id = placeOrb('noise-pink')
    render(<OrbControls placementId={id} label="Pink" onClose={() => {}} />)
    expect(screen.queryByLabelText('음색 (어둡게 ↔ 밝게)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '노이즈 음색 · Pro' }))
    expect(screen.getByRole('dialog', { name: '업그레이드 안내' })).toHaveTextContent('노이즈 음색 기능은 Pro부터')
  })

  it('paid plan: the slider writes tone onto the placement', () => {
    usePlanStore.setState({ plan: 'tier2000' })
    const id = placeOrb('noise-pink')
    render(<OrbControls placementId={id} label="Pink" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('음색 (어둡게 ↔ 밝게)'), { target: { value: '-40' } })
    expect(useMixStore.getState().current.placements.find((p) => p.id === id)?.tone).toBe(-0.4)
  })

  it('non-noise sounds get no tone control at all', () => {
    usePlanStore.setState({ plan: 'tier2000' })
    const id = placeOrb('nature-rain')
    render(<OrbControls placementId={id} label="Rain" onClose={() => {}} />)
    expect(screen.queryByLabelText('음색 (어둡게 ↔ 밝게)')).toBeNull()
    expect(screen.queryByRole('button', { name: /노이즈 음색/ })).toBeNull()
  })
})

describe('OrbControls gentle variation (paid)', () => {
  it('free plan: locked entry instead of the toggle', () => {
    usePlanStore.setState({ plan: 'free' })
    const id = placeOrb('nature-rain')
    render(<OrbControls placementId={id} label="Rain" onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: '자연스러운 변화 켜기' })).toBeNull()
    expect(screen.getByRole('button', { name: '자연스러운 변화 · Pro' })).toBeInTheDocument()
  })

  it('paid plan: toggles variation on the placement, for any sound', () => {
    usePlanStore.setState({ plan: 'tier2000' })
    const id = placeOrb('nature-rain')
    render(<OrbControls placementId={id} label="Rain" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '자연스러운 변화 켜기' }))
    expect(useMixStore.getState().current.placements.find((p) => p.id === id)?.variation).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '자연스러운 변화 끄기' }))
    expect(useMixStore.getState().current.placements.find((p) => p.id === id)?.variation).toBeUndefined()
  })
})
