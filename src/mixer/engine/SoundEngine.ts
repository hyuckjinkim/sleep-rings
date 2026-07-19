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

  /** Global volume (0..1). */
  setMasterVolume(v: number): void

  /** Runtime panning quality switch (hrtf<->stereo), re-wires graph even mid-playback. */
  setPanQuality(q: 'hrtf' | 'stereo'): void

  /** Sleep timer: stop after durationSec, fading out over the last fadeSec. */
  scheduleSleep(durationSec: number, fadeSec: number): void
  cancelSleep(): void

  /** Full fade-out (manual stop or timer). */
  fadeOutAll(durationSec: number): Promise<void>

  /** Test-only introspection — current gain/pan per placement (for Playwright assertions). */
  inspect(placementId: string): { gain: number; pan: { x: number; z: number } } | null

  /** Background enter/exit hooks (called from Capacitor App events). */
  onEnterBackground(): void
  onEnterForeground(): void

  /** Stop everything and release the AudioContext. */
  dispose(): void
}
