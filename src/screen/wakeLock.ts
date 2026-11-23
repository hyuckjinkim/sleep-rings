// Thin wrapper around the standard Screen Wake Lock API (no native plugin — see the report to
// "main" for why: @capacitor-community/keep-awake doesn't support Capacitor 8, and the Wake Lock
// API alone already has full modern coverage — Safari/WKWebView 16.4+, Chromium WebView 84+).
// This is a best-effort OLED assist only; the screen-dim overlay (store.ts) is the guaranteed
// blackout, so a missing/denied lock must never throw or block anything.
let sentinel: WakeLockSentinel | null = null

export async function acquireWakeLock(): Promise<void> {
  if (sentinel || !('wakeLock' in navigator)) return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    // ponytail: permission denied / document not visible / unsupported platform — swallow.
    sentinel = null
  }
}

export function releaseWakeLock(): void {
  void sentinel?.release()
  sentinel = null
}
