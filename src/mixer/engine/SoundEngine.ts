// Mirrors docs/design/audio-engine.md §7 exactly. This is the contract audio-engineer
// implements for real in src/audio/ — mixer only ever talks to this interface.
import type { Placement, Sound } from '../types'

export interface SoundEngine {
  /** First user gesture. AudioContext.resume() + pre-render noise buffers. */
  init(): Promise<void>

  /** Load a catalog sound (fetch+decode for files, ensure cached buffer for noise). Idempotent. */
  load(sound: Sound): Promise<void>

  /** Start playback for a placement -> builds and connects its node chain. No-op if already playing. */
  play(placement: Placement): void

  /** Stop a placement -> fade out then tear down nodes. */
  stop(placementId: string, fadeSec?: number): void

  /** Apply placement/volume/orbit/lock changes. Orbit driver also updates position on rAF. */
  setPlacement(placement: Placement): void

  /** Fade-in length (seconds) used whenever playback starts from silence. 0 = off. */
  setStartFade(sec: number): void

  /** Global volume (0..1). */
  setMasterVolume(v: number): void

  /** Hard ceiling (0..1) on total output, alarm included; independent of setMasterVolume. */
  setVolumeCap(cap: number): void

  /** Runtime panning quality switch (hrtf<->stereo), re-wires graph even mid-playback. */
  setPanQuality(q: 'hrtf' | 'stereo'): void

  /** Sleep timer: stop after durationSec, fading out over the last fadeSec (audio-clock automation
   * on a dedicated gain after master, so setMasterVolume never cancels it). */
  scheduleSleep(durationSec: number, fadeSec: number): void
  cancelSleep(): void

  /** Bedtime start at wall-clock atMs (epoch ms): the mix is held silent (sources keep running, so
   * the context stays alive) and fades in at atMs on the audio clock. cancelStart() un-holds now. */
  scheduleStart(atMs: number): void
  cancelStart(): void

  /** Wake alarm at wall-clock atMs (epoch ms): the loaded sound fades in over fadeSec while the mix
   * crossfades out. Needs the app (AudioContext) running — a finished sleep timer won't suspend
   * while one is armed. cancelAlarm() disarms, or dismisses one that's already ringing (and then
   * returns true: the mix was torn down with it). */
  scheduleAlarm(soundId: string, atMs: number, fadeSec: number): void
  cancelAlarm(): boolean

  /** Test-only introspection — current gain/pan per placement (for Playwright assertions). */
  inspect(placementId: string): { gain: number; pan: { x: number; z: number } } | null

  /** Background enter/exit hooks (called from Capacitor App events). */
  onEnterBackground(): void
  onEnterForeground(): void

  /** Stop everything and release the AudioContext. */
  dispose(): void
}
