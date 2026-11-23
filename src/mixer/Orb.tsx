import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { DEFAULT_ORBIT_SPEED, useMixStore } from './store'
import { angleDelta, clamp, polarToUnit, shapeForEccentricity, unitToPolar } from './geometry'
import { SoundIcon } from '../icons/SoundIcon'
import { orbColor } from '../library/catalog'
import type { Category, OrbitShape, Placement } from './types'

const SWIPE_MAX_MS = 300
const SWIPE_MIN_ANGLE = 0.2 // rad, ~11.5deg
// 탭과 드래그를 가르는 화면 거리. 손가락은 떼는 순간 몇 px 흔들리므로 마우스보다 넓게 둔다.
const MOVE_THRESHOLD_TOUCH_PX = 10
const MOVE_THRESHOLD_MOUSE_PX = 4

interface OrbProps {
  placement: Placement
  label: string
  category: Category | undefined
  fieldRef: RefObject<HTMLDivElement | null>
  registerEl: (id: string, el: HTMLDivElement | null) => void
  isDeleteZone: (clientY: number) => boolean
  selected: boolean
  onTap: (id: string) => void
  /** 지금 화면에 그려진 궤도 각도(OrbitField 의 liveAngles)를 돌려준다. 아직 없으면 undefined. */
  beginInteraction: (id: string) => number | undefined
  endInteraction: (id: string, committedPosition?: boolean) => void
}

function fieldMetrics(fieldRef: RefObject<HTMLDivElement | null>) {
  const rect = fieldRef.current!.getBoundingClientRect()
  return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, r: rect.width / 2 }
}

function clientToUnit(clientX: number, clientY: number, m: { cx: number; cy: number; r: number }) {
  return { x: (clientX - m.cx) / m.r, y: (clientY - m.cy) / m.r }
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
  const removePlacement = useMixStore((s) => s.removePlacement)
  const loading = useMixStore((s) => s.loadingIds.has(placement.id))
  const sleeping = useMixStore((s) => s.sleeping)
  const errored = useMixStore((s) => s.erroredIds.has(placement.id))

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    startTime: number
    startAngle: number
    startX: number
    startY: number
    moveThresholdPx: number
    grabOffsetX: number
    grabOffsetY: number
    moved: boolean
  } | null>(null)
  const pinch = useRef<{ startDist: number; startEcc: number; lastEccentricity: number; angle: number } | null>(null)

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
    const r = field.offsetWidth / 2 // layout width — see OrbitField's frame loop (transform-scaled layouts)
    const { x, y } = polarToUnit(radius, angle, shape)
    el.style.transform = `translate(${x * r}px, ${y * r}px)`
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // store 의 angle 은 놓은(마지막으로 끌어 놓은) 자리라 궤도를 돈 뒤엔 낡았다 — 지금 그려진 각도로 잡는다.
    const angle = beginInteraction(placement.id) ?? placement.angle

    if (pointers.current.size === 1) {
      const m = fieldMetrics(fieldRef)
      const pointerUnit = clientToUnit(e.clientX, e.clientY, m)
      const placementUnit = polarToUnit(placement.radius, angle, placement.orbit.shape)
      gesture.current = {
        startTime: performance.now(),
        startAngle: angle,
        startX: e.clientX,
        startY: e.clientY,
        moveThresholdPx: e.pointerType === 'mouse' ? MOVE_THRESHOLD_MOUSE_PX : MOVE_THRESHOLD_TOUCH_PX,
        grabOffsetX: pointerUnit.x - placementUnit.x,
        grabOffsetY: pointerUnit.y - placementUnit.y,
        moved: false,
      }
    } else if (pointers.current.size === 2) {
      // L2 fix: drop the single-pointer drag state entirely (not just its timer). Otherwise
      // if one finger lifts back to a single pointer, the stale gesture (with a grabOffset
      // computed before the pinch started) revives and jumps the orb on the next move/release.
      gesture.current = null
      const pts = [...pointers.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const currentEcc = placement.orbit.shape.kind === 'ellipse' ? placement.orbit.shape.eccentricity : 0
      pinch.current = { startDist: dist, startEcc: currentEcc, lastEccentricity: currentEcc, angle }
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
      setLiveTransform(placement.radius, pinch.current.angle, shapeForEccentricity(eccentricity))
      return
    }

    const g = gesture.current
    if (!g || pointers.current.size !== 1) return

    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > g.moveThresholdPx) g.moved = true

    if (g.moved) {
      const m = fieldMetrics(fieldRef)
      const pointerUnit = clientToUnit(e.clientX, e.clientY, m)
      const { radius, angle } = unitToPolar(pointerUnit.x - g.grabOffsetX, pointerUnit.y - g.grabOffsetY, placement.orbit.shape)
      setLiveTransform(radius, angle, placement.orbit.shape)
      elRef.current?.classList.toggle('is-delete-target', isDeleteZone(e.clientY))
    }
  }

  /** Returns true if a new radius/angle was actually committed to the store (drag/swipe). */
  function finishSinglePointer(e: React.PointerEvent<HTMLDivElement>): boolean {
    const g = gesture.current
    gesture.current = null
    if (!g) return false

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
    const { radius, angle } = unitToPolar(pointerUnit.x - g.grabOffsetX, pointerUnit.y - g.grabOffsetY, placement.orbit.shape)

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
        // 인라인 콜백이라 리렌더마다 null 로도 불린다. null 을 넘기면 OrbitField 가 궤도 각도를 지워
        // 모든 오브가 처음 놓은 자리로 튄다 — 해제는 위의 언마운트 effect 가 맡는다.
        if (el) registerEl(placement.id, el)
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
