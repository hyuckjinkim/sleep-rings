// Pure, framework-independent placement math (architecture.md §0: business logic
// stays testable without React/AudioContext).
import type { OrbitShape } from './types'

export const TAU = Math.PI * 2

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function normalizeAngle(a: number): number {
  return ((a % TAU) + TAU) % TAU
}

/** Shortest signed angle delta from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = normalizeAngle(b - a)
  if (d > Math.PI) d -= TAU
  return d
}

/**
 * radius(0..1) -> gain, fallback exponential curve from docs/design/audio-engine.md §2
 * (StereoPanner fallback path: center=1, edge->0). Used to label the UI volume slider;
 * the real engine may compute gain differently via PannerNode distance model.
 */
export function radiusToVolume(radius: number): number {
  const r = clamp(radius, 0, 1)
  return (1 - r) ** 2
}

export function volumeToRadius(volume: number): number {
  return 1 - Math.sqrt(clamp(volume, 0, 1))
}

/**
 * Polar placement (radius 0..1, angle rad, 0=front/up, clockwise) -> unit cartesian
 * (x, y each in [-1, 1]) with the orbit's shape (circle or tilted ellipse) applied.
 * Caller scales x/y by the field's pixel radius.
 */
export function polarToUnit(radius: number, angle: number, shape: OrbitShape): { x: number; y: number } {
  const r = clamp(radius, 0, 1)
  const rawX = r * Math.sin(angle)
  const rawY = -r * Math.cos(angle)
  if (shape.kind === 'circle') return { x: rawX, y: rawY }

  const b = 1 - clamp(shape.eccentricity, 0, 0.95) // minor/major axis ratio
  const localX = rawX
  const localY = rawY * b
  const cos = Math.cos(shape.tilt)
  const sin = Math.sin(shape.tilt)
  return { x: localX * cos - localY * sin, y: localX * sin + localY * cos }
}

/** Inverse of polarToUnit — used to read a pointer position back as polar. Circle when no shape is given. */
export function unitToPolar(x: number, y: number, shape: OrbitShape = { kind: 'circle' }): { radius: number; angle: number } {
  if (shape.kind === 'ellipse') {
    // 기울기를 되돌리고 짧은 축 비율로 나눠 원 좌표로 펼친다.
    const b = 1 - clamp(shape.eccentricity, 0, 0.95)
    const cos = Math.cos(shape.tilt)
    const sin = Math.sin(shape.tilt)
    const localX = x * cos + y * sin
    const localY = -x * sin + y * cos
    x = localX
    y = localY / b
  }
  const radius = clamp(Math.hypot(x, y), 0, 1)
  const angle = normalizeAngle(Math.atan2(x, -y))
  return { radius, angle }
}

/**
 * Angle for a newly tapped-in orb: the middle of the widest gap between the orbs already on the
 * field. A plain Math.random() angle collides often enough to matter — with three orbs placed by
 * tapping, two landing on top of each other was the common case, not the rare one, and stacked
 * orbs can't be tapped apart. Radius stays random; this only spreads them around the ring.
 */
export function spreadAngle(existing: readonly number[]): number {
  if (existing.length === 0) return Math.random() * TAU
  const sorted = [...existing].map(normalizeAngle).sort((a, b) => a - b)
  let widest = -1
  let angle = 0
  for (let i = 0; i < sorted.length; i++) {
    const from = sorted[i]
    // last one wraps around to the first, so the gap search covers the whole circle
    const to = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU
    const gap = to - from
    if (gap > widest) {
      widest = gap
      angle = normalizeAngle(from + gap / 2)
    }
  }
  return angle
}

// Orb.tsx(핀치)와 OrbControls.tsx 의 궤도 모양 슬라이더(핀치가 안 될 때 대안)가 함께 쓴다.
export function shapeForEccentricity(eccentricity: number): OrbitShape {
  return eccentricity < 0.05 ? { kind: 'circle' } : { kind: 'ellipse', eccentricity, tilt: 0 }
}

const DRAG_THRESHOLD_PX = 4

export type DragIntent = 'tap' | 'pan' | 'place'

/**
 * Classify a chip pointer gesture once total movement clears DRAG_THRESHOLD_PX. Horizontal-
 * dominant movement pans the palette strip (chips already use pointerdown->field drag to place
 * an orb, so panning needs its own axis to avoid colliding with that gesture); vertical/diagonal
 * movement keeps the existing field-placement drag. Below threshold it's still a tap. Pure
 * function so the direction split can be unit-tested without pointer-event plumbing.
 */
export function classifyDrag(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): DragIntent {
  if (Math.hypot(dx, dy) <= threshold) return 'tap'
  return Math.abs(dx) > Math.abs(dy) ? 'pan' : 'place'
}
