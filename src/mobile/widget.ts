// iOS "Play last mix" home-screen widget label (ios/App/SleepRingsWidget/PlayLastMixWidget.swift).
// The widget reads the mix name from a @capgo/capacitor-widget-kit session in the shared App Group
// (docs/ios-widget-setup.md); its tap opens the app on the launcher shortcut's route. Android's
// widget is a fixed label (PlayLastMix.kt), so this is iOS only.
import { Capacitor } from '@capacitor/core'
import { CapgoWidgetKit } from '@capgo/capacitor-widget-kit'

// Must match PlayLastMixWidget.swift.
export const WIDGET_SESSION_ID = 'last-mix'
export const WIDGET_KIND = 'PlayLastMixWidget'

let lastName: string | null | undefined

/** Show `mixName` (null = unnamed mix → no name line) on the widget. Skips unchanged names — the
 * mixer store ticks often. No-op off iOS. */
export function setWidgetMixName(mixName: string | null): void {
  if (Capacitor.getPlatform() !== 'ios' || mixName === lastName) return
  lastName = mixName
  // startWidgetSession with a fixed id overwrites the stored session, so it doubles as "set".
  void CapgoWidgetKit.startWidgetSession({ widgetId: WIDGET_SESSION_ID, kind: WIDGET_KIND, state: { name: mixName ?? '' } })
    .then(() => CapgoWidgetKit.reloadWidgets({ kind: WIDGET_KIND }))
    .catch((err: unknown) => console.warn('[widget] update failed', err))
}
