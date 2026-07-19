// Pure radius/angle -> gain/position math, plus the ramp-throttle predicate for orbit
// animation. No AudioContext, no side effects. Source: docs/design/audio-engine.md §2.

/** PannerNode distanceModel: 'inverse' distance range. radius 0..1 maps linearly onto this. */
export const REF_DISTANCE = 1
export const MAX_DISTANCE = 10

/** Ramp duration for throttled position updates (§2: "~50ms 램프"). */
export const RAMP_SEC = 0.05
/** Throttle window for orbit position updates (§2: "~20-30Hz로 스로틀"). */
export const THROTTLE_SEC = 1 / 25

/** radius (0=center=loud .. 1=edge=quiet) -> PannerNode distance. */
export function radiusToDistance(radius: number): number {
  const r = clamp01(radius)
  return REF_DISTANCE + r * (MAX_DISTANCE - REF_DISTANCE)
}

/** angle (radians, 0=front, clockwise) + radius -> listener-space (x, z) on the horizontal plane. */
export function angleToPosition(angle: number, radius: number): { x: number; z: number } {
  const distance = radiusToDistance(radius)
  return {
    x: Math.sin(angle) * distance,
    z: -Math.cos(angle) * distance,
  }
}

/** StereoPanner fallback: radius -> gain, no PannerNode distance model available. */
export function fallbackGain(radius: number): number {
  const r = clamp01(radius)
  return (1 - r) ** 2
}

/** StereoPanner fallback: angle -> pan (-1 left .. 1 right). Front/back is lost (L/R only). */
export function fallbackPan(angle: number): number {
  return clamp(Math.sin(angle), -1, 1)
}

/** True once >= throttleSec has passed since the last applied ramp — drives the rAF-throttle in §2. */
export function shouldApplyRamp(lastAppliedAt: number, now: number, throttleSec = THROTTLE_SEC): boolean {
  return now - lastAppliedAt >= throttleSec
}

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
