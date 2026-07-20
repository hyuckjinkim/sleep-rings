// Pre-rendered stereo binaural-beat buffers. Left/right channels each carry a pure sine at a
// slightly different frequency (beatHz apart) — the *perceived* beat is the brain interfering
// the two ears' signals, so the hard L/R separation is the whole point and must reach the
// speakers untouched. SoundEngine bypasses the pan node for these (see sound-engine.ts).
import type { BufferHost } from './noise'
import type { EngineAudioBuffer } from './web-audio-types'

const PEAK = 0.5 // pure sustained tones fatigue the ear faster than broadband noise at the same peak — keep headroom

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
    left[i] = Math.sin(2 * Math.PI * carrierHz * t) * PEAK
    right[i] = Math.sin(2 * Math.PI * rightHz * t) * PEAK
  }
  const buffer = host.createBuffer(2, length, sampleRate)
  buffer.copyToChannel(left, 0)
  buffer.copyToChannel(right, 1)
  return buffer
}
