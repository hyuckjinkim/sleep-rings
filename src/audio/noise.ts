// Pure noise-color sample generators + AudioBuffer rendering. No realtime DSP/AudioWorklet —
// noise is a stationary signal, so a long pre-rendered loop (~10s) is enough to be inaudible
// as a repeat. See docs/design/audio-engine.md §3.
import type { NoiseColor } from '../data/types'
import type { EngineAudioBuffer } from './web-audio-types'

const PEAK_TARGET = 0.9

export function generateWhiteNoise(length: number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) out[i] = Math.random() * 2 - 1
  return out
}

/** Paul Kellet's refined pink noise filter (-3dB/oct). */
export function generatePinkNoise(length: number): Float32Array {
  const out = new Float32Array(length)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
    b6 = white * 0.115926
    out[i] = pink * 0.11
  }
  return normalize(out)
}

/** Leaky integrator over white noise (-6dB/oct, bass-heavy). */
export function generateBrownNoise(length: number): Float32Array {
  const out = new Float32Array(length)
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    out[i] = last
  }
  return normalize(out)
}

/** Pink noise with a midrange (~500Hz) emphasis. No standardized "green noise" spectrum exists
 * (design doc §8.5) — this is an approximation via cascaded one-pole low/high-pass filters. */
export function generateGreenNoise(length: number, sampleRate: number): Float32Array {
  const pink = generatePinkNoise(length)
  const lowpassed = onePoleLowpass(pink, sampleRate, 2000)
  const bandpassed = onePoleHighpass(lowpassed, sampleRate, 150)
  return normalize(bandpassed)
}

function onePoleLowpass(input: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const out = new Float32Array(input.length)
  const dt = 1 / sampleRate
  const rc = 1 / (2 * Math.PI * cutoffHz)
  const alpha = dt / (rc + dt)
  let prev = 0
  for (let i = 0; i < input.length; i++) {
    prev += alpha * (input[i] - prev)
    out[i] = prev
  }
  return out
}

function onePoleHighpass(input: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const out = new Float32Array(input.length)
  const dt = 1 / sampleRate
  const rc = 1 / (2 * Math.PI * cutoffHz)
  const alpha = rc / (rc + dt)
  let prevIn = input.length > 0 ? input[0] : 0
  let prevOut = 0
  for (let i = 0; i < input.length; i++) {
    prevOut = alpha * (prevOut + input[i] - prevIn)
    prevIn = input[i]
    out[i] = prevOut
  }
  return out
}

function normalize(samples: Float32Array): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  if (peak === 0) return samples
  const scale = PEAK_TARGET / peak
  for (let i = 0; i < samples.length; i++) samples[i] *= scale
  return samples
}

// Target RMS for the four nature generators below, chosen empirically rather than derived from
// PEAK_TARGET. Two things ruled out the obvious "PEAK_TARGET/sqrt(3)" formula:
// 1. `generateWhiteNoise` is the one color that skips `normalize()` (see above) — its RMS
//    (~0.58) isn't representative of "the four colors." pink/brown/green *are* peak-normalized
//    and cluster around RMS~0.19 (crest factor ~4.6) — that's the real reference.
// 2. wind/waves layer an amplitude swell on top (applyAmplitudeSwell) — a loud "crash" moment
//    and a near-silent trough in the *same* buffer gives them a much higher crest factor (~7-7.5,
//    measured via a 25-trial Monte Carlo sweep) than static-texture rain/stream (~3.5). Any
//    shared target near 0.19 forces normalizeRms's clip-safety clamp to fire for wind/waves, and
//    since the clamp scales down by whatever peak the noise happened to hit that render, the
//    resulting RMS becomes non-deterministic instead of landing on target.
// 0.12 keeps every generator (including the swell-modulated ones) comfortably under the clamp
// threshold — 0/25 clamp triggers in that sweep — so normalizeRms always lands exactly on target.
// It's quieter than pink/brown/green's ~0.19 (about -4dB), but that trade favors deterministic,
// reproducible output over an exact loudness match a swelling sound can't hit safely anyway.
const NATURE_TARGET_RMS = 0.12

function normalizeRms(samples: Float32Array, targetRms: number): Float32Array {
  let sumSq = 0
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i]
  const rms = Math.sqrt(sumSq / samples.length)
  if (rms === 0) return samples
  const scale = targetRms / rms
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    samples[i] *= scale
    peak = Math.max(peak, Math.abs(samples[i]))
  }
  // RMS-matching can push impulse peaks (rain droplets, stream bubbles) past full scale even
  // though the average level is correct — clamp back down to avoid clipping.
  if (peak > 1) {
    const clampScale = 1 / peak
    for (let i = 0; i < samples.length; i++) samples[i] *= clampScale
  }
  return samples
}

/** Sample-and-hold random gain jitter — cheap stand-in for discrete impact texture (raindrops,
 * stream bubbles) without a real impulse convolution. A new random intensity every `holdMs`. */
function applyJitterTexture(input: Float32Array, sampleRate: number, holdMs: number, minGain: number, maxGain: number): Float32Array {
  const out = new Float32Array(input.length)
  const holdSamples = Math.max(1, Math.floor((sampleRate * holdMs) / 1000))
  let gain = 1
  for (let i = 0; i < input.length; i++) {
    if (i % holdSamples === 0) gain = minGain + Math.random() * (maxGain - minGain)
    out[i] = input[i] * gain
  }
  return out
}

/** Slow tremolo/swell envelope, exactly one LFO cycle per `periodSec`. Callers render the buffer
 * at a duration equal to `periodSec` (see NOISE_BUFFER_SECONDS below), so cos(0) === cos(2π) makes
 * the loop point phase-continuous — no crossfade needed (design doc §3/§4 loop-seam technique). */
function applyAmplitudeSwell(input: Float32Array, sampleRate: number, periodSec: number, minGain: number): Float32Array {
  const out = new Float32Array(input.length)
  const omega = (2 * Math.PI) / (periodSec * sampleRate)
  for (let i = 0; i < input.length; i++) {
    const swell = minGain + (1 - minGain) * (0.5 - 0.5 * Math.cos(omega * i))
    out[i] = input[i] * swell
  }
  return out
}

// Strips rumble below the patter/hiss register; broadband white above it already reads as rain.
const RAIN_HIGHPASS_HZ = 1500
const RAIN_JITTER_HOLD_MS = 8 // ~125 droplet-density updates/sec — texture, not a buzz
const RAIN_JITTER_GAIN: [number, number] = [0.5, 1.4]

/** Highpassed white noise + droplet-density jitter. */
export function generateRainNoise(length: number, sampleRate: number): Float32Array {
  const highpassed = onePoleHighpass(generateWhiteNoise(length), sampleRate, RAIN_HIGHPASS_HZ)
  const textured = applyJitterTexture(highpassed, sampleRate, RAIN_JITTER_HOLD_MS, ...RAIN_JITTER_GAIN)
  return normalizeRms(textured, NATURE_TARGET_RMS)
}

const WIND_LOWPASS_HZ = 500 // mid of the 200-800Hz "gust" band; brown noise is already bass-heavy
const WIND_SWELL_SEC = 12 // one gust cycle per buffer, within the 8-16s gust range
const WIND_SWELL_MIN_GAIN = 0.35 // gusts ease off, they don't go silent

/** Lowpassed brown noise + a slow amplitude swell (the "gust" feel). */
export function generateWindNoise(length: number, sampleRate: number): Float32Array {
  const lowpassed = onePoleLowpass(generateBrownNoise(length), sampleRate, WIND_LOWPASS_HZ)
  const swelled = applyAmplitudeSwell(lowpassed, sampleRate, WIND_SWELL_SEC, WIND_SWELL_MIN_GAIN)
  return normalizeRms(swelled, NATURE_TARGET_RMS)
}

const WAVES_SWELL_SEC = 6 // wave-rhythm range (4-8s), faster/more distinct than wind's gusts
const WAVES_SWELL_MIN_GAIN = 0.12 // a wave recedes almost to silence before the next crash

/** Brown noise + a deep periodic swell (crash/recede), distinct from wind's shallower tremolo. */
export function generateWavesNoise(length: number, sampleRate: number): Float32Array {
  const swelled = applyAmplitudeSwell(generateBrownNoise(length), sampleRate, WAVES_SWELL_SEC, WAVES_SWELL_MIN_GAIN)
  return normalizeRms(swelled, NATURE_TARGET_RMS)
}

const STREAM_BANDPASS_LOW_HZ = 800
const STREAM_BANDPASS_HIGH_HZ = 3000
const STREAM_BUBBLE_HOLD_MS = 4 // denser/faster than rain's droplets — babbling texture
const STREAM_BUBBLE_GAIN: [number, number] = [0.4, 1.5]

/** Bandpassed (800-3000Hz) white noise + bubble-density jitter, static (no swell) like a
 * steady brook rather than a gusting/crashing sound. */
export function generateStreamNoise(length: number, sampleRate: number): Float32Array {
  const band = onePoleHighpass(onePoleLowpass(generateWhiteNoise(length), sampleRate, STREAM_BANDPASS_HIGH_HZ), sampleRate, STREAM_BANDPASS_LOW_HZ)
  const textured = applyJitterTexture(band, sampleRate, STREAM_BUBBLE_HOLD_MS, ...STREAM_BUBBLE_GAIN)
  return normalizeRms(textured, NATURE_TARGET_RMS)
}

const GENERATORS: Record<NoiseColor, (length: number, sampleRate: number) => Float32Array> = {
  white: (length) => generateWhiteNoise(length),
  pink: (length) => generatePinkNoise(length),
  brown: (length) => generateBrownNoise(length),
  green: (length, sampleRate) => generateGreenNoise(length, sampleRate),
  rain: (length, sampleRate) => generateRainNoise(length, sampleRate),
  wind: (length, sampleRate) => generateWindNoise(length, sampleRate),
  waves: (length, sampleRate) => generateWavesNoise(length, sampleRate),
  stream: (length, sampleRate) => generateStreamNoise(length, sampleRate),
}

/** Per-color buffer duration override. wind/waves bake exactly one amplitude-swell cycle into
 * the buffer (see applyAmplitudeSwell) — the render duration must equal that cycle's period or
 * the loop wraps mid-swell and clicks. Colors absent here use the caller's default duration. */
export const NOISE_BUFFER_SECONDS: Partial<Record<NoiseColor, number>> = {
  wind: WIND_SWELL_SEC,
  waves: WAVES_SWELL_SEC,
}

export interface BufferHost {
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): EngineAudioBuffer
}

/** Render `seconds` of the given noise color into a mono AudioBuffer for the caller to loop. */
export function renderNoiseBuffer(
  host: BufferHost,
  color: NoiseColor,
  sampleRate: number,
  seconds = 10,
): EngineAudioBuffer {
  const length = Math.floor(sampleRate * seconds)
  const samples = GENERATORS[color](length, sampleRate)
  const buffer = host.createBuffer(1, length, sampleRate)
  buffer.copyToChannel(samples, 0)
  return buffer
}
