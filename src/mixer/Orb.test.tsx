// Gesture coverage for the Orb component (architecture.md §6): tap-to-select (a hold is still a tap —
// locking lives only in the popover), drag commit, delete-zone drag, and the L2/L3 pointer-cancel/pinch-release regressions fixed in
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
import { polarToUnit, unitToPolar } from './geometry'
import type { Placement } from './types'

// Field is centered at (100, 100) with radius 100px, so a placement at radius 0.5/angle 0
// (straight up) sits at client (100, 50) — grabbing there gives a zero grab-offset.
const FIELD_RECT = { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0 } as DOMRect

interface HarnessProps {
  placement: Placement
  onTap: (id: string) => void
  beginInteraction: (id: string) => number | undefined
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
        beginInteraction={() => undefined}
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

  it('길게 눌러도 잠그지 않고, 떼면 탭처럼 패널을 연다(잠금은 패널 버튼으로만)', () => {
    vi.useFakeTimers()
    const placement = addTestPlacement()
    const onTap = vi.fn()
    render(<OrbHarness placement={placement} onTap={onTap} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    vi.advanceTimersByTime(1500)
    expect(getPlacement(placement.id)?.locked).toBe(false)

    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    expect(onTap).toHaveBeenCalledWith(placement.id)
    expect(getPlacement(placement.id)?.locked).toBe(false)
  })

  it('손가락 떨림(10px 이하)은 탭, 그보다 크면 드래그 — 마우스는 4px 기준', () => {
    const placement = addTestPlacement()
    const onTap = vi.fn()
    render(<OrbHarness placement={placement} onTap={onTap} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')
    function press(pointerType: string, dx: number) {
      onTap.mockClear()
      fireEvent.pointerDown(orb, { pointerId: 1, pointerType, clientX: 100, clientY: 50 })
      fireEvent.pointerMove(orb, { pointerId: 1, pointerType, clientX: 100 + dx, clientY: 50 })
      fireEvent.pointerUp(orb, { pointerId: 1, pointerType, clientX: 100 + dx, clientY: 50 })
      return onTap.mock.calls.length > 0
    }

    expect(press('touch', 8)).toBe(true)
    expect(press('mouse', 3)).toBe(true)
    expect(getPlacement(placement.id)).toMatchObject({ radius: 0.5, angle: 0 }) // 탭은 위치를 바꾸지 않는다
    expect(press('mouse', 6)).toBe(false)
  })

  it('궤도를 돈 오브는 지금 그려진 각도에서 잡혀 손가락을 따라간다', () => {
    vi.useFakeTimers()
    const placement = addTestPlacement() // store angle 0(위쪽)
    const liveAngle = Math.PI / 2 // 오른쪽 (150, 100) 으로 돌아가 있다
    render(<OrbHarness placement={placement} onTap={vi.fn()} beginInteraction={() => liveAngle} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 150, clientY: 100 })
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 150, clientY: 130 })
    vi.advanceTimersByTime(400)
    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 150, clientY: 130 })

    const expected = unitToPolar(0.5, 0.3) // 잡은 자리 = 오브 중심이라 놓은 자리가 곧 손가락 자리
    expect(getPlacement(placement.id)?.radius).toBeCloseTo(expected.radius, 5)
    expect(getPlacement(placement.id)?.angle).toBeCloseTo(expected.angle, 5)
  })

  it('타원 궤도 오브도 놓은 자리가 손가락 자리다', () => {
    vi.useFakeTimers()
    const shape = { kind: 'ellipse', eccentricity: 0.5, tilt: 0.3 } as const
    const id = useMixStore.getState().addPlacement('noise-white', 0.6, 1)
    useMixStore.getState().updatePlacement(id, { orbit: { shape } })
    const start = polarToUnit(0.6, 1, shape)
    render(<OrbHarness placement={getPlacement(id)!} onTap={vi.fn()} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100 + start.x * 100, clientY: 100 + start.y * 100 })
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 80, clientY: 140 })
    vi.advanceTimersByTime(400)
    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 80, clientY: 140 })

    const p = getPlacement(id)!
    const drawn = polarToUnit(p.radius, p.angle, shape) // OrbitField 가 그리는 자리
    expect(drawn.x).toBeCloseTo(-0.2, 5)
    expect(drawn.y).toBeCloseTo(0.4, 5)
  })

  it('터치 탭으로 패널이 열린 직후의 잔여 click 은 새 패널 버튼을 누르지 않는다', () => {
    vi.useFakeTimers()
    const placement = addTestPlacement()
    render(<SelectionHarness placement={placement} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 50 })
    fireEvent.pointerUp(orb, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 50 })
    const lock = screen.getByRole('button', { name: '위치 고정' })
    fireEvent.click(lock, { detail: 1 }) // Chromium 이 탭 뒤에 보내는 호환 click — 손가락 아래 새 버튼에 떨어진다
    expect(getPlacement(placement.id)?.locked).toBe(false)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.pointerDown(lock, { pointerId: 2, pointerType: 'touch' }) // 사람이 다시 누르면 그대로 동작한다
    fireEvent.click(lock, { detail: 1 })
    expect(getPlacement(placement.id)?.locked).toBe(true)
  })

  it('리렌더 때 registerEl(id, null) 을 부르지 않는다 — 해제는 언마운트 때만', () => {
    const placement = addTestPlacement()
    const registerEl = vi.fn()
    const fieldRef = { current: document.createElement('div') }
    const props = {
      label: 'Test Orb',
      category: undefined,
      fieldRef,
      registerEl,
      isDeleteZone: () => false,
      onTap: vi.fn(),
      beginInteraction: vi.fn(),
      endInteraction: vi.fn(),
    }
    const { rerender, unmount } = render(<Orb {...props} placement={placement} selected={false} />)
    rerender(<Orb {...props} placement={placement} selected />)
    expect(registerEl).not.toHaveBeenCalledWith(placement.id, null)

    unmount()
    expect(registerEl).toHaveBeenLastCalledWith(placement.id, null)
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

  it('포인터 캡처는 안쪽 아이콘이 아니라 오브 자신에 건다 — 아이콘 노드가 바뀌어도 pointerup 을 놓치지 않게', () => {
    const placement = addTestPlacement()
    render(<OrbHarness placement={placement} onTap={vi.fn()} beginInteraction={vi.fn()} endInteraction={vi.fn()} />)
    const orb = screen.getByRole('button')
    const icon = document.createElement('span')
    orb.appendChild(icon)
    const capture = vi.spyOn(Element.prototype, 'setPointerCapture')

    fireEvent.pointerDown(icon, { pointerId: 1, clientX: 100, clientY: 50 })

    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture.mock.contexts[0]).toBe(orb)
    capture.mockRestore()
  })

  it('pointerup 전에 캡처를 잃으면 드래그를 취소로 닫아 오브가 드래그 중으로 멈추지 않는다', () => {
    const placement = addTestPlacement()
    const endInteraction = vi.fn()
    render(<OrbHarness placement={placement} onTap={vi.fn()} beginInteraction={vi.fn()} endInteraction={endInteraction} />)
    const orb = screen.getByRole('button')

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 100, clientY: 50 })
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 100, clientY: 190 })
    fireEvent.lostPointerCapture(orb, { pointerId: 1 })

    expect(endInteraction).toHaveBeenLastCalledWith(placement.id)
    expect(getPlacement(placement.id)).toMatchObject({ radius: 0.5, angle: 0 })

    // 정상 pointerup 뒤에 오는 lostpointercapture 는 두 번 닫지 않는다.
    endInteraction.mockClear()
    fireEvent.pointerDown(orb, { pointerId: 2, clientX: 100, clientY: 50 })
    fireEvent.pointerUp(orb, { pointerId: 2, clientX: 100, clientY: 50 })
    fireEvent.lostPointerCapture(orb, { pointerId: 2 })
    expect(endInteraction).toHaveBeenCalledTimes(1)
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
