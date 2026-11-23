import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { ALARM_FADE_SEC, defaultOrbit, enginePlacement, nextAlarmAt, useMixStore } from './store'
import { soundEngine } from './engine/instance'
import { catalog } from '../library/catalog'
import { usePlanStore } from '../plan'
import type { Sound } from './types'
import { ALARM_NOTIFICATION_ID, BEDTIME_NOTIFICATION_ID, cancelReminder } from '../mobile/notifications'
import { ALARM_ON_TIME_MS, NATIVE_ALARM_DELAY_MS, cancelNativeWakeAlarm } from '../mobile/wakeAlarm'

vi.mock('../mobile/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mobile/notifications')>()),
  cancelReminder: vi.fn(),
}))
vi.mock('../mobile/wakeAlarm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mobile/wakeAlarm')>()),
  cancelNativeWakeAlarm: vi.fn(),
}))

beforeEach(() => {
  useMixStore.setState({
    current: { ...useMixStore.getState().current, placements: [] },
    loadingIds: new Set(),
    erroredIds: new Set(),
    presets: [],
    sleepEndsAt: null,
    sleeping: false,
    lastRemoved: null,
    lastRemovedAll: null,
    layerLimitNotice: null,
  })
  usePlanStore.setState({ plan: 'free' })
})

describe('useMixStore', () => {
  it('adds a placement with the given radius/angle and default orbit/lock state', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    const placements = useMixStore.getState().current.placements
    expect(placements).toHaveLength(1)
    expect(placements[0]).toMatchObject({ id, soundId: 'pink-noise', radius: 0.4, angle: 1.2, locked: false })
    expect(placements[0].orbit.mode).toBe('random')
  })

  it('supports unlimited layering (multiple placements coexist)', () => {
    useMixStore.getState().addPlacement('pink-noise', 0.2, 0)
    useMixStore.getState().addPlacement('white-noise', 0.6, 2)
    useMixStore.getState().addPlacement('garden-rain', 0.9, 4)
    expect(useMixStore.getState().current.placements).toHaveLength(3)
  })

  it('moves a placement by patching radius/angle', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().updatePlacement(id, { radius: 0.1, angle: 3 })
    const p = useMixStore.getState().current.placements.find((p) => p.id === id)
    expect(p).toMatchObject({ radius: 0.1, angle: 3 })
  })

  it('merges partial orbit patches instead of replacing the whole orbit', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().updatePlacement(id, { orbit: { direction: -1 } })
    const p = useMixStore.getState().current.placements.find((p) => p.id === id)
    expect(p?.orbit.direction).toBe(-1)
    expect(p?.orbit.mode).toBe('random') // untouched field preserved
  })

  it('toggles locked state', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    expect(useMixStore.getState().current.placements[0].locked).toBe(false)
    useMixStore.getState().toggleLocked(id)
    expect(useMixStore.getState().current.placements.find((p) => p.id === id)?.locked).toBe(true)
    useMixStore.getState().toggleLocked(id)
    expect(useMixStore.getState().current.placements.find((p) => p.id === id)?.locked).toBe(false)
  })

  it('removes a placement', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().removePlacement(id)
    expect(useMixStore.getState().current.placements).toHaveLength(0)
  })

  it('fades out instead of hard-stopping on remove (M2)', () => {
    const id = useMixStore.getState().addPlacement('noise-white', 0.4, 1.2)
    const stopSpy = vi.spyOn(soundEngine, 'stop')
    useMixStore.getState().removePlacement(id)
    expect(stopSpy).toHaveBeenCalledWith(id, expect.any(Number))
    expect(stopSpy.mock.calls[0][1]).toBeGreaterThan(0)
    stopSpy.mockRestore()
  })

  it('adding a placement clears the sleeping flag (B17 regression)', () => {
    useMixStore.setState({ sleeping: true })
    useMixStore.getState().addPlacement('noise-white', 0.4, 1.2)
    expect(useMixStore.getState().sleeping).toBe(false)
  })

  it('sets the master volume, clamped, and forwards it to the engine', () => {
    const setVolumeSpy = vi.spyOn(soundEngine, 'setMasterVolume')
    useMixStore.getState().setMasterVolume(0.5)
    expect(useMixStore.getState().current.masterVolume).toBe(0.5)
    expect(setVolumeSpy).toHaveBeenCalledWith(0.5)

    useMixStore.getState().setMasterVolume(5) // out of range, must clamp
    expect(useMixStore.getState().current.masterVolume).toBe(1)
    setVolumeSpy.mockRestore()
  })
})

describe('undo (B7)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores the most recently removed placement', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().removePlacement(id)
    expect(useMixStore.getState().current.placements).toHaveLength(0)
    expect(useMixStore.getState().lastRemoved).toMatchObject({ id, soundId: 'pink-noise' })

    useMixStore.getState().restoreLastRemoved()
    expect(useMixStore.getState().current.placements).toMatchObject([{ id, soundId: 'pink-noise' }])
    expect(useMixStore.getState().lastRemoved).toBeNull()
  })

  it('only keeps a single slot — removing a second placement drops the first from the undo buffer', () => {
    const idA = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    const idB = useMixStore.getState().addPlacement('noise-white', 0.2, 0.5)
    useMixStore.getState().removePlacement(idA)
    useMixStore.getState().removePlacement(idB)

    expect(useMixStore.getState().lastRemoved?.id).toBe(idB)
    useMixStore.getState().restoreLastRemoved()
    expect(useMixStore.getState().current.placements.map((p) => p.id)).toEqual([idB])
  })

  it('expires the undo buffer after the timeout', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().removePlacement(id)
    vi.advanceTimersByTime(5000)

    expect(useMixStore.getState().lastRemoved).toBeNull()
    useMixStore.getState().restoreLastRemoved() // no-op once expired
    expect(useMixStore.getState().current.placements).toHaveLength(0)
  })
})

describe('clear all', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes every placement and restores them all on undo', () => {
    const idA = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    const idB = useMixStore.getState().addPlacement('noise-white', 0.2, 0.5)
    useMixStore.getState().clearAll()

    expect(useMixStore.getState().current.placements).toHaveLength(0)
    expect(useMixStore.getState().lastRemovedAll).toHaveLength(2)

    useMixStore.getState().restoreLastRemovedAll()
    expect(useMixStore.getState().current.placements.map((p) => p.id).sort()).toEqual([idA, idB].sort())
    expect(useMixStore.getState().lastRemovedAll).toBeNull()
  })

  it('is a no-op on an empty field', () => {
    useMixStore.getState().clearAll()
    expect(useMixStore.getState().lastRemovedAll).toBeNull()
  })

  it('supersedes a pending single-delete undo', () => {
    const id = useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().removePlacement(id)
    expect(useMixStore.getState().lastRemoved).not.toBeNull()

    useMixStore.getState().addPlacement('noise-white', 0.2, 0.5)
    useMixStore.getState().clearAll()
    expect(useMixStore.getState().lastRemoved).toBeNull()
  })

  it('expires the undo buffer after the timeout', () => {
    useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().clearAll()
    vi.advanceTimersByTime(5000)

    expect(useMixStore.getState().lastRemovedAll).toBeNull()
    useMixStore.getState().restoreLastRemovedAll() // no-op once expired
    expect(useMixStore.getState().current.placements).toHaveLength(0)
  })
})

describe('load/play race (H1 regression)', () => {
  it('does not play a placement that was removed while its sound was still loading', async () => {
    let resolveLoad!: () => void
    const loadSpy = vi.spyOn(soundEngine, 'load').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = () => resolve()
        }),
    )
    const playSpy = vi.spyOn(soundEngine, 'play')

    const id = useMixStore.getState().addPlacement('noise-white', 0.3, 0) // synth, available
    useMixStore.getState().removePlacement(id) // removed before load() resolves

    resolveLoad()
    await Promise.resolve()
    await Promise.resolve()

    expect(playSpy).not.toHaveBeenCalled()

    loadSpy.mockRestore()
    playSpy.mockRestore()
  })
})

describe('load failure (M1 regression)', () => {
  const FAILING_FILE_SOUND: Sound = {
    id: 'test-file-that-fails',
    name: { ko: '테스트', en: 'Test' },
    category: 'rain',
    source: { kind: 'file', src: 'sounds/does-not-exist.m4a' },
    license: { spdx: 'CC0-1.0', sourceName: 'test' },
  }

  beforeEach(() => {
    catalog.push(FAILING_FILE_SOUND)
  })
  afterEach(() => {
    const i = catalog.indexOf(FAILING_FILE_SOUND)
    if (i >= 0) catalog.splice(i, 1)
  })

  it('clears loadingIds and marks the placement errored instead of leaving it stuck loading', async () => {
    const loadSpy = vi.spyOn(soundEngine, 'load').mockRejectedValue(new Error('404'))

    const id = useMixStore.getState().addPlacement(FAILING_FILE_SOUND.id, 0.3, 0)
    expect(useMixStore.getState().loadingIds.has(id)).toBe(true)

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(useMixStore.getState().loadingIds.has(id)).toBe(false)
    expect(useMixStore.getState().erroredIds.has(id)).toBe(true)

    loadSpy.mockRestore()
  })
})

describe('presets', () => {
  it('saves the current mix as a named preset, loads it back, and can delete it', () => {
    useMixStore.getState().addPlacement('pink-noise', 0.4, 1.2)
    useMixStore.getState().savePreset('night routine')
    expect(useMixStore.getState().presets).toHaveLength(1)
    expect(useMixStore.getState().presets[0].name).toBe('night routine')

    useMixStore.getState().updatePlacement(useMixStore.getState().current.placements[0].id, { radius: 0.9 })
    const presetId = useMixStore.getState().presets[0].id
    useMixStore.getState().loadPreset(presetId)
    expect(useMixStore.getState().current.placements[0].radius).toBe(0.4) // restored from the saved preset, not the later edit

    useMixStore.getState().deletePreset(presetId)
    expect(useMixStore.getState().presets).toHaveLength(0)
  })

  it('openMix replaces the mix and applies its master volume to the engine', () => {
    const volumeSpy = vi.spyOn(soundEngine, 'setMasterVolume')
    useMixStore.getState().addPlacement('noise-white', 0.2, 0)
    const placement = { ...useMixStore.getState().current.placements[0], id: 'shared-1', soundId: 'fan' }
    useMixStore.getState().openMix({ id: 'x', name: 'Shared', placements: [placement], masterVolume: 0.4, updatedAt: 0 })
    const { current } = useMixStore.getState()
    expect(current.name).toBe('Shared')
    expect(current.placements.map((p) => p.soundId)).toEqual(['fan'])
    expect(volumeSpy).toHaveBeenCalledWith(0.4)
    volumeSpy.mockRestore()
  })

  it('loadPreset is a no-op for an unknown id', () => {
    const before = useMixStore.getState().current
    useMixStore.getState().loadPreset('does-not-exist')
    expect(useMixStore.getState().current).toBe(before)
  })
})

describe('sleep timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets a countdown target and flips to sleeping once the duration elapses', () => {
    useMixStore.getState().startSleepTimer(15)
    expect(useMixStore.getState().sleepEndsAt).not.toBeNull()
    expect(useMixStore.getState().sleeping).toBe(false)

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(true)
    expect(useMixStore.getState().sleepEndsAt).toBeNull()
  })

  it('cancelSleepTimer clears the countdown and prevents the scheduled sleep', () => {
    useMixStore.getState().startSleepTimer(15)
    useMixStore.getState().cancelSleepTimer()
    expect(useMixStore.getState().sleepEndsAt).toBeNull()
    expect(useMixStore.getState().sleeping).toBe(false)

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(false) // never fires after cancel
  })

  it('starting a new timer replaces a pending one instead of stacking', () => {
    useMixStore.getState().startSleepTimer(15)
    useMixStore.getState().startSleepTimer(30)

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(false) // the first (15m) timer was superseded

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(true) // the second (30m) timer fires
  })

  it('re-engaging after the timer completes resumes the (suspended) engine (MEDIUM-2 regression)', () => {
    useMixStore.getState().startSleepTimer(15)
    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(true)

    const resumeSpy = vi.spyOn(soundEngine, 'onEnterForeground')
    useMixStore.getState().addPlacement('noise-white', 0.3, 0)
    expect(resumeSpy).toHaveBeenCalled()

    resumeSpy.mockRestore()
  })
})

describe('after the sleep timer finishes (engine stopped every source)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function finishTimerWithTwoOrbs() {
    useMixStore.getState().addPlacement('noise-white', 0.3, 0)
    useMixStore.getState().addPlacement('noise-pink', 0.5, 1)
    useMixStore.getState().startSleepTimer(15)
    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useMixStore.getState().sleeping).toBe(true)
    await vi.advanceTimersByTimeAsync(0) // flush the pending load().then(play) from the adds
    return vi.spyOn(soundEngine, 'play')
  }

  it('"Off" restarts every orb, so "not sleeping" really means audible', async () => {
    const playSpy = await finishTimerWithTwoOrbs()
    useMixStore.getState().cancelSleepTimer()
    await vi.advanceTimersByTimeAsync(0)
    expect(useMixStore.getState().sleeping).toBe(false)
    expect(playSpy.mock.calls.map(([p]) => p.soundId).sort()).toEqual(['noise-pink', 'noise-white'])
  })

  it('adding an orb brings the stopped ones back too, not just the new one', async () => {
    const playSpy = await finishTimerWithTwoOrbs()
    useMixStore.getState().addPlacement('noise-brown', 0.4, 2)
    await vi.advanceTimersByTimeAsync(0)
    expect(playSpy.mock.calls.map(([p]) => p.soundId).sort()).toEqual(['noise-brown', 'noise-pink', 'noise-white'])
  })

  it('starting a new timer restarts them as well', async () => {
    const playSpy = await finishTimerWithTwoOrbs()
    useMixStore.getState().startSleepTimer(30)
    await vi.advanceTimersByTimeAsync(0)
    expect(playSpy).toHaveBeenCalledTimes(2)
  })

  it('wake() does nothing while not sleeping', async () => {
    const playSpy = vi.spyOn(soundEngine, 'play')
    useMixStore.getState().wake()
    await vi.advanceTimersByTimeAsync(0)
    expect(playSpy).not.toHaveBeenCalled()
  })
})

describe('wake alarm', () => {
  const T0 = new Date('2026-01-01T23:00:00').getTime()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    useMixStore.setState({ alarmAt: null, alarmRinging: false })
  })
  afterEach(() => {
    useMixStore.getState().dismissAlarm()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('nextAlarmAt() picks today when the time is still ahead, tomorrow otherwise', () => {
    const now = new Date('2026-01-01T23:00:00')
    expect(new Date(nextAlarmAt('23:30', now)).toString()).toBe(new Date('2026-01-01T23:30:00').toString())
    expect(new Date(nextAlarmAt('07:00', now)).toString()).toBe(new Date('2026-01-02T07:00:00').toString())
    expect(new Date(nextAlarmAt('23:00', now)).toString()).toBe(new Date('2026-01-02T23:00:00').toString())
  })

  it('arms on the free plan with the free wake sound, scheduling it on the engine', async () => {
    const scheduleSpy = vi.spyOn(soundEngine, 'scheduleAlarm')
    useMixStore.getState().armAlarm(T0 + 8 * 3600_000, 'nature-brook')
    expect(useMixStore.getState().alarmAt).toBe(T0 + 8 * 3600_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(scheduleSpy).toHaveBeenCalledWith('nature-brook', T0 + 8 * 3600_000, ALARM_FADE_SEC)
  })

  it('refuses a wake sound the plan does not include (alarm-sound variety is paid)', () => {
    useMixStore.getState().armAlarm(T0 + 3600_000, 'birds')
    expect(useMixStore.getState().alarmAt).toBeNull()
  })

  it('rings at the alarm time, superseding a sleep timer that has not finished', () => {
    useMixStore.getState().startSleepTimer(120)
    useMixStore.getState().armAlarm(T0 + 3600_000, 'nature-brook')
    vi.advanceTimersByTime(3600_000)
    expect(useMixStore.getState()).toMatchObject({ alarmRinging: true, sleeping: true, sleepEndsAt: null })
    vi.advanceTimersByTime(3600_000)
    expect(useMixStore.getState().alarmRinging).toBe(true) // the old timer never fired over it
  })

  it('dismissAlarm() stops it on the engine and clears the state', () => {
    const cancelSpy = vi.spyOn(soundEngine, 'cancelAlarm')
    useMixStore.getState().armAlarm(T0 + 1000, 'nature-brook')
    vi.advanceTimersByTime(1000)
    useMixStore.getState().dismissAlarm()
    expect(cancelSpy).toHaveBeenCalled()
    expect(useMixStore.getState()).toMatchObject({ alarmAt: null, alarmRinging: false })
  })

  it('cancelling an alarm the audio clock already started (UI timer not yet fired) marks the mix stopped', () => {
    useMixStore.getState().addPlacement('noise-white', 0.3, 0)
    useMixStore.getState().armAlarm(T0 + 60_000, 'nature-brook')
    vi.spyOn(soundEngine, 'cancelAlarm').mockReturnValue(true)
    useMixStore.getState().dismissAlarm()
    expect(useMixStore.getState()).toMatchObject({ sleeping: true, alarmAt: null, alarmRinging: false })
  })

  it('drops the backup notification when the in-app alarm rings, or when dismissed', () => {
    useMixStore.getState().armAlarm(T0 + 1000, 'nature-brook')
    vi.mocked(cancelReminder).mockClear()
    vi.advanceTimersByTime(1000)
    expect(cancelReminder).toHaveBeenCalledWith(ALARM_NOTIFICATION_ID)
    vi.mocked(cancelReminder).mockClear()
    useMixStore.getState().dismissAlarm()
    expect(cancelReminder).toHaveBeenCalledWith(ALARM_NOTIFICATION_ID)
  })

  it('keeps the native alarm in sync: re-arm and dismiss cancel it', () => {
    vi.mocked(cancelNativeWakeAlarm).mockClear()
    useMixStore.getState().armAlarm(T0 + 60_000, 'nature-brook')
    expect(cancelNativeWakeAlarm).toHaveBeenCalledTimes(1) // a re-arm drops the previous one first
    useMixStore.getState().dismissAlarm() // cancel / stop share this path
    expect(cancelNativeWakeAlarm).toHaveBeenCalledTimes(2)
  })

  it('an on-time in-app alarm cancels the native one; a late one leaves it to ring', () => {
    useMixStore.getState().armAlarm(T0 + 1000, 'nature-brook')
    vi.mocked(cancelNativeWakeAlarm).mockClear()
    vi.advanceTimersByTime(1000)
    expect(cancelNativeWakeAlarm).toHaveBeenCalledTimes(1)

    useMixStore.getState().armAlarm(T0 + 2000, 'nature-brook')
    vi.mocked(cancelNativeWakeAlarm).mockClear()
    vi.setSystemTime(Date.now() + NATIVE_ALARM_DELAY_MS) // the app was frozen: wall clock moved, timers didn't
    vi.advanceTimersByTime(1000)
    expect(useMixStore.getState().alarmRinging).toBe(true)
    expect(cancelNativeWakeAlarm).not.toHaveBeenCalled()
  })

  it('an on-time timer keeps both backups while the in-app alarm is not audible (two alarms, never none)', () => {
    useMixStore.getState().armAlarm(T0 + 1000, 'nature-brook')
    vi.spyOn(soundEngine, 'isAlarmSounding').mockReturnValue(false) // e.g. context still suspended
    vi.mocked(cancelReminder).mockClear()
    vi.mocked(cancelNativeWakeAlarm).mockClear()
    vi.advanceTimersByTime(1000)
    expect(useMixStore.getState().alarmRinging).toBe(true)
    expect(cancelReminder).not.toHaveBeenCalledWith(ALARM_NOTIFICATION_ID)
    expect(cancelNativeWakeAlarm).not.toHaveBeenCalled()
  })

  it('an alarm that is not audible yet leaves the mix and its sleep timer alone (Stop then keeps it playing)', () => {
    useMixStore.getState().addPlacement('noise-white', 0.3, 0)
    useMixStore.getState().startSleepTimer(120)
    const sleepEndsAt = useMixStore.getState().sleepEndsAt
    useMixStore.getState().armAlarm(T0 + 1000, 'nature-brook')
    vi.spyOn(soundEngine, 'isAlarmSounding').mockReturnValue(false) // e.g. context still suspended
    vi.advanceTimersByTime(1000)
    expect(useMixStore.getState()).toMatchObject({ alarmRinging: true, sleeping: false, sleepEndsAt })
    useMixStore.getState().dismissAlarm() // the audio clock never got there: cancelAlarm() reports false
    expect(useMixStore.getState()).toMatchObject({ alarmRinging: false, sleeping: false })
  })

  it('asks the engine with the shared on-time slack (half the native delay)', () => {
    const sounding = vi.spyOn(soundEngine, 'isAlarmSounding')
    useMixStore.getState().armAlarm(T0 + 1000, 'nature-brook')
    vi.advanceTimersByTime(1000)
    expect(sounding).toHaveBeenCalledWith(ALARM_ON_TIME_MS / 1000)
    expect(ALARM_ON_TIME_MS).toBe(NATIVE_ALARM_DELAY_MS / 2)
  })

  it('a restored alarm (boot) keeps the native alarm set before the relaunch', () => {
    vi.mocked(cancelNativeWakeAlarm).mockClear()
    useMixStore.getState().armAlarm(T0 + 60_000, 'nature-brook', true)
    expect(useMixStore.getState()).toMatchObject({ alarmAt: T0 + 60_000, alarmSound: 'nature-brook' })
    expect(cancelNativeWakeAlarm).not.toHaveBeenCalled()
  })

  it('loading a mix while the alarm rings dismisses it first, so the new mix is not torn down', () => {
    useMixStore.getState().armAlarm(T0 + 1000, 'nature-brook')
    vi.advanceTimersByTime(1000)
    const cancelSpy = vi.spyOn(soundEngine, 'cancelAlarm')
    const placement = { id: 'p1', soundId: 'noise-white', radius: 0.3, angle: 0, orbit: defaultOrbit(), locked: false, volume: 1 }
    useMixStore.getState().openMix({ ...useMixStore.getState().current, placements: [placement] })
    expect(cancelSpy).toHaveBeenCalled()
    vi.advanceTimersByTime((ALARM_FADE_SEC + 1) * 1000) // past the crossfade the alarm would have ended it at
    expect(useMixStore.getState().current.placements.map((p) => p.id)).toEqual(['p1'])
    expect(useMixStore.getState()).toMatchObject({ alarmAt: null, alarmRinging: false, sleeping: false })
  })

  it('undoing a removal (single or clear-all) while the alarm rings dismisses it too', () => {
    const id = useMixStore.getState().addPlacement('noise-white', 0.3, 0)
    useMixStore.getState().removePlacement(id)
    useMixStore.getState().armAlarm(T0 + 1000, 'nature-brook')
    vi.advanceTimersByTime(1000)
    useMixStore.getState().restoreLastRemoved()
    expect(useMixStore.getState()).toMatchObject({ alarmAt: null, alarmRinging: false, sleeping: false })

    useMixStore.getState().clearAll()
    useMixStore.getState().armAlarm(T0 + 2000, 'nature-brook')
    vi.advanceTimersByTime(1000)
    useMixStore.getState().restoreLastRemovedAll()
    expect(useMixStore.getState()).toMatchObject({ alarmAt: null, alarmRinging: false, sleeping: false })
  })

  it('touching the mix while it rings (wake) stops the alarm too', () => {
    useMixStore.getState().armAlarm(T0 + 1000, 'nature-brook')
    vi.advanceTimersByTime(1000)
    useMixStore.getState().cancelSleepTimer()
    expect(useMixStore.getState()).toMatchObject({ alarmAt: null, alarmRinging: false, sleeping: false })
  })
})

describe('bedtime start', () => {
  const T0 = new Date('2026-01-01T22:00:00').getTime()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    useMixStore.setState({ bedtimeAt: null })
  })
  afterEach(() => {
    useMixStore.getState().cancelBedtime()
    useMixStore.getState().cancelSleepTimer()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('holds the mix on the engine until the start time, then clears the armed state', () => {
    const scheduleSpy = vi.spyOn(soundEngine, 'scheduleStart')
    useMixStore.getState().addPlacement('noise-white', 0.3, 0)
    useMixStore.getState().armBedtime(T0 + 3600_000)
    expect(scheduleSpy).toHaveBeenCalledWith(T0 + 3600_000)
    expect(useMixStore.getState().bedtimeAt).toBe(T0 + 3600_000)
    vi.advanceTimersByTime(3600_000)
    expect(useMixStore.getState().bedtimeAt).toBeNull()
  })

  it('cancelBedtime() un-holds the mix on the engine', () => {
    const cancelSpy = vi.spyOn(soundEngine, 'cancelStart')
    useMixStore.getState().armBedtime(T0 + 3600_000)
    useMixStore.getState().cancelBedtime()
    expect(cancelSpy).toHaveBeenCalled()
    expect(useMixStore.getState().bedtimeAt).toBeNull()
  })

  it('drops the backup notification when the start happens in-app, or is cancelled', () => {
    useMixStore.getState().armBedtime(T0 + 3600_000)
    vi.mocked(cancelReminder).mockClear()
    vi.advanceTimersByTime(3600_000)
    expect(cancelReminder).toHaveBeenCalledWith(BEDTIME_NOTIFICATION_ID)
    useMixStore.getState().armBedtime(T0 + 7200_000)
    vi.mocked(cancelReminder).mockClear()
    useMixStore.getState().cancelBedtime()
    expect(cancelReminder).toHaveBeenCalledWith(BEDTIME_NOTIFICATION_ID)
  })

  it('arming restarts a mix a finished sleep timer had stopped (held silent)', async () => {
    useMixStore.getState().addPlacement('noise-white', 0.3, 0)
    useMixStore.getState().startSleepTimer(1)
    vi.advanceTimersByTime(60_000)
    expect(useMixStore.getState().sleeping).toBe(true)
    const scheduleSpy = vi.spyOn(soundEngine, 'scheduleStart')
    const playSpy = vi.spyOn(soundEngine, 'play')
    useMixStore.getState().armBedtime(T0 + 3600_000)
    expect(useMixStore.getState().sleeping).toBe(false)
    await vi.advanceTimersByTimeAsync(0) // synth load() resolves, then play()
    expect(playSpy).toHaveBeenCalled()
    expect(scheduleSpy.mock.invocationCallOrder[0]).toBeLessThan(playSpy.mock.invocationCallOrder[0])
  })

  it('arming drops a running sleep timer, which would otherwise end the mix before it starts', () => {
    const cancelSleepSpy = vi.spyOn(soundEngine, 'cancelSleep')
    useMixStore.getState().startSleepTimer(30)
    useMixStore.getState().armBedtime(T0 + 3600_000)
    expect(cancelSleepSpy).toHaveBeenCalled()
    expect(useMixStore.getState().sleepEndsAt).toBeNull()
  })

  it('cancelling the start takes the remaining wait back off a timer set while armed', () => {
    const sleepSpy = vi.spyOn(soundEngine, 'scheduleSleep')
    useMixStore.getState().armBedtime(T0 + 3600_000)
    useMixStore.getState().startSleepTimer(30, 60)
    vi.advanceTimersByTime(600_000) // 10 of the 60 minutes' wait have passed
    useMixStore.getState().cancelBedtime()
    expect(sleepSpy).toHaveBeenLastCalledWith(1800, 60) // 30 minutes from now, same fade
    expect(useMixStore.getState().sleepEndsAt).toBe(T0 + 600_000 + 1800_000)
    vi.advanceTimersByTime(1800_000)
    expect(useMixStore.getState().sleeping).toBe(true)
  })

  it('a sleep timer set while armed counts from the start time', () => {
    const sleepSpy = vi.spyOn(soundEngine, 'scheduleSleep')
    useMixStore.getState().armBedtime(T0 + 3600_000)
    useMixStore.getState().startSleepTimer(30, 60)
    expect(sleepSpy).toHaveBeenLastCalledWith(3600 + 1800, 60)
    expect(useMixStore.getState().sleepEndsAt).toBe(T0 + 3600_000 + 1800_000)
  })
})

describe('paid per-sound controls reach the engine only on a plan that includes them', () => {
  const base = {
    id: 'p',
    soundId: 'noise-pink',
    radius: 0.5,
    angle: 0,
    orbit: { mode: 'fixed' as const, shape: { kind: 'circle' as const }, speed: 0, direction: 1 as const },
    locked: false,
    volume: 1,
    tone: -0.5,
  }

  it('free (or a lapsed subscription): tone is dropped, the rest untouched', () => {
    usePlanStore.setState({ plan: 'free' })
    expect(enginePlacement(base)).toEqual({ ...base, tone: undefined })
  })

  it('free: variation is dropped as well', () => {
    usePlanStore.setState({ plan: 'free' })
    expect(enginePlacement({ ...base, tone: undefined, variation: true }).variation).toBeUndefined()
  })

  it('lowest paid tier and above: passed through as-is', () => {
    usePlanStore.setState({ plan: 'tier2000' })
    expect(enginePlacement(base)).toBe(base)
  })

  it('updatePlacement on free never hands the engine a tone', () => {
    const setSpy = vi.spyOn(soundEngine, 'setPlacement')
    const id = useMixStore.getState().addPlacement('noise-pink', 0.4, 0)
    useMixStore.getState().updatePlacement(id, { tone: 0.8 })
    expect(setSpy.mock.lastCall?.[0].tone).toBeUndefined()
    setSpy.mockRestore()
  })
})

describe('B2: plan gate', () => {
  it('startPlayback (via addPlacement) refuses a sound the current plan does not allow', () => {
    const playSpy = vi.spyOn(soundEngine, 'play')
    // 'heartbeat' requires tier2000; default plan here is 'free' (see beforeEach).
    useMixStore.getState().addPlacement('heartbeat', 0.3, 0)
    expect(playSpy).not.toHaveBeenCalled()
    playSpy.mockRestore()
  })

  it('allows the sound once the plan is upgraded', async () => {
    usePlanStore.getState().setPlan('tier2000')
    const playSpy = vi.spyOn(soundEngine, 'play')
    useMixStore.getState().addPlacement('heartbeat', 0.3, 0)
    await Promise.resolve()
    await Promise.resolve()
    expect(playSpy).toHaveBeenCalled()
    playSpy.mockRestore()
  })
})

describe('B2: layer cap', () => {
  it('free plan (max 3): a 4th placement replaces the oldest unlocked one instead of stacking', () => {
    const idA = useMixStore.getState().addPlacement('noise-white', 0.1, 0)
    useMixStore.getState().addPlacement('noise-pink', 0.2, 1)
    useMixStore.getState().addPlacement('noise-brown', 0.3, 2)
    expect(useMixStore.getState().current.placements).toHaveLength(3)

    const idD = useMixStore.getState().addPlacement('noise-green', 0.4, 3)
    const placements = useMixStore.getState().current.placements
    expect(placements).toHaveLength(3) // still capped, not 4
    expect(placements.some((p) => p.id === idA)).toBe(false) // oldest was replaced
    expect(placements.some((p) => p.id === idD)).toBe(true) // new one made it in
    expect(useMixStore.getState().layerLimitNotice).toMatchObject({ soundId: 'noise-green', outcome: 'replaced' })
  })

  it('skips locked orbs when choosing what to replace', () => {
    const idA = useMixStore.getState().addPlacement('noise-white', 0.1, 0)
    useMixStore.getState().toggleLocked(idA) // lock the oldest — it must survive
    useMixStore.getState().addPlacement('noise-pink', 0.2, 1)
    useMixStore.getState().addPlacement('noise-brown', 0.3, 2)

    useMixStore.getState().addPlacement('noise-green', 0.4, 3)
    const ids = useMixStore.getState().current.placements.map((p) => p.id)
    expect(ids).toContain(idA) // locked orb untouched
  })

  it('when every orb is locked, the new sound is not placed and the notice says so', () => {
    const idA = useMixStore.getState().addPlacement('noise-white', 0.1, 0)
    const idB = useMixStore.getState().addPlacement('noise-pink', 0.2, 1)
    const idC = useMixStore.getState().addPlacement('noise-brown', 0.3, 2)
    for (const id of [idA, idB, idC]) useMixStore.getState().toggleLocked(id)

    const result = useMixStore.getState().addPlacement('noise-green', 0.4, 3)
    expect(result).toBe('')
    expect(useMixStore.getState().current.placements).toHaveLength(3)
    expect(useMixStore.getState().layerLimitNotice).toMatchObject({ soundId: 'noise-green', outcome: 'blocked' })
  })

  it('a higher plan raises the cap', () => {
    usePlanStore.getState().setPlan('tier2000') // max 5
    for (let i = 0; i < 5; i++) useMixStore.getState().addPlacement('noise-white', 0.1 * i, i)
    expect(useMixStore.getState().current.placements).toHaveLength(5)
  })
})

describe('B2: preset slot cap', () => {
  it('free plan (max 3): a 4th save replaces the oldest preset instead of refusing', () => {
    useMixStore.getState().addPlacement('noise-white', 0.1, 0)
    useMixStore.getState().savePreset('one')
    useMixStore.getState().savePreset('two')
    useMixStore.getState().savePreset('three')
    expect(useMixStore.getState().presets.map((p) => p.name)).toEqual(['one', 'two', 'three'])

    useMixStore.getState().savePreset('four')
    expect(useMixStore.getState().presets).toHaveLength(3) // still capped
    expect(useMixStore.getState().presets.map((p) => p.name)).toEqual(['two', 'three', 'four'])
  })
})
