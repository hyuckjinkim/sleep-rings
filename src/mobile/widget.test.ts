import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ name: 'ios' }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform.name },
}))

const CapgoWidgetKit = vi.hoisted(() => ({ startWidgetSession: vi.fn(), reloadWidgets: vi.fn() }))
vi.mock('@capgo/capacitor-widget-kit', () => ({ CapgoWidgetKit }))

beforeEach(() => {
  vi.resetModules() // the module remembers the last name it sent
  platform.name = 'ios'
  CapgoWidgetKit.startWidgetSession.mockReset().mockResolvedValue({})
  CapgoWidgetKit.reloadWidgets.mockReset().mockResolvedValue(undefined)
})

describe('setWidgetMixName', () => {
  it('stores the name for the widget on iOS and reloads it', async () => {
    const { setWidgetMixName } = await import('./widget')
    setWidgetMixName('Rainy night')
    expect(CapgoWidgetKit.startWidgetSession).toHaveBeenCalledWith({
      widgetId: 'last-mix',
      kind: 'PlayLastMixWidget',
      state: { name: 'Rainy night' },
    })
    await vi.waitFor(() => expect(CapgoWidgetKit.reloadWidgets).toHaveBeenCalledWith({ kind: 'PlayLastMixWidget' }))
  })

  it('skips unchanged names and sends an unnamed mix as an empty name', async () => {
    const { setWidgetMixName } = await import('./widget')
    setWidgetMixName(null)
    setWidgetMixName(null)
    expect(CapgoWidgetKit.startWidgetSession).toHaveBeenCalledTimes(1)
    expect(CapgoWidgetKit.startWidgetSession.mock.calls[0][0].state).toEqual({ name: '' })
  })

  it('survives a plugin failure', async () => {
    CapgoWidgetKit.startWidgetSession.mockRejectedValue(new Error('no app group'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { setWidgetMixName } = await import('./widget')
    setWidgetMixName('Rainy night')
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    expect(CapgoWidgetKit.reloadWidgets).not.toHaveBeenCalled()
  })

  it.each(['web', 'android'])('makes no calls on %s', async (name) => {
    platform.name = name
    const { setWidgetMixName } = await import('./widget')
    setWidgetMixName('Rainy night')
    expect(CapgoWidgetKit.startWidgetSession).not.toHaveBeenCalled()
  })
})
