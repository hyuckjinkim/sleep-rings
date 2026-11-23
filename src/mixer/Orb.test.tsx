// Gesture coverage for the Orb component (architecture.md §6): tap-to-select, long-press lock,
// drag commit, delete-zone drag, and the L2/L3 pointer-cancel/pinch-release regressions fixed in
// Orb.tsx. jsdom has no layout engine (getBoundingClientRect is stubbed below) and no pointer
// capture (stubbed in setupTests.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '../i18n'
import { Orb } from './Orb'
import { OrbControls } from './OrbControls'
import { isInDeleteZone } from './deleteZone'
import { useMixStore } from './store'
import { unitToPolar } from './geometry'
import type { Placement } from './types'

// Field is centered at (100, 100) with radius 100px, so a placement at radius 0.5/angle 0
// (straight up) sits at client (100, 50) — grabbing there gives a zero grab-offset.
const FIELD_RECT = { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0 } as DOMRect

interface HarnessProps {
  placement: Placement
  onTap: (id: string) => void
  beginInteraction: (id: string) => void
  endInteraction: (id: string, committed?: boolean) => void
}

function OrbHarness({ placement, onTap, beginInteraction, endInteraction }: HarnessProps) {
  const fieldRef = useRef<HTMLDivElement | null>(null)
  return (
    <div ref={fieldRef}>
      <Orb
        placement={placement}
        label="Test Orb"
        category={undefined}
        fieldRef={fieldRef}
        registerEl={() => {}}
        isDeleteZone={(clientY) => isInDeleteZone(fieldRef, clientY)}
        selected={false}
        onTap={onTap}
        beginInteraction={beginInteraction}
        endInteraction={endInteraction}
      />
    </div>
  )
}

/** Mirrors Mixer.tsx's tap-to-select-opens-popover wiring, scoped to just Orb + OrbControls. */
function SelectionHarness({ placement }: { placement: Placement }) {
  const fieldRef = useRef<HTMLDivElement | null>(null) as RefObject<HTMLDivElement | null>
  const [selectedId, setSelectedId] = useState<string | null>(null)
  return (
    <div ref={fieldRef}>
      <Orb
        placement={placement}
        label="Test Orb"
        category={undefined}
        fieldRef={fieldRef}
        registerEl={() => {}}
        isDeleteZone={(clientY) => isInDeleteZone(fieldRef, clientY)}
        selected={placement.id === selectedId}
        onTap={setSelectedId}
        beginInteraction={() => {}}
        endInteraction={() => {}}
      />
      {selectedId === placement.id && <OrbControls placementId={placement.id} label="Test Orb" onClose={() => setSelectedId(null)} />}
    </div>
  )
}

function addTestPlacement(): Placement {
  const id = useMixStore.getState().addPlacement('noise-white', 0.5, 0)
  return useMixStore.getState().current.placements.find((p) => p.id === id)!
}

function getPlacement(id: string): Placement | undefined {
  return useMixStore.getState().current.placements.find((p) => p.id === id)
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
  vi.useRealTimers()
})

describe('Orb gestures', () => {
  it('a short tap opens the control popover without moving the orb', () => {
    const placement = addTestPlacement()
    render(<SelectionHarness placement={placement} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const orb = screen.getByRole('button')
    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 100, clientY: 50 })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(getPlacement(placement.id)).toMatchObject({ radius: 0.5, angle: 0 })
  })

  it('a 500ms hold toggles locked and suppresses the tap', () => {
    vi.useFakeTimers()
    const placement = addTestPlacement()
    const onTap = vi.fn()
    render(<OrbHarness placement={placement} onTap={onTap} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    vi.advanceTimersByTime(700) // B8: LONG_PRESS_MS 500→700 튜닝 반영
    expect(getPlacement(placement.id)?.locked).toBe(true)

    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    expect(onTap).not.toHaveBeenCalled()
  })

  it('a drag commits the new radius/angle to the store on pointerup', () => {
    vi.useFakeTimers()
    const placement = addTestPlacement()
    const onTap = vi.fn()
    render(<OrbHarness placement={placement} onTap={onTap} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 170, clientY: 50 }) // past the move threshold
    vi.advanceTimersByTime(400) // exceed SWIPE_MAX_MS so this commits as a plain drag, not a swipe
    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 170, clientY: 50 })

    const expected = unitToPolar(0.7, -0.5) // (170,50) and (50,50) both map through clientToUnit with a zero grab-offset
    const updated = getPlacement(placement.id)
    expect(updated?.radius).toBeCloseTo(expected.radius, 5)
    expect(updated?.angle).toBeCloseTo(expected.angle, 5)
    expect(updated?.orbit.mode).toBe('random') // plain drag never touches orbit mode
    expect(onTap).not.toHaveBeenCalled()
  })

  it('dragging into the bottom delete zone removes the placement on release', () => {
    const placement = addTestPlacement()
    render(<OrbHarness placement={placement} onTap={vi.fn()} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 100, clientY: 190 }) // inside the bottom 22% delete band
    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 100, clientY: 190 })

    expect(getPlacement(placement.id)).toBeUndefined()
  })

  it('pointercancel reverts a delete-zone drag without committing (L3 regression)', () => {
    const placement = addTestPlacement()
    const endInteraction = vi.fn()
    render(<OrbHarness placement={placement} onTap={vi.fn()} beginInteraction={vi.fn()} endInteraction={endInteraction} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 100, clientY: 190 }) // would delete on pointerup
    fireEvent.pointerCancel(orb, { pointerId: 1, clientX: 100, clientY: 190 })

    expect(getPlacement(placement.id)).toMatchObject({ radius: 0.5, angle: 0 }) // untouched, not deleted
    expect(endInteraction).toHaveBeenLastCalledWith(placement.id) // no committed=true
  })

  it('releasing one finger mid-pinch does not revive a stale single-pointer drag (L2 regression)', () => {
    const placement = addTestPlacement()
    const onTap = vi.fn()
    render(<OrbHarness placement={placement} onTap={onTap} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100, clientY: 50 }) // grabs the orb (single-pointer gesture)
    fireEvent.pointerDown(orb, { pointerId: 2, clientX: 150, clientY: 50 }) // second finger -> pinch, drops the grab
    fireEvent.pointerUp(orb, { pointerId: 2, clientX: 150, clientY: 50 }) // pinch ends, pointer 1 still down

    // Under the L2 bug this revived the stale grab-offset and jumped the orb on the next move.
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 180, clientY: 180 })
    expect(getPlacement(placement.id)).toMatchObject({ radius: 0.5, angle: 0 })

    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 180, clientY: 180 })
    expect(getPlacement(placement.id)).toMatchObject({ radius: 0.5, angle: 0 })
    expect(onTap).not.toHaveBeenCalled() // stale gesture was null, so release isn't read as a tap either
  })

  it('Enter opens the control popover via keyboard (B1 regression)', () => {
    const placement = addTestPlacement()
    render(<SelectionHarness placement={placement} />)
    const orb = screen.getByRole('button')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    orb.focus()
    fireEvent.keyDown(orb, { key: 'Enter' })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Space opens the control popover via keyboard (B1 regression)', () => {
    const placement = addTestPlacement()
    render(<SelectionHarness placement={placement} />)
    const orb = screen.getByRole('button')

    fireEvent.keyDown(orb, { key: ' ' })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Delete removes the placement via keyboard (B1 regression)', () => {
    const placement = addTestPlacement()
    render(<OrbHarness placement={placement} onTap={vi.fn()} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')

    fireEvent.keyDown(orb, { key: 'Delete' })

    expect(getPlacement(placement.id)).toBeUndefined()
  })

  it('a wheel scroll adjusts orbit eccentricity via a non-passive native listener (B10 regression)', () => {
    const placement = addTestPlacement()
    render(<OrbHarness placement={placement} onTap={vi.fn()} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')

    fireEvent.wheel(orb, { deltaY: 100 })

    expect(getPlacement(placement.id)?.orbit.shape).toMatchObject({ kind: 'ellipse', eccentricity: 0.08 })
  })

  it('turning on the volume-swell toggle sets orbit.volumeCurve on the placement (E5a regression)', () => {
    const placement = addTestPlacement()
    render(<SelectionHarness placement={placement} />)
    const orb = screen.getByRole('button')
    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 100, clientY: 50 }) // tap opens the popover

    fireEvent.click(screen.getByRole('button', { name: '볼륨 파동 켜기' }))
    expect(getPlacement(placement.id)?.orbit.volumeCurve).toEqual({ depth: 0.5 })

    fireEvent.click(screen.getByRole('button', { name: '볼륨 파동 끄기' }))
    expect(getPlacement(placement.id)?.orbit.volumeCurve).toBeUndefined()
  })
})
