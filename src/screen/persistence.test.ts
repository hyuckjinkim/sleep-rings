import { beforeEach, describe, it, expect } from 'vitest'
import { loadDimMinutes, saveDimMinutes } from './persistence'

beforeEach(() => {
  localStorage.clear()
})

describe('screen-dim persistence', () => {
  it('round-trips a minutes value through localStorage with the schema version', () => {
    saveDimMinutes(10)

    const stored = JSON.parse(localStorage.getItem('so.screenDim')!)
    expect(stored.version).toBe(1)
    expect(stored.dimAfterMinutes).toBe(10)

    expect(loadDimMinutes()).toBe(10)
  })

  it('round-trips "off" (null)', () => {
    saveDimMinutes(null)
    expect(loadDimMinutes()).toBeNull()
  })

  it('falls back to off when nothing is stored', () => {
    expect(loadDimMinutes()).toBeNull()
  })

  it('falls back to off on corrupt JSON (fail-safe, never bricks the app)', () => {
    localStorage.setItem('so.screenDim', '{not valid json')
    expect(loadDimMinutes()).toBeNull()
  })

  it('falls back to off on a future/unknown schema version', () => {
    localStorage.setItem('so.screenDim', JSON.stringify({ version: 999, dimAfterMinutes: 5 }))
    expect(loadDimMinutes()).toBeNull()
  })

  it('falls back to off on an out-of-range minutes value', () => {
    localStorage.setItem('so.screenDim', JSON.stringify({ version: 1, dimAfterMinutes: 7 }))
    expect(loadDimMinutes()).toBeNull()
  })
})
