import { describe, expect, it } from 'vitest'
import { MAX_SHARE_PARAM_LENGTH, decodeShareUrl, encodeMix, shareParam, shareUrl } from './share'
import { UNTITLED_MIX_NAME } from './types'
import type { Mix, Placement } from './types'

const BASE = 'https://example.test/'
const linkFor = (json: unknown) => `${BASE}#mix=${Buffer.from(typeof json === 'string' ? json : JSON.stringify(json)).toString('base64url')}`
const orb = (s: string, extra: Record<string, unknown> = {}) => ({ s, r: 0.5, a: 1, v: 1, o: { m: 'random', sp: 0.1, d: 1 }, ...extra })

function placement(soundId: string, patch: Partial<Placement> = {}): Placement {
  return {
    id: `p-${soundId}`,
    soundId,
    radius: 0.42,
    angle: 2.5,
    volume: 0.8,
    locked: false,
    orbit: { mode: 'steered', shape: { kind: 'ellipse', eccentricity: 0.4, tilt: 0.3 }, speed: 0.2, direction: -1, volumeCurve: { depth: 0.5, phase: 1 } },
    ...patch,
  }
}

const mixOf = (placements: Placement[], name = '비 오는 밤'): Mix => ({ id: 'm', name, placements, masterVolume: 0.7, updatedAt: 0 })

describe('share link round trip', () => {
  it('restores sounds, positions, orbit settings and master volume', () => {
    const mix = mixOf([placement('noise-brown', { locked: true, muted: true }), placement('nature-rain')])
    const decoded = decodeShareUrl(shareUrl(mix, BASE), 'free')
    expect(decoded?.lockedPlan).toBeNull()
    expect(decoded?.mix).toMatchObject({ name: '비 오는 밤', masterVolume: 0.7 })
    expect(decoded?.mix.placements).toHaveLength(2)
    expect(decoded?.mix.placements[0]).toMatchObject({
      soundId: 'noise-brown',
      radius: 0.42,
      angle: 2.5,
      volume: 0.8,
      locked: true,
      muted: true,
      orbit: { mode: 'steered', shape: { kind: 'ellipse', eccentricity: 0.4 }, speed: 0.2, direction: -1, volumeCurve: { depth: 0.5, phase: 1 } },
    })
    const shape = decoded!.mix.placements[0].orbit.shape
    expect(shape.kind === 'ellipse' && shape.tilt).toBeCloseTo(0.3)
  })

  it('gives decoded placements fresh, unique ids', () => {
    const decoded = decodeShareUrl(shareUrl(mixOf([placement('noise-brown'), placement('noise-brown')]), BASE), 'free')
    const [a, b] = decoded!.mix.placements
    expect(a.id).not.toBe('p-noise-brown')
    expect(a.id).not.toBe(b.id)
  })

  it('keeps paid controls only for a plan that includes them', () => {
    const mix = mixOf([placement('noise-pink', { tone: -0.5, variation: true })])
    expect(decodeShareUrl(shareUrl(mix, BASE), 'tier2000')?.mix.placements[0]).toMatchObject({ tone: -0.5, variation: true })
    const free = decodeShareUrl(shareUrl(mix, BASE), 'free')?.mix.placements[0]
    expect(free?.tone).toBeUndefined()
    expect(free?.variation).toBeUndefined()
  })

  it('leaves an unnamed mix untitled and replaces any query string', () => {
    const url = shareUrl(mixOf([placement('fan')], UNTITLED_MIX_NAME), `${BASE}?utm=x#old`)
    expect(url.startsWith(`${BASE}#mix=`)).toBe(true)
    expect(decodeShareUrl(url, 'free')?.mix.name).toBe(UNTITLED_MIX_NAME)
  })

  it('a maximal mix still encodes under the size limit', () => {
    const longName = '아주 긴 이름'.repeat(20)
    const placements = Array.from({ length: 40 }, () =>
      placement('singing-bowl', { locked: true, muted: true, tone: -0.123456, variation: true, angle: 6.2831 }),
    )
    expect(encodeMix(mixOf(placements, longName)).length).toBeLessThanOrEqual(MAX_SHARE_PARAM_LENGTH)
  })
})

describe('share link decoding rejects malformed input', () => {
  it.each([
    ['not a URL', 'not a url'],
    ['no mix param', BASE],
    ['empty param', `${BASE}#mix=`],
    ['invalid base64', `${BASE}#mix=%%%`],
    ['not JSON', linkFor('{nope')],
    ['invalid UTF-8', `${BASE}#mix=${Buffer.from([0x7b, 0xff, 0xfe, 0x7d]).toString('base64url')}`],
    ['JSON null', linkFor('null')],
    ['an array', linkFor([1, 2])],
    ['unknown version', linkFor({ v: 2, m: 1, p: [orb('noise-white')] })],
    ['missing version', linkFor({ m: 1, p: [orb('noise-white')] })],
    ['placements not an array', linkFor({ v: 1, m: 1, p: { 0: orb('noise-white') } })],
  ])('%s → null', (_label, url) => {
    expect(decodeShareUrl(url, 'tier10000')).toBeNull()
  })

  it('rejects an oversized param before decoding it', () => {
    const big = linkFor({ v: 1, m: 1, p: [orb('noise-white')], pad: 'x'.repeat(MAX_SHARE_PARAM_LENGTH) })
    expect(shareParam(big)!.length).toBeGreaterThan(MAX_SHARE_PARAM_LENGTH)
    expect(decodeShareUrl(big, 'tier10000')).toBeNull()
  })
})

describe('share link decoding sanitizes values', () => {
  it('drops unknown, malformed and not-yet-available sounds', () => {
    const decoded = decodeShareUrl(
      linkFor({ v: 1, m: 1, p: [orb('evil<script>'), orb('garden-rain'), { s: 42 }, null, 'x', orb('noise-white')] }),
      'tier10000',
    )
    expect(decoded?.mix.placements.map((p) => p.soundId)).toEqual(['noise-white'])
    expect(decoded?.lockedPlan).toBeNull()
  })

  it('returns null when nothing usable is left', () => {
    expect(decodeShareUrl(linkFor({ v: 1, m: 1, p: [orb('unknown-sound')] }), 'tier10000')).toBeNull()
  })

  it('clamps out-of-range numbers and replaces non-numbers with defaults', () => {
    const decoded = decodeShareUrl(
      linkFor(
        '{"v":1,"m":7,"n":"  x  ","p":[{"s":"noise-white","r":5,"a":-1,"v":"loud","o":{"m":"warp","sp":1e999,"d":7,"e":3,"t":"t","c":-1}}]}',
      ),
      'free',
    )
    expect(decoded?.mix.masterVolume).toBe(1)
    expect(decoded?.mix.name).toBe('x')
    const p = decoded!.mix.placements[0]
    expect(p.radius).toBe(1)
    expect(p.angle).toBeCloseTo(2 * Math.PI - 1)
    expect(p.volume).toBe(1)
    expect(p.orbit.mode).toBe('random')
    expect(p.orbit.speed).toBe(0) // Infinity isn't finite → default
    expect(p.orbit.direction).toBe(1)
    expect(p.orbit.shape).toEqual({ kind: 'ellipse', eccentricity: 0.95, tilt: 0 })
    expect(p.orbit.volumeCurve).toBeUndefined()
  })

  it('caps the orb count to the plan, and to a hard limit on unlimited plans', () => {
    const many = linkFor({ v: 1, m: 1, p: Array.from({ length: 30 }, () => orb('noise-white')) })
    expect(decodeShareUrl(many, 'free')?.mix.placements).toHaveLength(3)
    expect(decodeShareUrl(many, 'tier2000')?.mix.placements).toHaveLength(5)
    expect(decodeShareUrl(many, 'tier10000')?.mix.placements).toHaveLength(24)
  })
})

describe('share link and the receiver plan', () => {
  const link = linkFor({ v: 1, m: 1, p: [orb('heartbeat'), orb('noise-pink'), orb('birds')] })

  it('drops sounds the plan does not include and reports the highest plan needed', () => {
    const decoded = decodeShareUrl(link, 'free')
    expect(decoded?.mix.placements.map((p) => p.soundId)).toEqual(['noise-pink'])
    expect(decoded?.lockedPlan).toBe('tier10000')
  })

  it('reports the upsell even when every sound is locked', () => {
    const decoded = decodeShareUrl(linkFor({ v: 1, m: 1, p: [orb('heartbeat')] }), 'free')
    expect(decoded?.mix.placements).toEqual([])
    expect(decoded?.lockedPlan).toBe('tier2000')
  })

  it('keeps everything for a plan that includes it', () => {
    const decoded = decodeShareUrl(link, 'tier10000')
    expect(decoded?.mix.placements.map((p) => p.soundId)).toEqual(['heartbeat', 'noise-pink', 'birds'])
    expect(decoded?.lockedPlan).toBeNull()
  })

  it('counts locked sounds against nothing: the free cap applies to what is kept', () => {
    const decoded = decodeShareUrl(
      linkFor({ v: 1, m: 1, p: [orb('birds'), orb('noise-white'), orb('noise-pink'), orb('fan'), orb('campfire')] }),
      'free',
    )
    expect(decoded?.mix.placements.map((p) => p.soundId)).toEqual(['noise-white', 'noise-pink', 'fan'])
  })
})
