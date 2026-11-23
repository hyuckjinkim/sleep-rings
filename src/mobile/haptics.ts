// Thin wrapper around @capacitor/haptics (official core plugin, Cap8-aligned) for the light
// tap feedback on orb placement/removal/lock. This is a NIGHT app — anything stronger than the
// lightest impact style risks being the annoying kind of feedback, so this only ever fires
// ImpactStyle.Light and never Notification/Vibrate. A single on/off switch (default on) covers
// "I don't want any buzzing at 2am" without needing per-interaction granularity nobody asked for.
//
// Not wired into src/mixer/store.ts (that file belongs to another worker) — see the report to
// "main" for the exact call sites (addPlacement / removePlacement+restoreLastRemoved /
// toggleLocked) and the one-line snippet each needs, same pattern as backgroundAudio.ts's
// decoupling from the engine it drives.
import { Haptics, ImpactStyle } from '@capacitor/haptics'

const ENABLED_KEY = 'so.hapticsEnabled'

export function isHapticsEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) !== '0' // default on
}

export function setHapticsEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0')
}

/** Fire a light tap. No-ops (never throws) on web or if the user turned haptics off. */
export function hapticTap(): void {
  if (!isHapticsEnabled()) return
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
    // ponytail: unsupported platform (plain web/desktop) — nothing to do.
  })
}
