// B1/B2 regression: a palette chip previously only responded to a pointer drag-and-drop onto
// the field. A plain click (or keyboard Enter/Space activation, which the browser turns into a
// 'click' on a real <button>) did nothing. See ux-qa.md C1/C2.
import { useRef } from 'react'
import type { RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '../i18n'
import { Palette } from './Palette'
import { useMixStore } from './store'

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
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(FIELD_RECT)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Palette click-to-add', () => {
  it('a plain click with no drag adds a placement (B2 regression)', () => {
    render(<PaletteHarness />)
    const chip = screen.getAllByRole('button')[0]

    fireEvent.click(chip)

    expect(useMixStore.getState().current.placements).toHaveLength(1)
  })

  it('a real drag-drop onto the field is not double-counted by the click handler', () => {
    render(<PaletteHarness />)
    const chip = screen.getAllByRole('button')[0]

    fireEvent.pointerDown(chip, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(chip, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(chip, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.click(chip) // the browser fires this after pointerup on the same element regardless of movement

    expect(useMixStore.getState().current.placements).toHaveLength(1)
  })
})
