import { describe, expect, it } from 'vitest'
import { isMixPlaying } from './playback-state'

const state = (orbs: number, patch: Partial<{ sleeping: boolean; alarmAt: number | null; bedtimeAt: number | null }> = {}) => ({
  current: { placements: Array.from({ length: orbs }, (_, i) => i) },
  sleeping: false,
  alarmAt: null,
  bedtimeAt: null,
  ...patch,
})

describe('isMixPlaying (keep-alive service)', () => {
  it('an empty field is not playing', () => {
    expect(isMixPlaying(state(0))).toBe(false)
  })

  it('orbs on the field are playing until a sleep timer finishes', () => {
    expect(isMixPlaying(state(2))).toBe(true)
    expect(isMixPlaying(state(2, { sleeping: true }))).toBe(false)
  })

  it('an armed alarm keeps it alive, even with no orbs or after the timer silenced the mix', () => {
    expect(isMixPlaying(state(0, { alarmAt: 1 }))).toBe(true)
    expect(isMixPlaying(state(2, { sleeping: true, alarmAt: 1 }))).toBe(true)
  })

  it('a pending bedtime start counts only with orbs for it to start', () => {
    expect(isMixPlaying(state(0, { bedtimeAt: 1 }))).toBe(false)
    expect(isMixPlaying(state(2, { sleeping: true, bedtimeAt: 1 }))).toBe(true)
  })
})
