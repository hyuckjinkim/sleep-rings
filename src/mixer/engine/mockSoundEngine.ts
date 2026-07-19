// No-op stand-in for the real engine (src/audio/, built in parallel by audio-engineer).
// Logs only, so UI wiring to SoundEngine calls can be exercised and swapped for the real
// implementation later without touching call sites. See docs/design/audio-engine.md §7.
import type { SoundEngine } from './SoundEngine'

const log = (...args: unknown[]) => console.debug('[MockSoundEngine]', ...args)

export function createMockSoundEngine(): SoundEngine {
  return {
    async init() {
      log('init')
    },
    async load(sound) {
      log('load', sound.id)
    },
    play(placement) {
      log('play', placement.id, placement.soundId)
    },
    stop(placementId, fadeSec) {
      log('stop', placementId, fadeSec)
    },
    setPlacement(placement) {
      log('setPlacement', placement.id, { radius: placement.radius, angle: placement.angle })
    },
    setMasterVolume(v) {
      log('setMasterVolume', v)
    },
    setPanQuality(q) {
      log('setPanQuality', q)
    },
    scheduleSleep(durationSec, fadeSec) {
      log('scheduleSleep', durationSec, fadeSec)
    },
    cancelSleep() {
      log('cancelSleep')
    },
    async fadeOutAll(durationSec) {
      log('fadeOutAll', durationSec)
    },
    inspect() {
      return null
    },
    onEnterBackground() {
      log('onEnterBackground')
    },
    onEnterForeground() {
      log('onEnterForeground')
    },
    dispose() {
      log('dispose')
    },
  }
}

/** Singleton used by the mixer store — the later integration task swaps this import. */
export const soundEngine = createMockSoundEngine()
