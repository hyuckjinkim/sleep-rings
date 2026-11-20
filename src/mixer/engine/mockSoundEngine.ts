// No-op stand-in for the real engine (src/audio/). Used by tests (jsdom has no
// AudioContext) — see ./instance.ts for the real-vs-mock runtime selection.
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
    setStartFade(sec) {
      log('setStartFade', sec)
    },
    setMasterVolume(v) {
      log('setMasterVolume', v)
    },
    setVolumeCap(cap) {
      log('setVolumeCap', cap)
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
    scheduleStart(atMs) {
      log('scheduleStart', atMs)
    },
    cancelStart() {
      log('cancelStart')
    },
    scheduleAlarm(soundId, atMs, fadeSec) {
      log('scheduleAlarm', soundId, atMs, fadeSec)
    },
    cancelAlarm() {
      log('cancelAlarm')
      return false
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
