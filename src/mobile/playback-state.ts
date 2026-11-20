// The Android keep-alive service follows playback (orbs placed, sleep timer not yet finished, or an
// alarm armed), not app foreground/background. An armed alarm counts too: the WebView (and its
// running AudioContext) has to survive the night in the background for the alarm to fire, even after
// the timer silenced the mix. A pending bedtime start likewise, when there are orbs for it to start —
// arming it is the visible moment the service is allowed to start.
// Pure over a store slice: src/mixer/store.ts imports src/mobile, so this must not import the store.
export interface PlaybackState {
  current: { placements: readonly unknown[] }
  sleeping: boolean
  alarmAt: number | null
  bedtimeAt: number | null
}

export function isMixPlaying(s: PlaybackState): boolean {
  const hasMix = s.current.placements.length > 0
  return (hasMix && !s.sleeping) || s.alarmAt !== null || (hasMix && s.bedtimeAt !== null)
}
