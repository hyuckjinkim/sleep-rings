// B1/B2 regression: a palette chip previously only responded to a pointer drag-and-drop onto
// the field. A plain click (or keyboard Enter/Space activation, which the browser turns into a
// 'click' on a real <button>) did nothing. See ux-qa.md C1/C2.
import { useRef } from 'react'
import type { RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '../i18n'
import { Palette, classifyDrag } from './Palette'
import { useMixStore } from './store'
import { usePlanStore } from '../plan'

const FIELD_RECT = { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0 } as DOMRect

function PaletteHarness() {
  const fieldRef = useRef<HTMLDivElement | null>(null) as RefObject<HTMLDivElement | null>
  return (
    <div>
      <div ref={fieldRef} data-testid="field" />
      <Palette fieldRef={fieldRef} />
    </div>
  )
}

beforeEach(() => {
  useMixStore.setState({
    current: { ...useMixStore.getState().current, placements: [] },
    loadingIds: new Set(),
    erroredIds: new Set(),
    presets: [],
    sleepEndsAt: null,
    sleeping: false,
    lastRemoved: null,
    lastRemovedAll: null,
    layerLimitNotice: null,
  })
  usePlanStore.setState({ plan: 'free' })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(FIELD_RECT)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function firstChip() {
  return within(screen.getByRole('tabpanel')).getAllByRole('button')[0]
}

describe('Palette click-to-add', () => {
  it('a plain click with no drag adds a placement (B2 regression)', () => {
    render(<PaletteHarness />)
    const chip = firstChip()

    fireEvent.click(chip)

    expect(useMixStore.getState().current.placements).toHaveLength(1)
  })

  it('a real drag-drop onto the field is not double-counted by the click handler', () => {
    render(<PaletteHarness />)
    const chip = firstChip()

    // Vertical movement classifies as 'place' (see classifyDrag), matching a drag onto the field.
    fireEvent.pointerDown(chip, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(chip, { pointerId: 1, clientX: 10, clientY: 100 })
    fireEvent.pointerUp(chip, { pointerId: 1, clientX: 10, clientY: 100 })
    fireEvent.click(chip) // the browser fires this after pointerup on the same element regardless of movement

    expect(useMixStore.getState().current.placements).toHaveLength(1)
  })
})

describe('Palette category tabs', () => {
  it('defaults to the category with the most sounds and switches on tab click', () => {
    render(<PaletteHarness />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

    const secondTab = tabs[1]
    fireEvent.click(secondTab)
    expect(secondTab).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
  })

  it('ArrowRight on a tab moves selection and focus to the next tab', () => {
    render(<PaletteHarness />)
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })

    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Palette clear all', () => {
  it('is not rendered when the field has no placements', () => {
    render(<PaletteHarness />)
    expect(screen.queryByText('모두 제거')).not.toBeInTheDocument()
  })

  it('clears every placement and restores them on undo', () => {
    useMixStore.getState().addPlacement('noise-white', 0.4, 1.2)
    useMixStore.getState().addPlacement('noise-pink', 0.2, 0.5)
    render(<PaletteHarness />)

    fireEvent.click(screen.getByText('모두 제거'))
    expect(useMixStore.getState().current.placements).toHaveLength(0)

    useMixStore.getState().restoreLastRemovedAll()
    expect(useMixStore.getState().current.placements).toHaveLength(2)
  })
})

describe('Palette plan lock (B2)', () => {
  it('a plan-locked sound stays visible and genuinely enabled, distinct from an unavailable one', () => {
    render(<PaletteHarness />)
    // 'binaural' is the last tab; all 3 of its sounds require tier5000, and the free plan is
    // the default in this test file's beforeEach.
    fireEvent.click(screen.getAllByRole('tab').at(-1)!)
    const chip = firstChip()

    // Genuinely enabled (not aria-disabled either) — the chip must stay real-tappable to open the
    // upgrade sheet, unlike an asset-unavailable chip which uses native :disabled.
    expect(chip).toBeEnabled()
    expect(chip).not.toHaveAttribute('aria-disabled')
    expect(chip.className).toContain('is-plan-locked')
    expect(chip).toHaveAccessibleName(/업그레이드/)
  })

  it('tapping a plan-locked chip opens the upgrade sheet instead of placing an orb', () => {
    render(<PaletteHarness />)
    fireEvent.click(screen.getAllByRole('tab').at(-1)!)
    const chip = firstChip()

    fireEvent.click(chip)

    expect(useMixStore.getState().current.placements).toHaveLength(0)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('a sound the plan does allow places normally with no lock styling', () => {
    render(<PaletteHarness />)
    const chip = firstChip() // default tab is 'noise', all free-tier

    expect(chip).not.toHaveAttribute('aria-disabled')
    fireEvent.click(chip)
    expect(useMixStore.getState().current.placements).toHaveLength(1)
  })
})

describe('Palette layer limit notice (B2)', () => {
  it('renders the store notice text when the layer cap replaces an orb', () => {
    useMixStore.getState().addPlacement('noise-white', 0.1, 0)
    useMixStore.getState().addPlacement('noise-pink', 0.2, 1)
    useMixStore.getState().addPlacement('noise-brown', 0.3, 2)
    useMixStore.getState().addPlacement('noise-green', 0.4, 3) // free plan cap is 3 — this replaces

    render(<PaletteHarness />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('classifyDrag', () => {
  it('stays a tap under the movement threshold', () => {
    expect(classifyDrag(1, 1)).toBe('tap')
  })

  it('classifies horizontal-dominant movement as a pan', () => {
    expect(classifyDrag(20, 2)).toBe('pan')
  })

  it('classifies vertical/diagonal movement as a field placement', () => {
    expect(classifyDrag(2, 20)).toBe('place')
    expect(classifyDrag(-10, 10)).toBe('place') // equal magnitude ties go to 'place'
  })
})
