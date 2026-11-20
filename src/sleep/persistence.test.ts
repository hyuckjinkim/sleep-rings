import { beforeEach, describe, it, expect } from 'vitest'
import {
  DEFAULT_PLAYBACK_SETTINGS,
  NURSERY_VOLUME_CAP,
  loadMix,
  loadPlaybackSettings,
  loadPresets,
  restoreMix,
  saveMix,
  savePlaybackSettings,
  savePresets,
} from './persistence'
import { useMixStore, emptyMix } from '../mixer/store'
import type { Mix } from '../mixer/types'

beforeEach(() => {
  localStorage.clear()
  useMixStore.setState({ current: emptyMix(), presets: [] })
})

describe('mix persistence', () => {
  it('round-trips a mix through localStorage with the schema version', () => {
    const mix: Mix = { ...emptyMix(), name: 'my mix' }
    saveMix(mix)

    const stored = JSON.parse(localStorage.getItem('so.currentMix')!)
    expect(stored.version).toBe(1)
    expect(stored.mix.name).toBe('my mix')

    expect(loadMix()).toEqual(mix)
  })

  it('falls back to an empty mix when nothing is stored', () => {
    const loaded = loadMix()
    expect(loaded.placements).toEqual([])
  })

  it('falls back to an empty mix on corrupt JSON (fail-safe, never bricks the app)', () => {
    localStorage.setItem('so.currentMix', '{not valid json')
    const loaded = loadMix()
    expect(loaded.placements).toEqual([])
  })

  it('falls back to an empty mix on a future/unknown schema version', () => {
    localStorage.setItem('so.currentMix', JSON.stringify({ version: 999, mix: { id: 'x', placements: [] } }))
    const loaded = loadMix()
    expect(loaded.placements).toEqual([])
  })

  it('falls back to an empty mix when the stored shape is malformed', () => {
    localStorage.setItem('so.currentMix', JSON.stringify({ version: 1, mix: { not: 'a mix' } }))
    const loaded = loadMix()
    expect(loaded.placements).toEqual([])
  })
})

describe('preset persistence', () => {
  it('round-trips presets through localStorage', () => {
    const presets: Mix[] = [{ ...emptyMix(), name: 'preset 1' }]
    savePresets(presets)
    expect(loadPresets()).toEqual(presets)
  })

  it('falls back to an empty list on corrupt data', () => {
    localStorage.setItem('so.presets', '{not an array')
    expect(loadPresets()).toEqual([])
  })
})

describe('restoreMix', () => {
  it('populates the store from localStorage on boot', () => {
    const mix: Mix = { ...emptyMix(), name: 'restored mix' }
    saveMix(mix)
    savePresets([{ ...emptyMix(), name: 'preset 1' }])

    restoreMix()

    expect(useMixStore.getState().current.name).toBe('restored mix')
    expect(useMixStore.getState().presets).toHaveLength(1)
  })

  it('leaves an empty mix in place when nothing was ever saved', () => {
    restoreMix()
    expect(useMixStore.getState().current.placements).toEqual([])
  })
})

describe('playback settings persistence', () => {
  it('round-trips fade settings with the schema version', () => {
    savePlaybackSettings({ fadeInSec: 30, sleepFadeSec: 300, volumeCap: NURSERY_VOLUME_CAP })
    expect(JSON.parse(localStorage.getItem('so.playbackSettings')!).version).toBe(1)
    expect(loadPlaybackSettings()).toEqual({ fadeInSec: 30, sleepFadeSec: 300, volumeCap: NURSERY_VOLUME_CAP })
  })

  it('defaults to no start fade, a 60s sleep fade and no volume cap when nothing is stored', () => {
    expect(loadPlaybackSettings()).toEqual(DEFAULT_PLAYBACK_SETTINGS)
    expect(DEFAULT_PLAYBACK_SETTINGS).toEqual({ fadeInSec: 0, sleepFadeSec: 60, volumeCap: 1 })
  })

  it('replaces an out-of-list value with its default without dropping the other field', () => {
    localStorage.setItem('so.playbackSettings', JSON.stringify({ version: 1, fadeInSec: 7, sleepFadeSec: 600, volumeCap: 3 }))
    expect(loadPlaybackSettings()).toEqual({ fadeInSec: 0, sleepFadeSec: 600, volumeCap: 1 })
  })

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem('so.playbackSettings', '{nope')
    expect(loadPlaybackSettings()).toEqual(DEFAULT_PLAYBACK_SETTINGS)
  })
})
