import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useMixStore } from './store'
import { angleDelta, clamp, polarToUnit, unitToPolar } from './geometry'
import type { OrbitShape, Placement } from './types'

const LONG_PRESS_MS = 500
const SWIPE_MAX_MS = 300
const SWIPE_MIN_ANGLE = 0.2 // rad, ~11.5deg
const MOVE_THRESHOLD_ANGLE = 0.02
const MOVE_THRESHOLD_RADIUS = 0.02

interface OrbProps {
  placement: Placement
  label: string
  fieldRef: RefObject<HTMLDivElement | null>
  registerEl: (id: string, el: HTMLDivElement | null) => void
  isDeleteZone: (clientY: number) => boolean
  selected: boolean
  onTap: (id: string) => void
  beginInteraction: (id: string) => void
  endInteraction: (id: string) => void
}

function fieldMetrics(fieldRef: RefObject<HTMLDivElement | null>) {
  const rect = fieldRef.current!.getBoundingClientRect()
  return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, r: rect.width / 2 }
}

function clientToUnit(clientX: number, clientY: number, m: { cx: number; cy: number; r: number }) {
  return { x: (clientX - m.cx) / m.r, y: (clientY - m.cy) / m.r }
}

function shapeForEccentricity(eccentricity: number): OrbitShape {
  return eccentricity < 0.05 ? { kind: 'circle' } : { kind: 'ellipse', eccentricity, tilt: 0 }
}

export function Orb({
  placement,
  label,
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
          if (gesture.current) gesture.current.longPressFired = true
          toggleLocked(placement.id)
        }, LONG_PRESS_MS),
      }
    } else if (pointers.current.size === 2) {
      clearLongPress()
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

  function finishSinglePointer(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    clearLongPress()
    gesture.current = null
    if (!g || g.longPressFired) return

    if (!g.moved) {
      onTap(placement.id)
      return
    }

    elRef.current?.classList.remove('is-delete-target')
    if (isDeleteZone(e.clientY)) {
      removePlacement(placement.id)
      return
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
        orbit: { mode: 'steered', direction: delta > 0 ? 1 : -1, speed: placement.orbit.speed || 0.15 },
      })
    } else {
      updatePlacement(placement.id, { radius, angle })
    }
  }

  function finishPinch() {
    if (!pinch.current) return
    updatePlacement(placement.id, { orbit: { shape: shapeForEccentricity(pinch.current.lastEccentricity) } })
    pinch.current = null
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasPinching = pointers.current.size === 2 && pinch.current != null
    pointers.current.delete(e.pointerId)

    if (wasPinching) {
      finishPinch()
    } else if (pointers.current.size === 0) {
      finishSinglePointer(e)
    }

    if (pointers.current.size === 0) {
      endInteraction(placement.id)
      setLiveTransform(placement.radius, placement.angle, placement.orbit.shape)
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const currentEcc = placement.orbit.shape.kind === 'ellipse' ? placement.orbit.shape.eccentricity : 0
    const eccentricity = clamp(currentEcc + (e.deltaY > 0 ? 0.08 : -0.08), 0, 0.85)
    updatePlacement(placement.id, { orbit: { shape: shapeForEccentricity(eccentricity) } })
  }

  return (
    <div
      ref={(el) => {
        elRef.current = el
        registerEl(placement.id, el)
      }}
      className={`mixer-orb${placement.locked ? ' is-locked' : ''}${selected ? ' is-selected' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={placement.locked}
    >
      {label}
    </div>
  )
}
