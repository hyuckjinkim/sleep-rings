import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ name: 'ios' }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform.name },
}))

type Handler = (invocation: { id: string; name: string; params: Record<string, unknown> }) => void
let intentHandler: Handler | undefined
const useAppIntentsListener = vi.hoisted(() => vi.fn())
vi.mock('@capgo/capacitor-app-intents', () => ({ useAppIntentsListener }))

beforeEach(() => {
  platform.name = 'ios'
  useAppIntentsListener.mockReset().mockImplementation((handler: Handler) => {
    intentHandler = handler
    return Promise.resolve({ remove: vi.fn().mockResolvedValue(undefined) })
  })
})

describe('Siri / App Intents routing', () => {
  it('routes the playLastMix intent (live or drained after a cold launch) to the handler', async () => {
    const { onPlayLastMixIntent } = await import('./appIntents')
    const onPlay = vi.fn()
    onPlayLastMixIntent(onPlay)
    intentHandler!({ id: '1', name: 'somethingElse', params: {} })
    expect(onPlay).not.toHaveBeenCalled()
    intentHandler!({ id: '2', name: 'playLastMix', params: {} })
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('removes the listener on cleanup, even before it finished registering', async () => {
    const { onPlayLastMixIntent } = await import('./appIntents')
    const cleanup = onPlayLastMixIntent(vi.fn())
    cleanup()
    const handle = await useAppIntentsListener.mock.results[0].value
    await Promise.resolve()
    expect(handle.remove).toHaveBeenCalled()
  })

  it('does nothing on Android or web (no App Intents there)', async () => {
    const { onPlayLastMixIntent } = await import('./appIntents')
    platform.name = 'android'
    onPlayLastMixIntent(vi.fn())
    platform.name = 'web'
    onPlayLastMixIntent(vi.fn())
    expect(useAppIntentsListener).not.toHaveBeenCalled()
  })
})
