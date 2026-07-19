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

/** Inverse of polarToUnit's circle case — used to read a pointer position back as polar. */
export function unitToPolar(x: number, y: number): { radius: number; angle: number } {
  const radius = clamp(Math.hypot(x, y), 0, 1)
  const angle = normalizeAngle(Math.atan2(x, -y))
  return { radius, angle }
}
