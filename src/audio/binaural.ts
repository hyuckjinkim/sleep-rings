// Pre-rendered stereo binaural-beat buffers. Left/right channels each carry a pure sine at a
// slightly different frequency (beatHz apart) — the *perceived* beat is the brain interfering
// the two ears' signals, so the hard L/R separation is the whole point and must reach the
// speakers untouched. SoundEngine bypasses the pan node for these (see soundEngine.ts).
import { MASTER_TARGET_RMS, type BufferHost } from './noise'
import type { EngineAudioBuffer } from './webAudioTypes'

// Binaural used a fixed PEAK=0.5 (RMS~0.354 for a pure sine) regardless of the noise colors'
// loudness — audio.md measured that as +9.4dB over MASTER_TARGET_RMS, the second-largest
// loudness-consistency gap after white noise's missing normalization (sound-craft.md §1). A pure
// tone also reads louder than broadband noise at the same RMS (all its energy sits in one narrow
// band instead of spread across the spectrum), so binaural targets a fraction of the shared master
// RMS rather than matching it outright — 0.7x keeps it audible without dominating a mix.
const TONE_TARGET_RMS = MASTER_TARGET_RMS * 0.7
const AMPLITUDE = TONE_TARGET_RMS * Math.SQRT2 // peak = rms * sqrt(2) for a pure sine

/**
 * Renders `seconds` of a stereo binaural beat: left = carrierHz, right = carrierHz + beatHz.
 * carrierHz/beatHz must be integers (catalog presets are) so that every full second contains a
 * whole number of cycles on both channels — the loop point is then phase-continuous with no
 * crossfade needed, for any `seconds`.
 */
export function renderBinauralBuffer(
  host: BufferHost,
  carrierHz: number,
  beatHz: number,
  sampleRate: number,
  seconds = 10,
): EngineAudioBuffer {
  const length = Math.floor(sampleRate * seconds)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const rightHz = carrierHz + beatHz
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    left[i] = Math.sin(2 * Math.PI * carrierHz * t) * AMPLITUDE
    right[i] = Math.sin(2 * Math.PI * rightHz * t) * AMPLITUDE
  }
  const buffer = host.createBuffer(2, length, sampleRate)
  buffer.copyToChannel(left, 0)
  buffer.copyToChannel(right, 1)
  return buffer
}
