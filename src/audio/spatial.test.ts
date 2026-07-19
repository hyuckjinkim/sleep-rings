import { describe, expect, it } from 'vitest'
import {
  MAX_DISTANCE,
  REF_DISTANCE,
  THROTTLE_SEC,
  angleToPosition,
  fallbackGain,
  fallbackPan,
  radiusToDistance,
  shouldApplyRamp,
} from './spatial'

describe('radiusToDistance', () => {
  it('maps radius 0 (center) to refDistance and radius 1 (edge) to maxDistance', () => {
    expect(radiusToDistance(0)).toBe(REF_DISTANCE)
    expect(radiusToDistance(1)).toBe(MAX_DISTANCE)
  })

  it('clamps out-of-range radius', () => {
    expect(radiusToDistance(-1)).toBe(REF_DISTANCE)
    expect(radiusToDistance(2)).toBe(MAX_DISTANCE)
  })
})

describe('angleToPosition', () => {
  it('places angle 0 (front) directly ahead on -Z', () => {
    const { x, z } = angleToPosition(0, 1)
    expect(x).toBeCloseTo(0)
    expect(z).toBeCloseTo(-MAX_DISTANCE)
  })

  it('places angle pi/2 (clockwise) to the right on +X', () => {
    const { x, z } = angleToPosition(Math.PI / 2, 1)
    expect(x).toBeCloseTo(MAX_DISTANCE)
    expect(z).toBeCloseTo(0)
  })

  it('scales with radius via distance', () => {
    const near = angleToPosition(0, 0)
    expect(near.z).toBeCloseTo(-REF_DISTANCE)
  })
})

describe('fallbackGain', () => {
  it('is loudest at center and silent at the edge', () => {
    expect(fallbackGain(0)).toBe(1)
    expect(fallbackGain(1)).toBe(0)
  })

  it('is monotonically decreasing', () => {
    expect(fallbackGain(0.25)).toBeGreaterThan(fallbackGain(0.5))
    expect(fallbackGain(0.5)).toBeGreaterThan(fallbackGain(0.75))
  })
})

describe('fallbackPan', () => {
  it('stays within [-1, 1]', () => {
    for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const pan = fallbackPan(angle)
      expect(pan).toBeGreaterThanOrEqual(-1)
      expect(pan).toBeLessThanOrEqual(1)
    }
  })

  it('pans right for a clockwise quarter turn and left for a counter-clockwise one', () => {
    expect(fallbackPan(Math.PI / 2)).toBeCloseTo(1)
    expect(fallbackPan(-Math.PI / 2)).toBeCloseTo(-1)
  })
})

describe('shouldApplyRamp', () => {
  it('blocks updates inside the throttle window', () => {
    expect(shouldApplyRamp(0, THROTTLE_SEC / 2)).toBe(false)
  })

  it('allows updates once the throttle window has elapsed', () => {
    expect(shouldApplyRamp(0, THROTTLE_SEC)).toBe(true)
    expect(shouldApplyRamp(0, THROTTLE_SEC * 2)).toBe(true)
  })
})
