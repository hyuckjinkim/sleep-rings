import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { DEFAULT_ORBIT_SPEED, useMixStore } from './store'
import { angleDelta, clamp, polarToUnit, unitToPolar } from './geometry'
import { SoundIcon } from '../icons/SoundIcon'
import { orbColor } from '../library/catalog'
import type { Category, OrbitShape, Placement } from './types'

const LONG_PRESS_MS = 700 // B8: 500ms fired too easily on a careful mid-drag pause; 700ms + the is-pending-lock cue below give more room to tell "hesitating" from "locking".
const SWIPE_MAX_MS = 300
const SWIPE_MIN_ANGLE = 0.2 // rad, ~11.5deg
const MOVE_THRESHOLD_ANGLE = 0.02
const MOVE_THRESHOLD_RADIUS = 0.02

interface OrbProps {
  placement: Placement
  label: string
  category: Category | undefined
  fieldRef: RefObject<HTMLDivElement | null>
  registerEl: (id: string, el: HTMLDivElement | null) => void
  isDeleteZone: (clientY: number) => boolean
  selected: boolean
  onTap: (id: string) => void
  beginInteraction: (id: string) => void
  endInteraction: (id: string, committedPosition?: boolean) => void
}

function fieldMetrics(fieldRef: RefObject<HTMLDivElement | null>) {
  const rect = fieldRef.current!.getBoundingClientRect()
  return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, r: rect.width / 2 }
}

function clientToUnit(clientX: number, clientY: number, m: { cx: number; cy: number; r: number }) {
  return { x: (clientX - m.cx) / m.r, y: (clientY - m.cy) / m.r }
}

// Exported for reuse by the orbit-shape slider in OrbControls.tsx (pinch-inaccessible fallback).
export function shapeForEccentricity(eccentricity: number): OrbitShape {
  return eccentricity < 0.05 ? { kind: 'circle' } : { kind: 'ellipse', eccentricity, tilt: 0 }
}

export function Orb({
  placement,
  label,
  category,
  fieldRef,
  registerEl,
  isDeleteZone,
  selected,
  onTap,
  beginInteraction,
  endInteraction,
}: OrbProps) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const updatePlacement = useMixStore((s) => s.updatePlacement)
  const toggleLocked = useMixStore((s) => s.toggleLocked)
  const removePlacement = useMixStore((s) => s.removePlacement)
  const loading = useMixStore((s) => s.loadingIds.has(placement.id))
  const sleeping = useMixStore((s) => s.sleeping)
  const errored = useMixStore((s) => s.erroredIds.has(placement.id))

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    startTime: number
    startAngle: number
    startRadius: number
    grabOffsetX: number
    grabOffsetY: number
    moved: boolean
    longPressTimer: number | null
    longPressFired: boolean
  } | null>(null)
  const pinch = useRef<{ startDist: number; startEcc: number; lastEccentricity: number } | null>(null)

  useEffect(() => {
    return () => registerEl(placement.id, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // B10: React registers onWheel as a passive listener, so preventDefault() inside it is a
  // no-op that also spams the console every scroll tick. A native listener registered with
  // { passive: false } is the only way to actually suppress background page scroll here.
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    function onWheelNative(e: WheelEvent) {
      e.preventDefault()
      const currentEcc = placement.orbit.shape.kind === 'ellipse' ? placement.orbit.shape.eccentricity : 0
      const eccentricity = clamp(currentEcc + (e.deltaY > 0 ? 0.08 : -0.08), 0, 0.85)
      updatePlacement(placement.id, { orbit: { shape: shapeForEccentricity(eccentricity) } })
    }
    el.addEventListener('wheel', onWheelNative, { passive: false })
    return () => el.removeEventListener('wheel', onWheelNative)
  }, [placement, updatePlacement])

  function setLiveTransform(radius: number, angle: number, shape: OrbitShape) {
    const el = elRef.current
    const field = fieldRef.current
    if (!el || !field) return
    const r = field.getBoundingClientRect().width / 2
    const { x, y } = polarToUnit(radius, angle, shape)
    el.style.transform = `translate(${x * r}px, ${y * r}px)`
  }

  function clearLongPress() {
    if (gesture.current?.longPressTimer != null) {
      window.clearTimeout(gesture.current.longPressTimer)
      gesture.current.longPressTimer = null
    }
    elRef.current?.classList.remove('is-pending-lock')
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    beginInteraction(placement.id)

    if (pointers.current.size === 1) {
      const m = fieldMetrics(fieldRef)
      const pointerUnit = clientToUnit(e.clientX, e.clientY, m)
      const placementUnit = polarToUnit(placement.radius, placement.angle, { kind: 'circle' })
      gesture.current = {
        startTime: performance.now(),
        startAngle: placement.angle,
        startRadius: placement.radius,
        grabOffsetX: pointerUnit.x - placementUnit.x,
        grabOffsetY: pointerUnit.y - placementUnit.y,
        moved: false,
        longPressFired: false,
        longPressTimer: window.setTimeout(() => {
          elRef.current?.classList.remove('is-pending-lock')
          if (gesture.current) gesture.current.longPressFired = true
          toggleLocked(placement.id)
        }, LONG_PRESS_MS),
      }
      elRef.current?.classList.add('is-pending-lock') // B8: visible cue while the hold is building up to a lock
    } else if (pointers.current.size === 2) {
      clearLongPress()
      // L2 fix: drop the single-pointer drag state entirely (not just its timer). Otherwise
      // if one finger lifts back to a single pointer, the stale gesture (with a grabOffset
      // computed before the pinch started) revives and jumps the orb on the next move/release.
      gesture.current = null
      const pts = [...pointers.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const currentEcc = placement.orbit.shape.kind === 'ellipse' ? placement.orbit.shape.eccentricity : 0
      pinch.current = { startDist: dist, startEcc: currentEcc, lastEccentricity: currentEcc }
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2 && pinch.current) {
      const pts = [...pointers.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const m = fieldMetrics(fieldRef)
      const spread = (dist - pinch.current.startDist) / m.r
      // pinch out (fingers spreading) tightens toward a circle; pinch in stretches the ellipse
      const eccentricity = clamp(pinch.current.startEcc - spread, 0, 0.85)
      pinch.current.lastEccentricity = eccentricity
      setLiveTransform(placement.radius, placement.angle, shapeForEccentricity(eccentricity))
      return
    }

    const g = gesture.current
    if (!g || pointers.current.size !== 1) return

    const m = fieldMetrics(fieldRef)
    const pointerUnit = clientToUnit(e.clientX, e.clientY, m)
    const targetUnit = { x: pointerUnit.x - g.grabOffsetX, y: pointerUnit.y - g.grabOffsetY }
    const { radius, angle } = unitToPolar(targetUnit.x, targetUnit.y)

    if (!g.moved) {
      const movedEnough =
        Math.abs(angleDelta(g.startAngle, angle)) > MOVE_THRESHOLD_ANGLE ||
        Math.abs(radius - g.startRadius) > MOVE_THRESHOLD_RADIUS
      if (movedEnough) {
        g.moved = true
        clearLongPress()
      }
    }

    if (g.moved && !g.longPressFired) {
      setLiveTransform(radius, angle, placement.orbit.shape)
      elRef.current?.classList.toggle('is-delete-target', isDeleteZone(e.clientY))
    }
  }

  /** Returns true if a new radius/angle was actually committed to the store (drag/swipe). */
  function finishSinglePointer(e: React.PointerEvent<HTMLDivElement>): boolean {
    const g = gesture.current
    clearLongPress()
    gesture.current = null
    if (!g || g.longPressFired) return false

    if (!g.moved) {
      onTap(placement.id)
      return false
    }

    elRef.current?.classList.remove('is-delete-target')
    if (isDeleteZone(e.clientY)) {
      removePlacement(placement.id)
      return false
    }

    const m = fieldMetrics(fieldRef)
    const pointerUnit = clientToUnit(e.clientX, e.clientY, m)
    const targetUnit = { x: pointerUnit.x - g.grabOffsetX, y: pointerUnit.y - g.grabOffsetY }
    const { radius, angle } = unitToPolar(targetUnit.x, targetUnit.y)

    const elapsed = performance.now() - g.startTime
    const delta = angleDelta(g.startAngle, angle)
    const isSwipe = elapsed < SWIPE_MAX_MS && Math.abs(delta) > SWIPE_MIN_ANGLE

    if (isSwipe) {
      updatePlacement(placement.id, {
        radius,
        angle,
        orbit: { mode: 'steered', direction: delta > 0 ? 1 : -1, speed: placement.orbit.speed || DEFAULT_ORBIT_SPEED },
      })
    } else {
      updatePlacement(placement.id, { radius, angle })
    }
    return true
  }

  function finishPinch() {
    if (!pinch.current) return
    updatePlacement(placement.id, { orbit: { shape: shapeForEccentricity(pinch.current.lastEccentricity) } })
    pinch.current = null
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasPinching = pointers.current.size === 2 && pinch.current != null
    pointers.current.delete(e.pointerId)

    let committedPosition = false
    if (wasPinching) {
      finishPinch() // shape only — never touches radius/angle, no liveAngles resync needed
    } else if (pointers.current.size === 0) {
      committedPosition = finishSinglePointer(e)
    }

    if (pointers.current.size === 0) {
      // Don't reset the transform here: `placement` is the stale pre-commit prop, and the
      // element is already visually at the just-committed position from the live drag/pinch
      // preview. Handing back to the parent's rAF loop (which reads fresh store state next
      // frame) avoids a one-frame snap-back-then-forward glitch on release.
      endInteraction(placement.id, committedPosition)
    }
  }

  /** L3 fix: a cancelled gesture must not commit — revert instead of routing through pointerup. */
  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size > 0) return

    clearLongPress()
    gesture.current = null
    pinch.current = null
    elRef.current?.classList.remove('is-delete-target')
    // No commit, no liveAngles reset: the parent's rAF loop resumes orbiting from wherever it
    // was frozen at gesture-start (liveAngles was never touched during the live preview).
    endInteraction(placement.id)
  }

  // B1: Orb was role="button" tabIndex={0} with no onKeyDown — completely unreachable by
  // keyboard. Enter/Space mirrors the tap-to-open-popover gesture; Delete/Backspace mirrors
  // the delete-zone drag (the undo toast in store.ts's removePlacement covers both).
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap(placement.id)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removePlacement(placement.id)
    }
  }

  return (
    <div
      ref={(el) => {
        elRef.current = el
        registerEl(placement.id, el)
      }}
      // "sleeping" (post sleep-timer fade-out) reuses the loading look — both mean
      // "not audibly playing right now", visual-theme.md §3 only defines one dim state.
      className={`mixer-orb${placement.locked ? ' is-locked' : ''}${selected ? ' is-selected' : ''}${loading || sleeping ? ' is-loading' : ''}${errored ? ' is-error' : ''}`}
      style={category ? ({ '--orb-color': orbColor(placement.soundId, category) } as React.CSSProperties) : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={placement.locked}
    >
      <SoundIcon soundId={placement.soundId} category={category} />
    </div>
  )
}
