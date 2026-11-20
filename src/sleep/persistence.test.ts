import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_PLAYBACK_SETTINGS,
  NURSERY_VOLUME_CAP,
  loadMix,
  loadPlaybackSettings,
  loadPresets,
  playLastMix,
  restoreMix,
  saveMix,
  savePlaybackSettings,
  savePresets,
} from './persistence'
import { useMixStore, emptyMix, defaultOrbit } from '../mixer/store'
import { soundEngine } from '../mixer/engine/instance'
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

describe('playLastMix (bedtime reminder, app shortcut, Siri)', () => {
  const placement = { id: 'p1', soundId: 'noise-white', radius: 0.3, angle: 0, orbit: defaultOrbit(), locked: false, volume: 1 }
  const saved: Mix = { ...emptyMix(), name: 'Last night', placements: [placement] }
  afterEach(() => {
    vi.restoreAllMocks()
    useMixStore.setState({ sleeping: false, bedtimeAt: null })
  })

  it('resumes the already-restored mix and reports it audible', async () => {
    saveMix(saved)
    restoreMix()
    const initSpy = vi.spyOn(soundEngine, 'init')
    await expect(playLastMix()).resolves.toBe(true)
    expect(initSpy).toHaveBeenCalled()
    expect(useMixStore.getState().current.name).toBe('Last night')
  })

  it('reloads the autosaved mix when the field is empty', async () => {
    saveMix(saved)
    await expect(playLastMix()).resolves.toBe(true)
    expect(useMixStore.getState().current.placements.map((p) => p.id)).toEqual(['p1'])
  })

  it('restarts a mix a finished sleep timer stopped', async () => {
    saveMix(saved)
    restoreMix()
    useMixStore.setState({ sleeping: true })
    await playLastMix()
    expect(useMixStore.getState().sleeping).toBe(false)
  })

  it('plays now instead of waiting for a pending bedtime start', async () => {
    saveMix(saved)
    restoreMix()
    useMixStore.setState({ bedtimeAt: Date.now() + 3600_000 })
    await playLastMix()
    expect(useMixStore.getState().bedtimeAt).toBeNull()
  })

  it('reports false when autoplay stays blocked, leaving the mix loaded for a tap', async () => {
    saveMix(saved)
    restoreMix()
    vi.spyOn(soundEngine, 'isRunning').mockReturnValue(false)
    await expect(playLastMix()).resolves.toBe(false)
    expect(useMixStore.getState().current.placements).toHaveLength(1)
  })

  it('reports false with nothing saved', async () => {
    await expect(playLastMix()).resolves.toBe(false)
  })
})
