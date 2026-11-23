import { afterEach, describe, it, expect, vi } from 'vitest'
import { initMediaSession, setNowPlaying } from './mediaSession'
import type { BackgroundAudioTarget } from './backgroundAudio'

function makeTarget(): BackgroundAudioTarget {
  return { onEnterBackground: vi.fn(), onEnterForeground: vi.fn() }
}

describe('media-session', () => {
  it('no-ops when navigator.mediaSession is unsupported (jsdom baseline)', () => {
    const target = makeTarget()
    const cleanup = initMediaSession(target)
    expect(() => cleanup()).not.toThrow()
    expect(target.onEnterForeground).not.toHaveBeenCalled()
  })

  it('wires play/pause to the target when the API is available', () => {
    const setActionHandler = vi.fn()
    const fakeMediaSession = { setActionHandler, metadata: null, playbackState: 'none' }
    // @ts-expect-error test-only stub of a jsdom-unsupported API
    navigator.mediaSession = fakeMediaSession
    // jsdom has no MediaMetadata constructor either — stub it, real value unused by the test.
    // @ts-expect-error test-only stub
    global.MediaMetadata = class {
      constructor(public init: unknown) {}
    }

    const target = makeTarget()
    initMediaSession(target)

    const playHandler = setActionHandler.mock.calls.find((c) => c[0] === 'play')?.[1]
    const pauseHandler = setActionHandler.mock.calls.find((c) => c[0] === 'pause')?.[1]
    playHandler()
    expect(target.onEnterForeground).toHaveBeenCalled()
    pauseHandler()
    expect(target.onEnterBackground).toHaveBeenCalled()

    // @ts-expect-error test-only cleanup
    delete navigator.mediaSession
    // @ts-expect-error test-only cleanup
    delete global.MediaMetadata
  })
})

describe('Now Playing metadata', () => {
  const created: { title: string; artist: string; artwork: { src: string; type: string }[] }[] = []

  function stubApi() {
    created.length = 0
    // @ts-expect-error test-only stub of a jsdom-unsupported API
    navigator.mediaSession = { setActionHandler: vi.fn(), metadata: null, playbackState: 'none' }
    // @ts-expect-error test-only stub
    global.MediaMetadata = class {
      title: string
      constructor(init: (typeof created)[number]) {
        this.title = init.title
        created.push(init)
      }
    }
  }

  afterEach(() => {
    // @ts-expect-error test-only cleanup
    delete navigator.mediaSession
    // @ts-expect-error test-only cleanup
    delete global.MediaMetadata
  })

  it('shows the app name for an unnamed mix, with the app as artist and the app icon as artwork', () => {
    stubApi()
    initMediaSession({ onEnterBackground: vi.fn(), onEnterForeground: vi.fn() })
    expect(created[0]).toMatchObject({ title: 'SleepRings', artist: 'SleepRings' })
    expect(created[0].artwork[0].src).toMatch(/icon\.svg/)
  })

  it('uses the mix name when there is one, and skips identical updates', () => {
    stubApi()
    setNowPlaying('Rainy night')
    setNowPlaying('Rainy night')
    expect(created.map((m) => m.title)).toEqual(['Rainy night'])
    setNowPlaying(null)
    expect(created.map((m) => m.title)).toEqual(['Rainy night', 'SleepRings'])
  })

  it('is a no-op without the Media Session API', () => {
    expect(() => setNowPlaying('x')).not.toThrow()
  })
})
