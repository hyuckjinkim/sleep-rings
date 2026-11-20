// Home-screen / launcher "Play last mix" shortcut (long-press the app icon). Native only.
import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { AppShortcuts } from '@capawesome/capacitor-app-shortcuts'

export const PLAY_LAST_MIX_SHORTCUT_ID = 'play-last-mix'

/**
 * (Re)publish the shortcut with a translated title — call again when the language changes.
 * Taps arrive through onPlayLastMixShortcut(). No-op on web.
 *
 * Skipped in a session a link launched: on Android the plugin bakes the launching intent's URL
 * into the shortcut, so every later shortcut tap would reopen that share link (replacing the
 * last mix) instead. The shortcut published by an ordinary launch stays in place meanwhile.
 */
export async function setPlayLastMixShortcut(title: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    if ((await App.getLaunchUrl())?.url) return
    await AppShortcuts.set({ shortcuts: [{ id: PLAY_LAST_MIX_SHORTCUT_ID, title }] })
  } catch (err) {
    console.warn('[app-shortcuts] set failed', err)
  }
}

/** Shortcut taps. The plugin retains the event until a listener consumes it, so a tap that
 * cold-started the app still arrives. No-op on web. */
export function onPlayLastMixShortcut(onTap: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let handle: PluginListenerHandle | undefined
  void AppShortcuts.addListener('click', ({ shortcutId }) => {
    if (shortcutId === PLAY_LAST_MIX_SHORTCUT_ID) onTap()
  }).then((h) => {
    handle = h
  })
  return () => {
    void handle?.remove()
  }
}
