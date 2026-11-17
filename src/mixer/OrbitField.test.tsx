// rAF orbit-loop coverage (review gap #5, p0p2-review.md): the orbit tick must not advance an
// orb's angle while sleeping, while a placement is locked, or under prefers-reduced-motion
// (visual-theme.md §9). Angle is written straight to the DOM each frame (never round-tripped
// through the store), so these assert on the rendered `transform`, not on store state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
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
})
