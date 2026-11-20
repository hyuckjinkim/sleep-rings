// Mix share links: the current mix as a versioned base64url JSON in the URL fragment
// (`#mix=…` — never sent to a server). A share link is untrusted input, so decoding rebuilds every
// field from scratch: unknown versions are rejected, numbers clamped, sounds checked against the
// catalog and the receiver's plan, and the orb count capped. Nothing in here throws.
import type { Mix, OrbitMode, Placement } from './types'
import { catalog, isAvailable } from '../library/catalog'
import { canUseFeature, canUseSound, maxLayers, requiredPlan } from '../plan'
import { planRank } from '../plan/tiers'
import type { Plan } from '../plan'
import { UNTITLED_MIX_NAME } from './types'
import { clamp, normalizeAngle } from './geometry'

const SHARE_VERSION = 1
/** Longest `mix` param accepted (and produced). A full 24-orb mix encodes well under this. */
export const MAX_SHARE_PARAM_LENGTH = 6000
/** Hard orb cap on top of the plan's — the top tiers have no layer limit. */
const MAX_SHARED_PLACEMENTS = 24
const MAX_NAME_LENGTH = 60
const MAX_ORBIT_SPEED = 0.3 // OrbControls' slider cap
const MAX_ECCENTRICITY = 0.95 // geometry.polarToUnit's clamp
const ORBIT_MODES: OrbitMode[] = ['random', 'fixed', 'steered']
/** Public web app; native builds share this instead of their capacitor://localhost origin. */
export const PUBLIC_WEB_URL = 'https://sleep-rings.hyuckjin.workers.dev/'

// Wire format v1, short keys to keep links short.
interface SharedPlacement {
  s: string // soundId
  r: number // radius 0..1
  a: number // angle, rad
  v: number // volume 0..1
  o: { m: OrbitMode; sp: number; d: 1 | -1; e?: number; t?: number; c?: number; ph?: number }
  l?: 1 // locked
  mu?: 1 // muted
  tn?: number // tone -1..1
  x?: 1 // variation
}

interface SharedMix {
  v: number
  n?: string
  m: number
  p: SharedPlacement[]
}

const round = (n: number) => Math.round(n * 1000) / 1000

function toBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(param: string): string {
  const binary = atob(param.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

export function encodeMix(mix: Mix): string {
  const shared: SharedMix = {
    v: SHARE_VERSION,
    m: round(mix.masterVolume),
    p: mix.placements.slice(0, MAX_SHARED_PLACEMENTS).map((p) => {
      const { orbit } = p
      const out: SharedPlacement = {
        s: p.soundId,
        r: round(p.radius),
        a: round(p.angle),
        v: round(p.volume),
        o: { m: orbit.mode, sp: round(orbit.speed), d: orbit.direction },
      }
      if (orbit.shape.kind === 'ellipse') Object.assign(out.o, { e: round(orbit.shape.eccentricity), t: round(orbit.shape.tilt) })
      if (orbit.volumeCurve) Object.assign(out.o, { c: round(orbit.volumeCurve.depth), ph: round(orbit.volumeCurve.phase ?? 0) })
      if (p.locked) out.l = 1
      if (p.muted) out.mu = 1
      if (p.tone) out.tn = round(p.tone)
      if (p.variation) out.x = 1
      return out
    }),
  }
  if (mix.name !== UNTITLED_MIX_NAME) shared.n = mix.name.slice(0, MAX_NAME_LENGTH)
  return toBase64Url(JSON.stringify(shared))
}

/** Full share URL for a mix, on `base` (the current page on web, PUBLIC_WEB_URL on native). */
export function shareUrl(mix: Mix, base: string): string {
  const url = new URL(base)
  url.search = ''
  url.hash = `mix=${encodeMix(mix)}`
  return url.toString()
}

/** The raw `mix` fragment param of a URL, or null if it has none (or isn't a URL). */
export function shareParam(url: string): string | null {
  try {
    return new URLSearchParams(new URL(url).hash.slice(1)).get('mix')
  } catch {
    return null
  }
}

export interface DecodedShare {
  mix: Mix
  /** Highest plan among sounds left out because the receiver's plan doesn't include them. */
  lockedPlan: Exclude<Plan, 'free'> | null
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, min: number, max: number, fallback: number) => (isNum(v) ? clamp(v, min, max) : fallback)
const angle = (v: unknown) => (isNum(v) ? normalizeAngle(v) : 0)

let sharedSeq = 0

function decodePlacement(raw: unknown, plan: Plan): Placement | null {
  if (!isObj(raw) || typeof raw.s !== 'string') return null
  const o = isObj(raw.o) ? raw.o : {}
  const ecc = num(o.e, 0, MAX_ECCENTRICITY, 0)
  const tone = canUseFeature('tone', plan) ? num(raw.tn, -1, 1, 0) : 0
  sharedSeq += 1
  return {
    id: `p-shared-${Date.now()}-${sharedSeq}`,
    soundId: raw.s,
    radius: num(raw.r, 0, 1, 0.5),
    angle: angle(raw.a),
    volume: num(raw.v, 0, 1, 1),
    locked: raw.l === 1,
    muted: raw.mu === 1 ? true : undefined,
    tone: tone !== 0 ? tone : undefined,
    variation: raw.x === 1 && canUseFeature('variation', plan) ? true : undefined,
    orbit: {
      mode: ORBIT_MODES.includes(o.m as OrbitMode) ? (o.m as OrbitMode) : 'random',
      speed: num(o.sp, 0, MAX_ORBIT_SPEED, 0),
      direction: o.d === -1 ? -1 : 1,
      shape: ecc > 0 ? { kind: 'ellipse', eccentricity: ecc, tilt: angle(o.t) } : { kind: 'circle' },
      volumeCurve: isNum(o.c) && o.c > 0 ? { depth: clamp(o.c, 0, 1), phase: angle(o.ph) } : undefined,
    },
  }
}

/**
 * Decode a share URL into a playable mix for `plan`, or null when it carries no (valid) mix.
 * Sounds outside the catalog or not yet available are dropped silently; sounds the receiver's plan
 * doesn't include are dropped and reported via `lockedPlan`, so the UI can show the upsell (the
 * mix can then be empty — the caller keeps the current one instead of opening nothing).
 */
export function decodeShareUrl(url: string, plan: Plan): DecodedShare | null {
  const param = shareParam(url)
  if (!param || param.length > MAX_SHARE_PARAM_LENGTH) return null
  let raw: unknown
  try {
    raw = JSON.parse(fromBase64Url(param))
  } catch {
    return null
  }
  if (!isObj(raw) || raw.v !== SHARE_VERSION || !Array.isArray(raw.p)) return null

  let lockedPlan: Exclude<Plan, 'free'> | null = null
  const placements: Placement[] = []
  const limit = Math.min(maxLayers(plan), MAX_SHARED_PLACEMENTS)
  for (const item of raw.p) {
    if (placements.length >= limit) break
    const placement = decodePlacement(item, plan)
    // Catalog membership first: requiredPlan() maps unknown ids to 'free'.
    if (!placement || !catalog.some((s) => s.id === placement.soundId) || !isAvailable(placement.soundId)) continue
    if (!canUseSound(placement.soundId, plan)) {
      const needed = requiredPlan(placement.soundId) as Exclude<Plan, 'free'>
      if (!lockedPlan || planRank(needed) > planRank(lockedPlan)) lockedPlan = needed
      continue
    }
    placements.push(placement)
  }
  if (placements.length === 0 && !lockedPlan) return null

  const name = typeof raw.n === 'string' ? raw.n.trim().slice(0, MAX_NAME_LENGTH) : ''
  return {
    mix: {
      id: `mix-shared-${Date.now()}`,
      name: name || UNTITLED_MIX_NAME,
      placements,
      masterVolume: num(raw.m, 0, 1, 1),
      updatedAt: Date.now(),
    },
    lockedPlan,
  }
}
