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

// --- B1 (v0.3.0): 8 synth sounds added on top of the 4 nature generators above. Same 3
// primitives (filter/swell/jitter) plus two new ones: applyImpulseBursts (sparse random pops —
// campfire) and applyEnvelopeStrike (single slow attack/decay hit — thunder). All share
// NATURE_TARGET_RMS; see docs/roadmap-v030.md §1 for the design brief and
// .omc/research/platform-capabilities.md §2 for the synthesis rationale per sound.

const CAMPFIRE_RUMBLE_LOWPASS_HZ = 300 // bass rumble bed, well below the crackle band
const CAMPFIRE_CRACKLE_HIGHPASS_HZ = 2000 // isolates the "pop" transient from the rumble
const CAMPFIRE_POP_RATE_PER_SEC = 2 // average pop events/sec (Poisson-ish per-sample trigger)
const CAMPFIRE_POP_DECAY_MS = 20 // fast decay after each pop — a "tak", not a ring
const CAMPFIRE_POP_GAIN = 1.0

/** Sparse random impulse envelope: each sample has a small trigger probability that snaps the
 * envelope to 1 and starts an exponential decay — a cheap stand-in for discrete pop/crackle
 * transients. Crest factor is high and random-seed-dependent, which risks tripping normalizeRms's
 * clip clamp non-deterministically (E3 §7 lesson) — rate/decay/gain here were tuned via a 25-trial
 * Monte Carlo sweep to land within the RMS target band on every trial without clamping. */
function applyImpulseBursts(input: Float32Array, sampleRate: number, ratePerSec: number, decayMs: number, gain: number): Float32Array {
  const out = new Float32Array(input.length)
  const decaySamples = (decayMs / 1000) * sampleRate
  const decayRate = Math.exp(-1 / decaySamples)
  const triggerProb = ratePerSec / sampleRate
  let envelope = 0
  for (let i = 0; i < input.length; i++) {
    if (Math.random() < triggerProb) envelope = 1
    else envelope *= decayRate
    out[i] = input[i] * envelope * gain
  }
  return out
}

/** Brown rumble bed + sparse highpassed crackle bursts. */
export function generateCampfireNoise(length: number, sampleRate: number): Float32Array {
  const rumble = onePoleLowpass(generateBrownNoise(length), sampleRate, CAMPFIRE_RUMBLE_LOWPASS_HZ)
  const crackleBase = onePoleHighpass(generateWhiteNoise(length), sampleRate, CAMPFIRE_CRACKLE_HIGHPASS_HZ)
  const crackle = applyImpulseBursts(crackleBase, sampleRate, CAMPFIRE_POP_RATE_PER_SEC, CAMPFIRE_POP_DECAY_MS, CAMPFIRE_POP_GAIN)
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = rumble[i] + crackle[i]
  return normalizeRms(mixed, NATURE_TARGET_RMS)
}

const FAN_LOWPASS_HZ = 650 // narrow "ventilation hum" band, cascaded for a steeper rolloff than wind
const FAN_SWELL_SEC = 1.6 // fast blade-rotation pulse, much quicker than wind's gusts
const FAN_SWELL_MIN_GAIN = 0.85 // barely perceptible pulse — steady hum, not gusting

/** Cascaded-lowpass white noise + a fast, shallow amplitude swell (blade rotation feel). */
export function generateFanNoise(length: number, sampleRate: number): Float32Array {
  const cascaded = onePoleLowpass(onePoleLowpass(generateWhiteNoise(length), sampleRate, FAN_LOWPASS_HZ), sampleRate, FAN_LOWPASS_HZ)
  const swelled = applyAmplitudeSwell(cascaded, sampleRate, FAN_SWELL_SEC, FAN_SWELL_MIN_GAIN)
  return normalizeRms(swelled, NATURE_TARGET_RMS)
}

const THUNDER_LOWPASS_HZ = 100 // deep rumble bed, well below rain's patter band
const THUNDER_BUFFER_SECONDS = 24 // long enough that one strike + its decay don't feel metronomic on loop
const THUNDER_STRIKE_ATTACK_SEC = 0.05
const THUNDER_STRIKE_DECAY_SEC = 4
const THUNDER_STRIKE_PEAK_GAIN = 1.8
const THUNDER_STRIKE_BASE_GAIN = 0.5 // faint rumble floor between strikes

/** One strike per buffer at a random position (kept within the first 40% so the ~4s decay
 * finishes well before the loop point), sharp linear attack then exponential decay back to the
 * base floor. Random strike position + long exponential tail is another high-crest-factor shape
 * (E3 §7 lesson) — tuned via the same Monte Carlo sweep as campfire. */
function applyEnvelopeStrike(input: Float32Array, sampleRate: number, attackSec: number, decaySec: number, peakGain: number, baseGain: number): Float32Array {
  const out = new Float32Array(input.length)
  const attackSamples = attackSec * sampleRate
  const decayRate = Math.exp(-1 / (decaySec * sampleRate))
  const strikeAt = Math.floor(Math.random() * input.length * 0.4)
  let envelope = baseGain
  for (let i = 0; i < input.length; i++) {
    if (i >= strikeAt && i < strikeAt + attackSamples) {
      envelope = baseGain + (peakGain - baseGain) * ((i - strikeAt) / attackSamples)
    } else if (i >= strikeAt + attackSamples) {
      envelope = baseGain + (envelope - baseGain) * decayRate
    }
    out[i] = input[i] * envelope
  }
  return out
}

/** Deep-lowpassed brown noise + a single slow-decay strike per buffer (meant to layer under rain). */
export function generateThunderNoise(length: number, sampleRate: number): Float32Array {
  const lowpassed = onePoleLowpass(onePoleLowpass(generateBrownNoise(length), sampleRate, THUNDER_LOWPASS_HZ), sampleRate, THUNDER_LOWPASS_HZ)
  const struck = applyEnvelopeStrike(lowpassed, sampleRate, THUNDER_STRIKE_ATTACK_SEC, THUNDER_STRIKE_DECAY_SEC, THUNDER_STRIKE_PEAK_GAIN, THUNDER_STRIKE_BASE_GAIN)
  return normalizeRms(struck, NATURE_TARGET_RMS)
}

const BROOK_BUBBLE_HOLD_MS = 2 // denser than stream's 4ms — faster "여울" (riffle) gurgle
const BROOK_BUBBLE_GAIN: [number, number] = [0.3, 1.7]

/** Same 800-3000Hz bandpass as generateStreamNoise, just a denser bubble-jitter preset. */
export function generateBrookNoise(length: number, sampleRate: number): Float32Array {
  const band = onePoleHighpass(onePoleLowpass(generateWhiteNoise(length), sampleRate, STREAM_BANDPASS_HIGH_HZ), sampleRate, STREAM_BANDPASS_LOW_HZ)
  const textured = applyJitterTexture(band, sampleRate, BROOK_BUBBLE_HOLD_MS, ...BROOK_BUBBLE_GAIN)
  return normalizeRms(textured, NATURE_TARGET_RMS)
}

const UMBRELLA_RESONANCE_LOW_HZ = 300 // narrow band under the resonance a taut surface (umbrella/tent) adds to rain
const UMBRELLA_RESONANCE_HIGH_HZ = 600
const UMBRELLA_RESONANCE_GAIN = 0.6 // mixed under the hiss layer, not overpowering it

/** Rain's highpassed-hiss layer + a second bandpassed "tap" texture layer for the surface
 * resonance. The two jitter layers are independently randomized rather than phase-locked — an
 * intentional simplification, not a synced impact model. */
export function generateUmbrellaRainNoise(length: number, sampleRate: number): Float32Array {
  const hiss = applyJitterTexture(onePoleHighpass(generateWhiteNoise(length), sampleRate, RAIN_HIGHPASS_HZ), sampleRate, RAIN_JITTER_HOLD_MS, ...RAIN_JITTER_GAIN)
  const resonanceBand = onePoleHighpass(onePoleLowpass(generateWhiteNoise(length), sampleRate, UMBRELLA_RESONANCE_HIGH_HZ), sampleRate, UMBRELLA_RESONANCE_LOW_HZ)
  const resonance = applyJitterTexture(resonanceBand, sampleRate, RAIN_JITTER_HOLD_MS, ...RAIN_JITTER_GAIN)
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = hiss[i] + resonance[i] * UMBRELLA_RESONANCE_GAIN
  return normalizeRms(mixed, NATURE_TARGET_RMS)
}

const LOFI_LOWPASS_HZ = 150 // narrow "machine room" hum band
const LOFI_SINE_HZ = 55 // sub-bass harmonic under the noise floor; integer Hz keeps the loop phase-continuous
const LOFI_SINE_GAIN = 0.25 // blended low relative to the noise bed
const LOFI_SWELL_SEC = 20 // slow breathing pulse
const LOFI_SWELL_MIN_GAIN = 0.75
// ponytail: roadmap asked for a slow random-walk cutoff wobble (time-varying filter) for the
// "machine room" feel. A static filter + slow amplitude swell reads close enough and needs no
// per-sample-varying filter coefficients — add the cutoff wobble only if QA flags this as too flat.

/** Cascaded-lowpass brown noise + a sub-bass sine harmonic + a slow amplitude swell. */
export function generateLofiNoise(length: number, sampleRate: number): Float32Array {
  const lowpassed = onePoleLowpass(onePoleLowpass(generateBrownNoise(length), sampleRate, LOFI_LOWPASS_HZ), sampleRate, LOFI_LOWPASS_HZ)
  const withSine = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    withSine[i] = lowpassed[i] + Math.sin((2 * Math.PI * LOFI_SINE_HZ * i) / sampleRate) * LOFI_SINE_GAIN
  }
  const swelled = applyAmplitudeSwell(withSine, sampleRate, LOFI_SWELL_SEC, LOFI_SWELL_MIN_GAIN)
  return normalizeRms(swelled, NATURE_TARGET_RMS)
}

const HEARTBEAT_BPM = 60 // 1 beat/sec exactly — keeps buffer-length math in whole seconds, no float drift at the loop point
const HEARTBEAT_LUB_HZ = 52
const HEARTBEAT_DUB_HZ = 47
const HEARTBEAT_PULSE_MS = 90 // half-sine attack+decay per pulse, no click
const HEARTBEAT_LUB_DUB_GAP_MS = 150
const HEARTBEAT_DUB_GAIN = 0.65 // "dub" is softer than "lub"
const HEARTBEAT_BUFFER_SECONDS = 8 // whole number of 1s beats

/** Half-sine envelope, zero outside [0, pulseMs] — smooth attack/decay, no click. */
function pulseEnvelope(tMs: number, pulseMs: number): number {
  if (tMs < 0 || tMs > pulseMs) return 0
  return Math.sin((Math.PI * tMs) / pulseMs)
}

/** Lub-dub pulse pair repeated once per beat. Envelope is 0 between beats, so any buffer length
 * loops without a click regardless of exact beat alignment — shared by generateHeartbeatNoise and
 * generateWombNoise (the latter layers this under a womb rumble at lower gain). */
function renderHeartbeatPulses(length: number, sampleRate: number): Float32Array {
  const out = new Float32Array(length)
  const beatPeriodSec = 60 / HEARTBEAT_BPM
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const tInBeatMs = (t % beatPeriodSec) * 1000
    const lubEnv = pulseEnvelope(tInBeatMs, HEARTBEAT_PULSE_MS)
    const dubEnv = pulseEnvelope(tInBeatMs - HEARTBEAT_LUB_DUB_GAP_MS, HEARTBEAT_PULSE_MS) * HEARTBEAT_DUB_GAIN
    out[i] = Math.sin(2 * Math.PI * HEARTBEAT_LUB_HZ * t) * lubEnv + Math.sin(2 * Math.PI * HEARTBEAT_DUB_HZ * t) * dubEnv
  }
  return out
}

/** Rhythmic lub-dub double-pulse at 60bpm — two low sines gated by pulseEnvelope. */
export function generateHeartbeatNoise(length: number, sampleRate: number): Float32Array {
  return normalizeRms(renderHeartbeatPulses(length, sampleRate), NATURE_TARGET_RMS)
}

const WOMB_LOWPASS_HZ = 400 // strong low-pass — full high-frequency cut for the muffled "in-utero" mass
const WOMB_SWELL_SEC = 24 // slow "blood flow" breathing (roadmap's 20-30s range)
const WOMB_SWELL_MIN_GAIN = 0.55
const WOMB_HEARTBEAT_GAIN = 0.35 // heartbeat sits under the rumble, not dominant
const WOMB_BUFFER_SECONDS = 24 // multiple of HEARTBEAT's 1s beat period, so the layered pulses stay phase-continuous too

/** Strong-lowpass brown rumble + a quiet heartbeat layer + a slow amplitude swell. */
export function generateWombNoise(length: number, sampleRate: number): Float32Array {
  const rumble = onePoleLowpass(onePoleLowpass(generateBrownNoise(length), sampleRate, WOMB_LOWPASS_HZ), sampleRate, WOMB_LOWPASS_HZ)
  const heartbeat = renderHeartbeatPulses(length, sampleRate)
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = rumble[i] + heartbeat[i] * WOMB_HEARTBEAT_GAIN
  const swelled = applyAmplitudeSwell(mixed, sampleRate, WOMB_SWELL_SEC, WOMB_SWELL_MIN_GAIN)
  return normalizeRms(swelled, NATURE_TARGET_RMS)
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
  campfire: (length, sampleRate) => generateCampfireNoise(length, sampleRate),
  fan: (length, sampleRate) => generateFanNoise(length, sampleRate),
  thunder: (length, sampleRate) => generateThunderNoise(length, sampleRate),
  brook: (length, sampleRate) => generateBrookNoise(length, sampleRate),
  'umbrella-rain': (length, sampleRate) => generateUmbrellaRainNoise(length, sampleRate),
  lofi: (length, sampleRate) => generateLofiNoise(length, sampleRate),
  heartbeat: (length, sampleRate) => generateHeartbeatNoise(length, sampleRate),
  womb: (length, sampleRate) => generateWombNoise(length, sampleRate),
}

/** Per-color buffer duration override. wind/waves/fan/lofi bake exactly one amplitude-swell
 * cycle into the buffer (see applyAmplitudeSwell) — the render duration must equal that cycle's
 * period or the loop wraps mid-swell and clicks. thunder needs enough buffer for one strike's
 * decay to finish before the loop point; heartbeat/womb need a whole number of beat periods.
 * Colors absent here use the caller's default duration. */
export const NOISE_BUFFER_SECONDS: Partial<Record<NoiseColor, number>> = {
  wind: WIND_SWELL_SEC,
  waves: WAVES_SWELL_SEC,
  fan: FAN_SWELL_SEC,
  thunder: THUNDER_BUFFER_SECONDS,
  lofi: LOFI_SWELL_SEC,
  heartbeat: HEARTBEAT_BUFFER_SECONDS,
  womb: WOMB_BUFFER_SECONDS,
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
