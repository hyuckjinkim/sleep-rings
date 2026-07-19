import { describe, it, expect } from 'vitest'
import {
  clamp,
  normalizeAngle,
  angleDelta,
  radiusToVolume,
  volumeToRadius,
  polarToUnit,
  unitToPolar,
} from './geometry'

describe('clamp', () => {
  it('clamps below min and above max', () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(2, 0, 1)).toBe(1)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})

describe('normalizeAngle / angleDelta', () => {
  it('wraps angles into [0, TAU)', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2)
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
  })

  it('finds the shortest signed delta across the wrap boundary', () => {
    expect(angleDelta(0.1, -0.1 + Math.PI * 2)).toBeCloseTo(-0.2)
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2)
  })
})

describe('radius <-> volume mapping', () => {
  it('center (radius 0) is full volume, edge (radius 1) is silent', () => {
    expect(radiusToVolume(0)).toBeCloseTo(1)
    expect(radiusToVolume(1)).toBeCloseTo(0)
  })

  it('volumeToRadius is the inverse of radiusToVolume', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const r = volumeToRadius(v)
      expect(radiusToVolume(r)).toBeCloseTo(v, 5)
    }
  })
})

describe('polarToUnit / unitToPolar', () => {
  it('places angle 0 straight up (negative y) on a circle', () => {
    const { x, y } = polarToUnit(1, 0, { kind: 'circle' })
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(-1)
  })

  it('places angle PI/2 to the right (positive x), clockwise convention', () => {
    const { x, y } = polarToUnit(1, Math.PI / 2, { kind: 'circle' })
    expect(x).toBeCloseTo(1)
    expect(y).toBeCloseTo(0)
  })

  it('round-trips circle placements through unitToPolar', () => {
    const cases: Array<[number, number]> = [
      [0.5, 0],
      [0.8, Math.PI / 2],
      [0.3, Math.PI],
      [1, (3 * Math.PI) / 2],
    ]
    for (const [radius, angle] of cases) {
      const { x, y } = polarToUnit(radius, angle, { kind: 'circle' })
      const back = unitToPolar(x, y)
      expect(back.radius).toBeCloseTo(radius, 5)
      expect(back.angle).toBeCloseTo(angle, 5)
    }
  })

  it('flattens the minor axis for an ellipse shape', () => {
    const shape = { kind: 'ellipse' as const, eccentricity: 0.5, tilt: 0 }
    const { x, y } = polarToUnit(1, Math.PI / 2, shape) // rightmost point, on the major axis
    expect(x).toBeCloseTo(1)
    expect(y).toBeCloseTo(0)
    const top = polarToUnit(1, 0, shape) // topmost point, on the minor axis -> compressed
    expect(top.y).toBeCloseTo(-0.5)
  })
})
