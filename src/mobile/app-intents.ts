// Siri / Shortcuts app ("Play SleepRings", "Play last mix in SleepRings") through App Intents,
// iOS 16+ only. The phrases are compile-time Swift (ios/App/App/CapgoGeneratedAppShortcuts.swift,
// generated from ios/App/app-shortcuts.config.json); each one dispatches the action name below,
// which the plugin queues for JavaScript. Android has no App Intents — the plugin rejects there.
import { Capacitor } from '@capacitor/core'
import { useAppIntentsListener } from '@capgo/capacitor-app-intents'

export const PLAY_LAST_MIX_INTENT = 'playLastMix'

/**
 * Route Siri/Shortcuts invocations of PLAY_LAST_MIX_INTENT to `onPlayLastMix`. Also drains the
 * plugin's pending queue, which is how an invocation that cold-launched the app arrives. No-op
 * off iOS.
 */
export function onPlayLastMixIntent(onPlayLastMix: () => void): () => void {
  if (Capacitor.getPlatform() !== 'ios') return () => {}
  let removed = false
  let remove: (() => Promise<void>) | undefined
  void useAppIntentsListener((invocation) => {
    if (invocation.name === PLAY_LAST_MIX_INTENT) onPlayLastMix()
  })
    .then((handle) => {
      remove = handle.remove
      if (removed) void remove()
    })
    .catch((err: unknown) => console.warn('[app-intents] listener failed', err))
  return () => {
    removed = true
    void remove?.()
  }
}
