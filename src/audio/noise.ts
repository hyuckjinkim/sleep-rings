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

const GENERATORS: Record<NoiseColor, (length: number, sampleRate: number) => Float32Array> = {
  white: (length) => generateWhiteNoise(length),
  pink: (length) => generatePinkNoise(length),
  brown: (length) => generateBrownNoise(length),
  green: (length, sampleRate) => generateGreenNoise(length, sampleRate),
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
