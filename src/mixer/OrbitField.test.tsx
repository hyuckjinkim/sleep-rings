// rAF orbit-loop coverage (review gap #5, p0p2-review.md): the orbit tick must not advance an
// orb's angle while sleeping, while a placement is locked, or under prefers-reduced-motion
// (visual-theme.md §9). Angle is written straight to the DOM each frame (never round-tripped
// through the store), so these assert on the rendered `transform`, not on store state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import type { RefObject } from 'react'
import { OrbitField } from './OrbitField'
import { useMixStore, DEFAULT_ORBIT_SPEED } from './store'
import type { PlacementPatch } from './store'

const FIELD_RECT = { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0 } as DOMRect

function addOrbitingPlacement(overrides: PlacementPatch = {}): string {
  const id = useMixStore.getState().addPlacement('noise-white', 0.5, 0)
  useMixStore.getState().updatePlacement(id, { orbit: { mode: 'random', direction: 1, speed: DEFAULT_ORBIT_SPEED }, ...overrides })
  return id
}

function renderField() {
  const fieldRef: RefObject<HTMLDivElement | null> = { current: null }
  return render(<OrbitField fieldRef={fieldRef} selectedId={null} onSelect={() => {}} />)
}

/** px distance between two `translate(xpx, ypx)` transforms. */
function gap(a: string, b: string): number {
  const xy = (t: string) => {
    const m = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/.exec(t)
    if (!m) throw new Error(`no translate in "${t}"`)
    return [Number(m[1]), Number(m[2])]
  }
  const [ax, ay] = xy(a)
  const [bx, by] = xy(b)
  return Math.hypot(ax - bx, ay - by)
}

function orbTransform(container: HTMLElement): string {
  return (container.querySelector('.mixer-orb') as HTMLElement).style.transform
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
  // The frame loop positions orbs from the field's *layout* width (offsetWidth — it must ignore a
  // transform scale), and jsdom has no layout: fake it to match FIELD_RECT.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(FIELD_RECT.width)
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OrbitField rAF orbit loop', () => {
  it('advances angle over time for an unlocked, awake orb (baseline)', () => {
    addOrbitingPlacement()
    const { container } = renderField()
    vi.advanceTimersByTime(16) // first frame paints the initial transform
    const first = orbTransform(container)
    vi.advanceTimersByTime(2000)
    expect(orbTransform(container)).not.toBe(first)
  })

  it('freezes angle progression while sleeping', () => {
    addOrbitingPlacement()
    useMixStore.setState({ sleeping: true })
    const { container } = renderField()
    vi.advanceTimersByTime(16)
    const first = orbTransform(container)
    vi.advanceTimersByTime(2000)
    expect(orbTransform(container)).toBe(first)
  })

  it('freezes angle progression for a locked placement', () => {
    addOrbitingPlacement({ locked: true })
    const { container } = renderField()
    vi.advanceTimersByTime(16)
    const first = orbTransform(container)
    vi.advanceTimersByTime(2000)
    expect(orbTransform(container)).toBe(first)
  })

  it('freezes angle progression under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    addOrbitingPlacement()
    const { container } = renderField()
    vi.advanceTimersByTime(16)
    const first = orbTransform(container)
    vi.advanceTimersByTime(2000)
    expect(orbTransform(container)).toBe(first)
  })

  it('한 오브를 눌러 리렌더돼도 다른 오브가 처음 놓은 자리로 튀지 않는다', () => {
    addOrbitingPlacement()
    addOrbitingPlacement()
    const { container } = renderField()
    vi.advanceTimersByTime(3000)
    const [a, b] = container.querySelectorAll<HTMLElement>('.mixer-orb')
    const before = b.style.transform

    fireEvent.pointerDown(a, { pointerId: 1, clientX: 100, clientY: 50 }) // setIsDragging → 모든 Orb 리렌더
    vi.advanceTimersByTime(16)
    expect(gap(b.style.transform, before)).toBeLessThan(2)
  })

  it('store angle 이 바뀌면(같은 id 프리셋 불러오기 등) 그 자리부터 다시 돈다', () => {
    const id = addOrbitingPlacement()
    const { container } = renderField()
    vi.advanceTimersByTime(3000)

    useMixStore.getState().updatePlacement(id, { angle: Math.PI, orbit: { speed: 0 } }) // 아래쪽, 멈춤
    vi.advanceTimersByTime(16)
    expect(gap(orbTransform(container), 'translate(0px, 50px)')).toBeLessThan(2)
  })
})
