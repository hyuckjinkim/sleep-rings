import { beforeEach, describe, expect, it, vi } from 'vitest'

const startService = vi.fn().mockResolvedValue(undefined)
const stopService = vi.fn().mockResolvedValue(undefined)
vi.mock('./foregroundService', () => ({
  startAndroidKeepAliveService: startService,
  stopAndroidKeepAliveService: stopService,
}))

let appStateListener: ((s: { isActive: boolean }) => void) | undefined
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((_event: string, cb: (s: { isActive: boolean }) => void) => {
      appStateListener = cb
      return Promise.resolve({ remove: vi.fn() })
    }),
  },
}))

const TEXT = { title: 'SleepRings', body: 'b', channelName: 'c', channelDescription: 'd' }

beforeEach(() => {
  vi.resetModules() // module-level unlocked/running state must start fresh per test
  startService.mockClear()
  stopService.mockClear()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
})

describe('keepAliveAction', () => {
  it('starts only when playing, unlocked, visible and not already running', async () => {
    const { keepAliveAction } = await import('./backgroundAudio')
    expect(keepAliveAction({ playing: true, unlocked: true, visible: true, running: false })).toBe('start')
  })

  it('never starts from the background (Android 17 would mute it)', async () => {
    const { keepAliveAction } = await import('./backgroundAudio')
    expect(keepAliveAction({ playing: true, unlocked: true, visible: false, running: false })).toBeNull()
  })

  it('does not start for a restored mix before the first gesture (nothing audible yet)', async () => {
    const { keepAliveAction } = await import('./backgroundAudio')
    expect(keepAliveAction({ playing: true, unlocked: false, visible: true, running: false })).toBeNull()
  })

  it('does not start on a gesture with nothing playing', async () => {
    const { keepAliveAction } = await import('./backgroundAudio')
    expect(keepAliveAction({ playing: false, unlocked: true, visible: true, running: false })).toBeNull()
  })

  it('stops when playback ends, foreground or background', async () => {
    const { keepAliveAction } = await import('./backgroundAudio')
    expect(keepAliveAction({ playing: false, unlocked: true, visible: true, running: true })).toBe('stop')
    expect(keepAliveAction({ playing: false, unlocked: true, visible: false, running: true })).toBe('stop')
  })

  it('keeps running across background/foreground while playing', async () => {
    const { keepAliveAction } = await import('./backgroundAudio')
    expect(keepAliveAction({ playing: true, unlocked: true, visible: false, running: true })).toBeNull()
    expect(keepAliveAction({ playing: true, unlocked: true, visible: true, running: true })).toBeNull()
  })
})

describe('initBackgroundAudio keep-alive wiring', () => {
  it('follows playback, not app transitions', async () => {
    const { initBackgroundAudio, startKeepAliveAudio } = await import('./backgroundAudio')
    let playing = true // boot-restored mix
    let notify = () => {}
    const target = { onEnterBackground: vi.fn(), onEnterForeground: vi.fn() }
    initBackgroundAudio(target, {
      isPlaying: () => playing,
      subscribe: (cb) => {
        notify = cb
        return () => {}
      },
      notificationText: () => TEXT,
    })
    const flush = () => new Promise((r) => setTimeout(r, 0))

    await flush()
    expect(stopService).toHaveBeenCalledTimes(1) // boot cleanup of a leftover service
    expect(startService).not.toHaveBeenCalled() // restored but silent until the first gesture

    startKeepAliveAudio() // first gesture
    await flush()
    expect(startService).toHaveBeenCalledWith(TEXT)

    appStateListener!({ isActive: false })
    appStateListener!({ isActive: true })
    await flush()
    expect(target.onEnterBackground).toHaveBeenCalled()
    expect(target.onEnterForeground).toHaveBeenCalled()
    expect(startService).toHaveBeenCalledTimes(1)
    expect(stopService).toHaveBeenCalledTimes(1) // app transitions never stop it

    playing = false // sleep timer finished / last orb removed
    notify()
    await flush()
    expect(stopService).toHaveBeenCalledTimes(2)

    appStateListener!({ isActive: false })
    playing = true // e.g. lock-screen resume while hidden
    notify()
    await flush()
    expect(startService).toHaveBeenCalledTimes(1) // not from the background

    appStateListener!({ isActive: true })
    await flush()
    expect(startService).toHaveBeenCalledTimes(2) // picked up once visible again
  })
})
