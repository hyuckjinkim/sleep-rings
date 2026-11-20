import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ native: true }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
}))

let clickListener: ((e: { shortcutId: string }) => void) | undefined
const AppShortcuts = vi.hoisted(() => ({ set: vi.fn(), addListener: vi.fn() }))
vi.mock('@capawesome/capacitor-app-shortcuts', () => ({ AppShortcuts }))
const App = vi.hoisted(() => ({ getLaunchUrl: vi.fn() }))
vi.mock('@capacitor/app', () => ({ App }))

beforeEach(() => {
  platform.native = true
  AppShortcuts.set.mockReset().mockResolvedValue(undefined)
  App.getLaunchUrl.mockReset().mockResolvedValue(undefined)
  AppShortcuts.addListener.mockReset().mockImplementation((_event: string, cb: typeof clickListener) => {
    clickListener = cb
    return Promise.resolve({ remove: vi.fn() })
  })
})

describe('play-last-mix app shortcut', () => {
  it('publishes one shortcut with the translated title', async () => {
    const { setPlayLastMixShortcut } = await import('./app-shortcuts')
    await setPlayLastMixShortcut('마지막 믹스 재생')
    expect(AppShortcuts.set).toHaveBeenCalledWith({ shortcuts: [{ id: 'play-last-mix', title: '마지막 믹스 재생' }] })
  })

  it('is not published from a session a share link launched (Android would bake that URL in)', async () => {
    App.getLaunchUrl.mockResolvedValue({ url: 'https://sleeprings.app/#mix=abc' })
    const { setPlayLastMixShortcut } = await import('./app-shortcuts')
    await setPlayLastMixShortcut('Play last mix')
    expect(AppShortcuts.set).not.toHaveBeenCalled()
  })

  it('routes its taps, and only its taps, to the handler', async () => {
    const { onPlayLastMixShortcut } = await import('./app-shortcuts')
    const onTap = vi.fn()
    onPlayLastMixShortcut(onTap)
    clickListener!({ shortcutId: 'something-else' })
    expect(onTap).not.toHaveBeenCalled()
    clickListener!({ shortcutId: 'play-last-mix' })
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('does nothing on web', async () => {
    platform.native = false
    const { onPlayLastMixShortcut, setPlayLastMixShortcut } = await import('./app-shortcuts')
    await setPlayLastMixShortcut('Play last mix')
    onPlayLastMixShortcut(vi.fn())
    expect(AppShortcuts.set).not.toHaveBeenCalled()
    expect(AppShortcuts.addListener).not.toHaveBeenCalled()
  })
})
