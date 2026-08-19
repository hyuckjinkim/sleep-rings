// Pure noise-color sample generators + AudioBuffer rendering. No realtime DSP/AudioWorklet —
// noise is a stationary signal, so a long pre-rendered loop (~10s) is enough to be inaudible
// as a repeat. See docs/design/audio-engine.md §3.
import type { NoiseColor } from '../data/types'
import type { EngineAudioBuffer } from './web-audio-types'

// generateWhiteNoise/generatePinkNoise/generateBrownNoise/generateGreenNoise below are also used
// as raw *ingredients* inside composite generators further down (e.g. campfire = brown rumble +
// white-derived crackle; lofi = brown + a fixed-amplitude sine; birds = green bed + independently-
// scaled chirps). Rescaling a single-source chain before its own final normalizeRms is a no-op
// (crest factor is scale-invariant), but rescaling one of *several summed* layers is not — it
// shifts the mix's relative balance and can push a composite's crest factor past the clip clamp
// (verified: switching generateBrownNoise's own normalization to MASTER_TARGET_RMS quietly made
// campfire's rumble bed ~40% quieter relative to its crackle layer, and campfire's clamp rate went
// from 5/30 to 30/30 in a since-reverted attempt). So these four keep their original normalization
// unchanged, and a `*Rms` wrapper below re-targets loudness only for the top-level GENERATORS
// entry that plays each color standalone (see the "white"/"pink"/"brown"/"green" GENERATORS map).
export function generateWhiteNoise(length: number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) out[i] = Math.random() * 2 - 1
  return out
}

/** RMS-matched to the shared master target — what the catalog's "white" color actually plays.
 * The raw generator above skips normalization entirely, so played back at RMS~0.577 (peak pinned
 * at ~1.0, no headroom) while every other color sat at MASTER_TARGET_RMS (sound-craft.md §1:
 * "white" was +13.6dB louder than everything else, the single biggest loudness-consistency
 * offender). */
function generateWhiteNoiseRms(length: number): Float32Array {
  return normalizeRms(generateWhiteNoise(length), MASTER_TARGET_RMS)
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

function generatePinkNoiseRms(length: number): Float32Array {
  return normalizeRms(generatePinkNoise(length), MASTER_TARGET_RMS)
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

function generateBrownNoiseRms(length: number): Float32Array {
  return normalizeRms(generateBrownNoise(length), MASTER_TARGET_RMS)
}

/** Pink noise with a midrange (~500Hz) emphasis. No standardized "green noise" spectrum exists
 * (design doc §8.5) — this is an approximation via cascaded one-pole low/high-pass filters. */
export function generateGreenNoise(length: number, sampleRate: number): Float32Array {
  const pink = generatePinkNoise(length)
  const lowpassed = onePoleLowpass(pink, sampleRate, 2000)
  const bandpassed = onePoleHighpass(lowpassed, sampleRate, 150)
  return normalize(bandpassed)
}

function generateGreenNoiseRms(length: number, sampleRate: number): Float32Array {
  return normalizeRms(generateGreenNoise(length, sampleRate), MASTER_TARGET_RMS)
}

const PEAK_TARGET = 0.9

function normalize(samples: Float32Array): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  if (peak === 0) return samples
  const scale = PEAK_TARGET / peak
  for (let i = 0; i < samples.length; i++) samples[i] *= scale
  return samples
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

// Shared loudness target for all 22 synth colors (and, scaled for equal-loudness, the 3 binaural
// tones in binaural.ts — see its MASTER_TARGET_RMS import). Originally only the 18
// swell/jitter/trigger "nature" generators used this; white/pink/brown/green instead used a
// peak-normalize (target peak 0.9), which put them at RMS~0.19-0.58 — up to +13.6dB louder than
// everything else (sound-craft.md §1: white noise had no normalization at all and stayed pinned
// near 0dBFS). That meant layering e.g. rain + white in the mixer buried the rain. All 22 colors
// now route through normalizeRms(MASTER_TARGET_RMS) so relative loudness in a mix is consistent;
// 0.12 was chosen (rather than derived from a peak target) because:
// 1. wind/waves/etc. layer an amplitude swell on top (applyRandomWalkSwell) — a loud "crash"
//    moment and a near-silent trough in the *same* buffer gives them a much higher crest factor
//    (~7-7.5, measured via a 25-trial Monte Carlo sweep) than static-texture rain/stream (~3.5).
//    A higher shared target forces normalizeRms's clip-safety clamp to fire for the swell-modulated
//    colors, and since the clamp scales down by whatever peak the noise happened to hit that
//    render, the resulting RMS becomes non-deterministic instead of landing on target.
// 0.12 keeps every generator (including the swell-modulated ones) comfortably under the clamp
// threshold — 0/25 clamp triggers in that sweep — so normalizeRms always lands exactly on target.
export const MASTER_TARGET_RMS = 0.12

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

/** Cascade the same one-pole filter `stages` times for a steeper rolloff (-6dB/oct per stage —
 * 3 stages ≈ -18dB/oct). The original single-pole rain highpass/stream bandpass/wind lowpass etc.
 * leaked ~45-90% of their "excluded" band through (sound-craft.md §1-3: e.g. stream's 3000Hz
 * lowpass left 44.7% of its energy above 4kHz) — a real one-pole filter's skirt is just that
 * gentle. Cascading is the cheap fix: same primitive, called repeatedly, no new filter design. */
function cascadeLowpass(input: Float32Array, sampleRate: number, cutoffHz: number, stages: number): Float32Array {
  let out = input
  for (let s = 0; s < stages; s++) out = onePoleLowpass(out, sampleRate, cutoffHz)
  return out
}

function cascadeHighpass(input: Float32Array, sampleRate: number, cutoffHz: number, stages: number): Float32Array {
  let out = input
  for (let s = 0; s < stages; s++) out = onePoleHighpass(out, sampleRate, cutoffHz)
  return out
}

const CASCADE_STAGES = 3 // -18dB/oct, within sound-craft.md §3-A's -18~-24dB/oct target

// Softens the harshest top octave for night listening without removing brightness outright — real
// rain recordings *are* bright at 6-8kHz (sound-craft.md §2), so the fix is a shelf, not a hard
// cut. Applied as a final pre-normalize pass on the sounds sound-craft.md §1-4 flagged as
// front-loaded above 2kHz (rain family, stream/brook, crickets — birds was tried and reverted, see
// its generator for why); the four base noise colors
// keep their raw spectra so "pink"/"brown"/"green" stay recognizably themselves (§3's guidance).
// ponytail: the doc's illustrative "-5dB, atten 0.55" starting point turned out too weak to move
// the needle — a highpassed-white-noise generator (rain's design) has ~90% of its total energy
// above 4kHz by simple Hz-bandwidth arithmetic (1500-24000Hz is mostly above 4kHz), so a shelf has
// to cut hard to make a visible dent. Measured on rain via a local Welch-PSD sweep (see PR notes):
// atten 0.55 barely moved the 4kHz+ energy ratio (93.7%->90.1%); atten 0.15 with a 2-stage knee
// gets it to ~67%, a real audible softening while still leaving a meaningful (not brick-walled)
// high band — doc's literal 40-50% target would require darkening rain enough to contradict its
// own "don't remove the brightness, real rain has it too" guidance (§2), so this settles short of
// that number on purpose.
const NIGHT_SHELF_HZ = 5500
const NIGHT_SHELF_ATTEN = 0.15 // linear gain on content above the shelf, ~-16.5dB
const NIGHT_SHELF_KNEE_STAGES = 2 // cascaded split filter for a steeper (not just gentler) knee

function applyNightShelf(input: Float32Array, sampleRate: number): Float32Array {
  const lowpassed = cascadeLowpass(input, sampleRate, NIGHT_SHELF_HZ, NIGHT_SHELF_KNEE_STAGES)
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const high = input[i] - lowpassed[i]
    out[i] = lowpassed[i] + high * NIGHT_SHELF_ATTEN
  }
  return out
}

/** Random-walk tremolo/swell: a chain of trough-to-trough cosine "humps," each with its own
 * jittered period (avgPeriodSec ± 30%) and jittered depth (baseMinGain ± minGainJitter), instead
 * of one fixed-period cos() LFO. The old design rendered exactly one LFO cycle per buffer so
 * cos(0) === cos(2π) made the loop phase-continuous for free — but that also meant the buffer
 * *was* the swell, so it repeated identically every single cycle (sound-craft.md §1-2: fan's 1.6s
 * swell period made the loop obvious within seconds). Each hump here still starts and ends exactly
 * at its own trough, so chaining them preserves the same click-free loop-seam trick while the
 * shape itself never repeats — callers now also render a buffer several cycles long (see
 * NOISE_BUFFER_SECONDS) so no two loop iterations sound alike. Same "slow non-periodic drift" idea
 * as myNoise.net's Animation mode (sound-craft.md §2), simplified to whole-cycle jitter rather than
 * a continuous breakpoint interpolator — still non-repeating, no extra state to manage.
 * ponytail: forcing every cycle (not just the last) to size itself from its own rounded sample
 * count is what keeps this a one-pass loop instead of a two-pass rescale — simpler, same guarantee. */
function applyRandomWalkSwell(input: Float32Array, sampleRate: number, avgPeriodSec: number, baseMinGain: number, minGainJitter: number): Float32Array {
  const length = input.length
  const avgPeriodSamples = avgPeriodSec * sampleRate
  const out = new Float32Array(length)
  let pos = 0
  while (pos < length) {
    const remaining = length - pos
    // Force the final cycle to consume exactly what's left so it still ends on a trough at the
    // buffer boundary — otherwise a jittered period could overshoot past `length`.
    const cycleSamples = remaining < avgPeriodSamples * 1.5 ? remaining : Math.round(avgPeriodSamples * (0.7 + Math.random() * 0.6))
    const minGain = Math.min(0.95, Math.max(0, baseMinGain + (Math.random() * 2 - 1) * minGainJitter))
    const omega = (2 * Math.PI) / cycleSamples
    for (let local = 0; local < cycleSamples; local++, pos++) {
      const swell = minGain + (1 - minGain) * (0.5 - 0.5 * Math.cos(omega * local))
      out[pos] = input[pos] * swell
    }
  }
  return out
}

// Loop-seam treatment for every generator's buffer (see renderNoiseBuffer). Even with swell
// envelopes trough-aligned at the loop point (applyRandomWalkSwell) and heartbeat/womb/train's
// envelope-zero design, the *raw* filtered noise underneath a swell's trough (or thunder's rumble
// floor) is still two statistically unrelated samples at the wrap — audio.md's loop-seam
// measurement found thunder's wrap jump 74x its typical sample-to-sample delta.
//
// Fading both ends to zero also removes that click, but it replaces it with a hole: measured at
// -20dB (white/rain) to -32dB (wind) in the 5ms window straddling the wrap, i.e. an audible
// dropout every loop. Buffer length doesn't help — it sets how *often* the hole recurs, not how
// deep it is. So the tail is crossfaded back over the head instead, which is continuous AND
// level-flat: the generator renders CROSSFADE extra samples, and those become the fade-out partner
// for the first CROSSFADE samples of the loop.
//
// Kept short on purpose. The crossfade ramps the head in, so anything percussive sitting at sample
// 0 (singing-bowl's mallet strike, heartbeat's first beat) has its attack softened by exactly this
// much — and those buffers hold one strike each, so a long fade would dull every strike the user
// ever hears. The seam discontinuity itself is only a few samples wide, so a few ms is all it
// takes to remove; length buys nothing here, the equal-power *shape* below is what keeps the level
// flat.
const LOOP_CROSSFADE_MS = 15

/**
 * Fold `rendered`'s extra tail over its head so `length` samples loop seamlessly.
 *
 * out[i<n] = head[i]*sqrt(t) + tail[i]*sqrt(1-t), out[i>=n] = rendered[i]. The wrap then joins
 * out[length-1] (= rendered[length-1]) to out[0] (= rendered[length]) — adjacent samples of one
 * continuous render, so there is nothing to click on.
 *
 * Equal-power (sqrt) weights, not linear: the two sides are statistically independent noise, which
 * sums in power rather than amplitude, so linear weights would still dip 3dB mid-crossfade. The
 * cost is the mirror case — phase-coherent content (train's click train, singing-bowl's tone) is
 * correlated across the seam and gains up to 3dB instead — over a window this short that reads as
 * texture, not a pulse. See noise.test.ts for the measured worst case.
 */
function crossfadeLoop(rendered: Float32Array, length: number): Float32Array {
  const n = rendered.length - length
  const out = rendered.subarray(0, length) // shares storage; the tail we read from sits past `length`
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    out[i] = rendered[i] * Math.sqrt(t) + rendered[length + i] * Math.sqrt(1 - t)
  }
  return out
}

// Strips rumble below the patter/hiss register; broadband white above it already reads as rain.
const RAIN_HIGHPASS_HZ = 1500
const RAIN_JITTER_HOLD_MS = 8 // ~125 droplet-density updates/sec — texture, not a buzz
const RAIN_JITTER_GAIN: [number, number] = [0.5, 1.4]

/** Highpassed white noise + droplet-density jitter. */
export function generateRainNoise(length: number, sampleRate: number): Float32Array {
  const highpassed = cascadeHighpass(generateWhiteNoise(length), sampleRate, RAIN_HIGHPASS_HZ, CASCADE_STAGES)
  const textured = applyJitterTexture(highpassed, sampleRate, RAIN_JITTER_HOLD_MS, ...RAIN_JITTER_GAIN)
  const shelved = applyNightShelf(textured, sampleRate)
  return normalizeRms(shelved, MASTER_TARGET_RMS)
}

const WIND_LOWPASS_HZ = 500 // mid of the 200-800Hz "gust" band; brown noise is already bass-heavy
const WIND_SWELL_SEC = 12 // average gust cycle, within the 8-16s gust range (now jittered ±30% per cycle)
const WIND_SWELL_MIN_GAIN = 0.35 // gusts ease off, they don't go silent (±0.1 jitter per cycle)
const WIND_BUFFER_SECONDS = 60 // ~5 randomized gust cycles baked in, vs. the old single fixed cycle

/** Lowpassed brown noise + a random-walk amplitude swell (the "gust" feel, no two gusts alike). */
export function generateWindNoise(length: number, sampleRate: number): Float32Array {
  const lowpassed = cascadeLowpass(generateBrownNoise(length), sampleRate, WIND_LOWPASS_HZ, CASCADE_STAGES)
  const swelled = applyRandomWalkSwell(lowpassed, sampleRate, WIND_SWELL_SEC, WIND_SWELL_MIN_GAIN, 0.1)
  return normalizeRms(swelled, MASTER_TARGET_RMS)
}

const WAVES_SWELL_SEC = 6 // average wave-rhythm period (4-8s), jittered ±30% per cycle
const WAVES_SWELL_MIN_GAIN = 0.12 // a wave recedes almost to silence before the next crash (±0.05 jitter)
const WAVES_BUFFER_SECONDS = 48 // ~8 randomized wave cycles baked in

/** Brown noise + a random-walk deep swell (crash/recede), distinct from wind's shallower tremolo. */
export function generateWavesNoise(length: number, sampleRate: number): Float32Array {
  const swelled = applyRandomWalkSwell(generateBrownNoise(length), sampleRate, WAVES_SWELL_SEC, WAVES_SWELL_MIN_GAIN, 0.05)
  return normalizeRms(swelled, MASTER_TARGET_RMS)
}

const STREAM_BANDPASS_LOW_HZ = 800
const STREAM_BANDPASS_HIGH_HZ = 3000
const STREAM_BUBBLE_HOLD_MS = 4 // denser/faster than rain's droplets — babbling texture
const STREAM_BUBBLE_GAIN: [number, number] = [0.4, 1.5]

/** Bandpassed (800-3000Hz) white noise + bubble-density jitter, static (no swell) like a
 * steady brook rather than a gusting/crashing sound. */
export function generateStreamNoise(length: number, sampleRate: number): Float32Array {
  const band = cascadeHighpass(cascadeLowpass(generateWhiteNoise(length), sampleRate, STREAM_BANDPASS_HIGH_HZ, CASCADE_STAGES), sampleRate, STREAM_BANDPASS_LOW_HZ, CASCADE_STAGES)
  const textured = applyJitterTexture(band, sampleRate, STREAM_BUBBLE_HOLD_MS, ...STREAM_BUBBLE_GAIN)
  const shelved = applyNightShelf(textured, sampleRate)
  return normalizeRms(shelved, MASTER_TARGET_RMS)
}

// --- B1 (v0.3.0): 8 synth sounds added on top of the 4 nature generators above. Same 3
// primitives (filter/swell/jitter) plus two new ones: applyImpulseBursts (sparse random pops —
// campfire) and applyEnvelopeStrike (single slow attack/decay hit — thunder). All share
// MASTER_TARGET_RMS; see docs/roadmap-v030.md §1 for the design brief and
// .omc/research/platform-capabilities.md §2 for the synthesis rationale per sound.

const CAMPFIRE_RUMBLE_LOWPASS_HZ = 300 // bass rumble bed, well below the crackle band
const CAMPFIRE_CRACKLE_HIGHPASS_HZ = 2000 // isolates the "pop" transient from the rumble
const CAMPFIRE_POP_RATE_PER_SEC = 2 // average pop events/sec (Poisson-ish per-sample trigger)
const CAMPFIRE_POP_DECAY_MS = 20 // fast decay after each pop — a "tak", not a ring
const CAMPFIRE_POP_ATTACK_MS = 3 // softens the 0-sample snap into a "tak", not a digital click (sound-craft.md §1-6/§E)
const CAMPFIRE_POP_GAIN = 1.0

/** Sparse random impulse envelope: each sample has a small trigger probability that starts a
 * linear rise to 1 over `attackMs` (default 0 = the original instant snap) followed by an
 * exponential decay — a cheap stand-in for discrete pop/crackle transients. A true 0-sample
 * attack reads as a "digital pop" rather than an organic tak/chirp/splash (sound-craft.md §1-6);
 * a few ms of attack removes that without changing the decay shape. Crest factor is high and
 * random-seed-dependent, which risks tripping normalizeRms's clip clamp non-deterministically (E3
 * §7 lesson) — rate/decay/gain at each call site were tuned via a 25-trial Monte Carlo sweep to
 * land within the RMS target band on every trial without clamping. Bare envelope (not applied to
 * a signal) so tone-based callers (e.g. cricket chirps) can drive a sine instead of gating noise —
 * see generateCricketsNoise/generateBlizzardNoise. */
function triggerDecayEnvelope(length: number, sampleRate: number, ratePerSec: number, decayMs: number, attackMs = 0): Float32Array {
  const out = new Float32Array(length)
  const decaySamples = (decayMs / 1000) * sampleRate
  const decayRate = Math.exp(-1 / decaySamples)
  const triggerProb = ratePerSec / sampleRate
  const attackSamples = Math.max(1, Math.round((attackMs / 1000) * sampleRate))
  let envelope = 0
  let attackFrom = 0
  let attackStep = -1 // -1 = no attack ramp in progress
  for (let i = 0; i < length; i++) {
    const triggered = Math.random() < triggerProb
    if (triggered) {
      if (attackMs > 0) {
        attackFrom = envelope // ramp up from wherever the envelope currently sits — a realistic mid-decay retrigger
        attackStep = 0
      } else {
        envelope = 1 // original instant-snap behavior, unchanged when no attack is requested
      }
    }
    if (attackStep >= 0) {
      attackStep++
      envelope = attackFrom + (1 - attackFrom) * (attackStep / attackSamples)
      if (attackStep >= attackSamples) attackStep = -1 // ramp complete; decay from the next sample
    } else if (!triggered) {
      envelope *= decayRate
    }
    out[i] = envelope
  }
  return out
}

function applyImpulseBursts(input: Float32Array, sampleRate: number, ratePerSec: number, decayMs: number, gain: number, attackMs = 0): Float32Array {
  const envelope = triggerDecayEnvelope(input.length, sampleRate, ratePerSec, decayMs, attackMs)
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) out[i] = input[i] * envelope[i] * gain
  return out
}

/** Brown rumble bed + sparse highpassed crackle bursts. */
export function generateCampfireNoise(length: number, sampleRate: number): Float32Array {
  const rumble = onePoleLowpass(generateBrownNoise(length), sampleRate, CAMPFIRE_RUMBLE_LOWPASS_HZ)
  const crackleBase = onePoleHighpass(generateWhiteNoise(length), sampleRate, CAMPFIRE_CRACKLE_HIGHPASS_HZ)
  const crackle = applyImpulseBursts(crackleBase, sampleRate, CAMPFIRE_POP_RATE_PER_SEC, CAMPFIRE_POP_DECAY_MS, CAMPFIRE_POP_GAIN, CAMPFIRE_POP_ATTACK_MS)
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = rumble[i] + crackle[i]
  return normalizeRms(mixed, MASTER_TARGET_RMS)
}

const FAN_LOWPASS_HZ = 650 // narrow "ventilation hum" band, cascaded for a steeper rolloff than wind
const FAN_SWELL_SEC = 1.6 // average blade-rotation pulse, much quicker than wind's gusts (jittered ±30% per cycle)
const FAN_SWELL_MIN_GAIN = 0.85 // barely perceptible pulse — steady hum, not gusting (±0.05 jitter)
const FAN_BUFFER_SECONDS = 48 // ~30 randomized pulse cycles — was a single 1.6s cycle, the worst repeat offender (sound-craft.md §4 #1)

/** Cascaded-lowpass white noise + a fast, shallow random-walk swell (blade rotation feel). */
export function generateFanNoise(length: number, sampleRate: number): Float32Array {
  const cascaded = cascadeLowpass(generateWhiteNoise(length), sampleRate, FAN_LOWPASS_HZ, CASCADE_STAGES)
  const swelled = applyRandomWalkSwell(cascaded, sampleRate, FAN_SWELL_SEC, FAN_SWELL_MIN_GAIN, 0.05)
  return normalizeRms(swelled, MASTER_TARGET_RMS)
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
  return normalizeRms(struck, MASTER_TARGET_RMS)
}

const BROOK_BUBBLE_HOLD_MS = 2 // denser than stream's 4ms — faster "여울" (riffle) gurgle
const BROOK_BUBBLE_GAIN: [number, number] = [0.3, 1.7]

/** Same 800-3000Hz bandpass as generateStreamNoise, just a denser bubble-jitter preset. */
export function generateBrookNoise(length: number, sampleRate: number): Float32Array {
  const band = cascadeHighpass(cascadeLowpass(generateWhiteNoise(length), sampleRate, STREAM_BANDPASS_HIGH_HZ, CASCADE_STAGES), sampleRate, STREAM_BANDPASS_LOW_HZ, CASCADE_STAGES)
  const textured = applyJitterTexture(band, sampleRate, BROOK_BUBBLE_HOLD_MS, ...BROOK_BUBBLE_GAIN)
  const shelved = applyNightShelf(textured, sampleRate)
  return normalizeRms(shelved, MASTER_TARGET_RMS)
}

const UMBRELLA_RESONANCE_LOW_HZ = 300 // narrow band under the resonance a taut surface (umbrella/tent) adds to rain
const UMBRELLA_RESONANCE_HIGH_HZ = 600
const UMBRELLA_RESONANCE_GAIN = 0.6 // mixed under the hiss layer, not overpowering it

/** Rain's highpassed-hiss layer + a second bandpassed "tap" texture layer for the surface
 * resonance. The two jitter layers are independently randomized rather than phase-locked — an
 * intentional simplification, not a synced impact model. */
export function generateUmbrellaRainNoise(length: number, sampleRate: number): Float32Array {
  const hiss = applyJitterTexture(cascadeHighpass(generateWhiteNoise(length), sampleRate, RAIN_HIGHPASS_HZ, CASCADE_STAGES), sampleRate, RAIN_JITTER_HOLD_MS, ...RAIN_JITTER_GAIN)
  const resonanceBand = onePoleHighpass(onePoleLowpass(generateWhiteNoise(length), sampleRate, UMBRELLA_RESONANCE_HIGH_HZ), sampleRate, UMBRELLA_RESONANCE_LOW_HZ)
  const resonance = applyJitterTexture(resonanceBand, sampleRate, RAIN_JITTER_HOLD_MS, ...RAIN_JITTER_GAIN)
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = hiss[i] + resonance[i] * UMBRELLA_RESONANCE_GAIN
  const shelved = applyNightShelf(mixed, sampleRate)
  return normalizeRms(shelved, MASTER_TARGET_RMS)
}

const LOFI_LOWPASS_HZ = 150 // narrow "machine room" hum band
const LOFI_SINE_HZ = 55 // sub-bass harmonic under the noise floor; integer Hz keeps the loop phase-continuous
const LOFI_SINE_GAIN = 0.25 // blended low relative to the noise bed
const LOFI_SWELL_SEC = 20 // average slow breathing pulse (jittered ±30% per cycle)
const LOFI_SWELL_MIN_GAIN = 0.75
const LOFI_BUFFER_SECONDS = 60 // ~3 randomized breathing cycles; whole seconds keeps LOFI_SINE_HZ phase-continuous at the loop point
// ponytail: roadmap asked for a slow random-walk cutoff wobble (time-varying filter) for the
// "machine room" feel. A static filter + random-walk amplitude swell reads close enough and needs
// no per-sample-varying filter coefficients — add the cutoff wobble only if QA flags this as too flat.

/** Cascaded-lowpass brown noise + a sub-bass sine harmonic + a random-walk amplitude swell. */
export function generateLofiNoise(length: number, sampleRate: number): Float32Array {
  const lowpassed = cascadeLowpass(generateBrownNoise(length), sampleRate, LOFI_LOWPASS_HZ, CASCADE_STAGES)
  const withSine = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    withSine[i] = lowpassed[i] + Math.sin((2 * Math.PI * LOFI_SINE_HZ * i) / sampleRate) * LOFI_SINE_GAIN
  }
  const swelled = applyRandomWalkSwell(withSine, sampleRate, LOFI_SWELL_SEC, LOFI_SWELL_MIN_GAIN, 0.1)
  return normalizeRms(swelled, MASTER_TARGET_RMS)
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
  return normalizeRms(renderHeartbeatPulses(length, sampleRate), MASTER_TARGET_RMS)
}

const WOMB_LOWPASS_HZ = 400 // strong low-pass — full high-frequency cut for the muffled "in-utero" mass
const WOMB_SWELL_SEC = 24 // average slow "blood flow" breathing (roadmap's 20-30s range, jittered ±30% per cycle)
const WOMB_SWELL_MIN_GAIN = 0.55
const WOMB_HEARTBEAT_GAIN = 0.35 // heartbeat sits under the rumble, not dominant
const WOMB_BUFFER_SECONDS = 72 // ~3 randomized breathing cycles; whole seconds keeps the layered heartbeat's 1s beat period phase-continuous

/** Strong-lowpass brown rumble + a quiet heartbeat layer + a random-walk amplitude swell. */
export function generateWombNoise(length: number, sampleRate: number): Float32Array {
  const rumble = cascadeLowpass(generateBrownNoise(length), sampleRate, WOMB_LOWPASS_HZ, CASCADE_STAGES)
  const heartbeat = renderHeartbeatPulses(length, sampleRate)
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = rumble[i] + heartbeat[i] * WOMB_HEARTBEAT_GAIN
  const swelled = applyRandomWalkSwell(mixed, sampleRate, WOMB_SWELL_SEC, WOMB_SWELL_MIN_GAIN, 0.1)
  return normalizeRms(swelled, MASTER_TARGET_RMS)
}

// --- Premium synth batch (v0.3.1): 6 more sounds for the 10,000원 tier, which otherwise has zero
// working content (its 3 file-based sounds are asset-unavailable — docs/plan-tiers.md §1). Same
// primitives as B1 above, plus two new ones: a stateful FM-chirp voice (birds) and
// triggerDecayEnvelope reused to drive tones instead of noise (crickets/blizzard sparkle).

const BIRDS_BED_GAIN = 0.15 // quiet green-noise forest hush under the chirps, not the main event
const BIRDS_CHIRP_RATE_PER_SEC = 0.9 // sparse individual calls — crickets owns the dense chorus
const BIRDS_CHIRP_MIN_MS = 120
const BIRDS_CHIRP_MAX_MS = 280
const BIRDS_CHIRP_BASE_HZ = 2200
const BIRDS_CHIRP_RANDOM_HZ = 800 // per-chirp base randomized within [BASE, BASE+RANDOM]
const BIRDS_CHIRP_SWEEP_HZ = 2600 // upward FM sweep range over the chirp's length
const BIRDS_CHIRP_SWEEP_RANDOM = 0.6 // sweep depth randomized to 60-120% of SWEEP_HZ
const BIRDS_CHIRP_VIBRATO_HZ = 35 // fast trill within each chirp
const BIRDS_CHIRP_VIBRATO_DEPTH_HZ = 300

/** Sparse FM-chirp voice: each trigger starts a short (120-280ms) tone whose instantaneous
 * frequency sweeps upward and trills (vibrato), shaped by a rise/fall envelope that is exactly 0
 * at both ends of the chirp — bird calls, not noise-gated impulses like campfire's crackle. New
 * chirps are refused within the last chirp's max length of the buffer end so every triggered
 * chirp fully completes before the loop point (no wraparound click). */
export function generateBirdsNoise(length: number, sampleRate: number): Float32Array {
  const bed = generateGreenNoise(length, sampleRate)
  const chirps = new Float32Array(length)
  const triggerProb = BIRDS_CHIRP_RATE_PER_SEC / sampleRate
  const maxChirpSamples = Math.ceil((BIRDS_CHIRP_MAX_MS / 1000) * sampleRate)
  let active = false
  let chirpStart = 0
  let chirpLenSamples = 0
  let chirpBaseHz = 0
  let chirpSweepHz = 0
  let chirpPhase = 0
  for (let i = 0; i < length; i++) {
    if (!active && i < length - maxChirpSamples && Math.random() < triggerProb) {
      active = true
      chirpStart = i
      chirpLenSamples = Math.floor(((BIRDS_CHIRP_MIN_MS + Math.random() * (BIRDS_CHIRP_MAX_MS - BIRDS_CHIRP_MIN_MS)) / 1000) * sampleRate)
      chirpBaseHz = BIRDS_CHIRP_BASE_HZ + Math.random() * BIRDS_CHIRP_RANDOM_HZ
      chirpSweepHz = BIRDS_CHIRP_SWEEP_HZ * (BIRDS_CHIRP_SWEEP_RANDOM + Math.random() * BIRDS_CHIRP_SWEEP_RANDOM)
      chirpPhase = 0
    }
    if (active) {
      const tIn = i - chirpStart
      const frac = tIn / chirpLenSamples
      if (frac >= 1) {
        active = false
      } else {
        const instFreq = chirpBaseHz + chirpSweepHz * frac + Math.sin((2 * Math.PI * BIRDS_CHIRP_VIBRATO_HZ * tIn) / sampleRate) * BIRDS_CHIRP_VIBRATO_DEPTH_HZ
        chirpPhase += (2 * Math.PI * instFreq) / sampleRate
        chirps[i] = Math.sin(chirpPhase) * Math.sin(Math.PI * frac)
      }
    }
  }
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = bed[i] * BIRDS_BED_GAIN + chirps[i]
  // ponytail: tried applyNightShelf here too (sound-craft.md §B lists birds as a target), but
  // reverted it — the chirp's FM sweep reaches up into the shelf's cut band unevenly (its envelope
  // peaks mid-chirp, well below the shelf point, while the sweep's *tail* is what gets attenuated),
  // which lowers the mix's RMS without lowering its peak by the same amount. That raises crest
  // factor: a 150-trial sweep went from 2/150 clip-safety-clamp triggers (worst RMS 84.8% of
  // target) to 16/150 (worst 57.1%) with the shelf applied — a real regression, not noise. Birds'
  // chirp band is narrow and mostly tonal rather than a broadband hiss, so it isn't the "harsh
  // static top end" case the shelf was built for anyway.
  return normalizeRms(mixed, MASTER_TARGET_RMS)
}

const TRAIN_RUMBLE_LOWPASS_HZ = 180 // deep rolling-wheel rumble, below the click band
const TRAIN_CLICK_HIGHPASS_HZ = 2500 // isolates the rail-joint "clack" transient
const TRAIN_CLICK_PERIOD_SEC = 1.2 // one wheelset pass per period (clickety-clack tempo)
const TRAIN_CLICK_GAP_MS = 140 // gap between the two clicks in a "clickety-clack" pair
const TRAIN_CLICK_PULSE_MS = 18 // short percussive click, not a ring
const TRAIN_CLACK_GAIN = 0.75 // second click ("clack") slightly softer than the first ("clickety")
const TRAIN_BUFFER_SECONDS = 12 // whole multiple of TRAIN_CLICK_PERIOD_SEC (10 periods) -> phase-continuous loop
// The click is highpassed *random* white noise, so its raw peak (and therefore the mix's overall
// crest factor) varies every render — audio.md measured a clip-safety-clamp trigger rate up to
// 67% across 30 renders, knocking the achieved RMS as much as -12.5% under target on the clamped
// ones. Unlike the rumble bed (deterministic broadband noise, doesn't spike), the click is exactly
// the part responsible for the spike, so trimming its own gain lowers the mix's crest factor
// directly instead of just rescaling everything (rescaling before normalizeRms is a no-op — it
// re-targets RMS regardless of the input's absolute level, see MASTER_TARGET_RMS comment above).
// The clamp that motivated cutting this layer turned out to be an artifact of an intermediate
// state, not of the click gain: while generateBrownNoise was temporarily RMS-normalized (the
// campfire regression, reverted — see the note above generateWhiteNoise), the rumble bed was ~7x
// quieter, so the clicks alone set the peak and the clamp fired constantly. With brown back on its
// original peak normalization the bed carries the level again: re-measured at the original 0.65,
// the clamp fires 0/60 renders at 48kHz (max peak 0.90) and 0/20 at 44.1kHz (0.84). Cutting the
// clicks to 0.2 would have cost ~10dB of the clickety-clack that defines this sound for a clip
// risk that no longer exists.
const TRAIN_CLICK_GAIN = 0.65

/** Lowpassed brown rumble bed + a deterministic "clickety-clack" rail-joint pair every
 * TRAIN_CLICK_PERIOD_SEC, reusing pulseEnvelope (same half-sine click shape as heartbeat's
 * lub-dub). Deterministic and periodic, unlike the random-trigger textures above, so the buffer
 * loops exactly with no seed-dependent risk. */
export function generateTrainNoise(length: number, sampleRate: number): Float32Array {
  const rumble = onePoleLowpass(generateBrownNoise(length), sampleRate, TRAIN_RUMBLE_LOWPASS_HZ)
  const clickBase = onePoleHighpass(generateWhiteNoise(length), sampleRate, TRAIN_CLICK_HIGHPASS_HZ)
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const tInPeriodMs = (t % TRAIN_CLICK_PERIOD_SEC) * 1000
    const clickEnv = pulseEnvelope(tInPeriodMs, TRAIN_CLICK_PULSE_MS)
    const clackEnv = pulseEnvelope(tInPeriodMs - TRAIN_CLICK_GAP_MS, TRAIN_CLICK_PULSE_MS) * TRAIN_CLACK_GAIN
    mixed[i] = rumble[i] + clickBase[i] * (clickEnv + clackEnv) * TRAIN_CLICK_GAIN
  }
  return normalizeRms(mixed, MASTER_TARGET_RMS)
}

const BOWL_FUNDAMENTAL_HZ = 220
const BOWL_STRIKE_PERIOD_SEC = 6 // gentle repeated mallet strikes
// Fast mallet strike, but not instant: 0.02s made all 5 partials rise in near-lockstep, so their
// peaks summed constructively into crest factor 9.07 — high enough that normalizeRms's clip clamp
// fired on every single render (audio.md: 30/30, -8.2% under target every time, a structural
// issue rather than a random-seed one since this generator has no RNG at all). Spreading the
// attack staggers that constructive peak; swept for the shortest value that actually clears the
// clamp, since a mallet strike is the one thing in this catalog that should still sound struck:
// 0.02s clamps, 0.03s clears it with only 2% headroom, 0.04s lands at peak 0.96 (48kHz) / 0.96
// (44.1kHz) with the target RMS intact. Longer (0.06s) buys headroom nobody needs on a generator
// with no RNG, at the cost of softening every strike the user hears
// (sound-craft.md §1-6/§4 #5: "BOWL_PARTIALS의 게인 합/피크 자체를 낮춰야").
const BOWL_ATTACK_SEC = 0.04
const BOWL_BUFFER_SECONDS = BOWL_STRIKE_PERIOD_SEC // one strike baked per loop, like wind/waves' swell-period buffers
// Partial ratios/decays: each pair is detuned a few percent from its partner so the two beat
// against each other (the "비팅" texture) — a lighter stand-in for real banded-waveguide bowl
// synthesis (.omc/research/platform-capabilities.md flagged that as high-effort). decaySec values
// are chosen so every partial has decayed to <1% of peak well before BOWL_STRIKE_PERIOD_SEC, so
// the loop point lands on near-silence with no click regardless of the sine's absolute phase there
// (same "envelope is ~0 at the seam" reasoning as heartbeat/womb above).
const BOWL_PARTIALS: ReadonlyArray<{ ratio: number; gain: number; decaySec: number }> = [
  { ratio: 1, gain: 1, decaySec: 1.0 },
  { ratio: 1.018, gain: 0.85, decaySec: 1.0 }, // ~4Hz beat against the fundamental
  { ratio: 2.76, gain: 0.4, decaySec: 0.7 }, // inharmonic overtone typical of a struck metal bowl
  { ratio: 2.78, gain: 0.32, decaySec: 0.7 }, // ~4.4Hz beat against the overtone above
  { ratio: 5.41, gain: 0.15, decaySec: 0.35 }, // bright shimmer, decays fastest
]

function bowlPartialEnvelope(tInPeriodSec: number, decaySec: number): number {
  if (tInPeriodSec < BOWL_ATTACK_SEC) return tInPeriodSec / BOWL_ATTACK_SEC
  return Math.exp(-(tInPeriodSec - BOWL_ATTACK_SEC) / decaySec)
}

/** Struck singing bowl: a handful of detuned sine partials, each with its own decaying envelope,
 * re-struck once per BOWL_STRIKE_PERIOD_SEC. */
export function generateSingingBowlNoise(length: number, sampleRate: number): Float32Array {
  const out = new Float32Array(length)
  for (const { ratio, gain, decaySec } of BOWL_PARTIALS) {
    const hz = BOWL_FUNDAMENTAL_HZ * ratio
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate
      const env = bowlPartialEnvelope(t % BOWL_STRIKE_PERIOD_SEC, decaySec)
      out[i] += Math.sin(2 * Math.PI * hz * t) * env * gain
    }
  }
  return normalizeRms(out, MASTER_TARGET_RMS)
}

const CRICKET_VOICE_COUNT = 5 // independent chirp-trains summed into a chorus
const CRICKET_CHIRP_RATE_MIN = 3 // chirps/sec per voice
const CRICKET_CHIRP_RATE_MAX = 6
const CRICKET_CHIRP_DECAY_MS = 35 // short percussive tick per chirp
const CRICKET_CHIRP_ATTACK_MS = 2 // softens the 0-sample snap (sound-craft.md §1-6/§E)
const CRICKET_FREQ_MIN_HZ = 3200 // narrowband cricket stridulation range
const CRICKET_FREQ_MAX_HZ = 4400
const CRICKET_BED_GAIN = 0.08 // quiet night-forest floor under the chorus

/** Dense narrowband chirp chorus: CRICKET_VOICE_COUNT independent "crickets", each a fixed random
 * pitch in the stridulation band gated by its own triggerDecayEnvelope at its own random rate,
 * summed together. Random per-voice pitch/rate is what makes it read as a chorus of individuals
 * rather than one metronomic chirp. */
export function generateCricketsNoise(length: number, sampleRate: number): Float32Array {
  const bed = generateBrownNoise(length)
  const chorus = new Float32Array(length)
  for (let v = 0; v < CRICKET_VOICE_COUNT; v++) {
    const hz = CRICKET_FREQ_MIN_HZ + Math.random() * (CRICKET_FREQ_MAX_HZ - CRICKET_FREQ_MIN_HZ)
    const ratePerSec = CRICKET_CHIRP_RATE_MIN + Math.random() * (CRICKET_CHIRP_RATE_MAX - CRICKET_CHIRP_RATE_MIN)
    const envelope = triggerDecayEnvelope(length, sampleRate, ratePerSec, CRICKET_CHIRP_DECAY_MS, CRICKET_CHIRP_ATTACK_MS)
    for (let i = 0; i < length; i++) chorus[i] += Math.sin((2 * Math.PI * hz * i) / sampleRate) * envelope[i]
  }
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = chorus[i] + bed[i] * CRICKET_BED_GAIN
  const shelved = applyNightShelf(mixed, sampleRate)
  return normalizeRms(shelved, MASTER_TARGET_RMS)
}

const BLIZZARD_LOWPASS_HZ = 550 // brighter/harsher gust band than WIND's calmer 500Hz
const BLIZZARD_SWELL_SEC = 8 // average gust cycle, faster/more violent than wind's 12s (jittered ±30% per cycle)
const BLIZZARD_SWELL_MIN_GAIN = 0.25 // deeper troughs between gusts than wind's 0.35 (±0.08 jitter)
const BLIZZARD_BUFFER_SECONDS = 40 // ~5 randomized gust cycles, vs. the old single fixed 8s cycle
const BLIZZARD_SPARKLE_HIGHPASS_HZ = 6000 // isolates the glassy ice-crystal transient band
const BLIZZARD_SPARKLE_RATE_PER_SEC = 18 // dense, fine sparkle texture
const BLIZZARD_SPARKLE_DECAY_MS = 12
const BLIZZARD_SPARKLE_ATTACK_MS = 2 // softens the 0-sample snap (sound-craft.md §1-6/§E)
const BLIZZARD_SPARKLE_GAIN = 0.5 // mixed under the gust bed, not overpowering it

/** Wind's gust engine (lowpass + random-walk swell), tuned brighter/harder, plus a sparse
 * highpassed "ice crystal" sparkle layer (same trigger-decay shape as campfire's crackle, just
 * higher frequency and denser). */
export function generateBlizzardNoise(length: number, sampleRate: number): Float32Array {
  const gustBed = onePoleLowpass(generateBrownNoise(length), sampleRate, BLIZZARD_LOWPASS_HZ)
  const gustSwelled = applyRandomWalkSwell(gustBed, sampleRate, BLIZZARD_SWELL_SEC, BLIZZARD_SWELL_MIN_GAIN, 0.08)
  const sparkleBase = onePoleHighpass(generateWhiteNoise(length), sampleRate, BLIZZARD_SPARKLE_HIGHPASS_HZ)
  const sparkleEnv = triggerDecayEnvelope(length, sampleRate, BLIZZARD_SPARKLE_RATE_PER_SEC, BLIZZARD_SPARKLE_DECAY_MS, BLIZZARD_SPARKLE_ATTACK_MS)
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = gustSwelled[i] + sparkleBase[i] * sparkleEnv[i] * BLIZZARD_SPARKLE_GAIN
  return normalizeRms(mixed, MASTER_TARGET_RMS)
}

const CITYRAIN_TRAFFIC_LOWPASS_HZ = 120 // distant traffic rumble, well below rain's hiss band
const CITYRAIN_TRAFFIC_GAIN = 0.5 // mixed under the rain hiss, a constant urban floor
const CITYRAIN_SPLASH_BANDPASS_LOW_HZ = 400
const CITYRAIN_SPLASH_BANDPASS_HIGH_HZ = 1200
const CITYRAIN_SPLASH_RATE_PER_SEC = 0.6 // occasional puddle splashes, sparser than rain droplets
const CITYRAIN_SPLASH_DECAY_MS = 90 // longer decay than a raindrop tick - a wetter, broader "splat"
const CITYRAIN_SPLASH_ATTACK_MS = 5 // a splash rises softer than a raindrop tick (sound-craft.md §1-6/§E)
const CITYRAIN_SPLASH_GAIN = 0.8

/** Rain's highpassed-hiss layer (generateRainNoise's texture) + a constant lowpassed-brown
 * "distant traffic" floor + sparse mid-band "puddle splash" bursts (triggerDecayEnvelope again). */
export function generateCityRainNoise(length: number, sampleRate: number): Float32Array {
  const hiss = applyJitterTexture(cascadeHighpass(generateWhiteNoise(length), sampleRate, RAIN_HIGHPASS_HZ, CASCADE_STAGES), sampleRate, RAIN_JITTER_HOLD_MS, ...RAIN_JITTER_GAIN)
  const traffic = onePoleLowpass(generateBrownNoise(length), sampleRate, CITYRAIN_TRAFFIC_LOWPASS_HZ)
  const splashBand = onePoleHighpass(onePoleLowpass(generateWhiteNoise(length), sampleRate, CITYRAIN_SPLASH_BANDPASS_HIGH_HZ), sampleRate, CITYRAIN_SPLASH_BANDPASS_LOW_HZ)
  const splashEnv = triggerDecayEnvelope(length, sampleRate, CITYRAIN_SPLASH_RATE_PER_SEC, CITYRAIN_SPLASH_DECAY_MS, CITYRAIN_SPLASH_ATTACK_MS)
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) mixed[i] = hiss[i] + traffic[i] * CITYRAIN_TRAFFIC_GAIN + splashBand[i] * splashEnv[i] * CITYRAIN_SPLASH_GAIN
  const shelved = applyNightShelf(mixed, sampleRate)
  return normalizeRms(shelved, MASTER_TARGET_RMS)
}

const GENERATORS: Record<NoiseColor, (length: number, sampleRate: number) => Float32Array> = {
  white: (length) => generateWhiteNoiseRms(length),
  pink: (length) => generatePinkNoiseRms(length),
  brown: (length) => generateBrownNoiseRms(length),
  green: (length, sampleRate) => generateGreenNoiseRms(length, sampleRate),
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
  birds: (length, sampleRate) => generateBirdsNoise(length, sampleRate),
  train: (length, sampleRate) => generateTrainNoise(length, sampleRate),
  'singing-bowl': (length, sampleRate) => generateSingingBowlNoise(length, sampleRate),
  crickets: (length, sampleRate) => generateCricketsNoise(length, sampleRate),
  blizzard: (length, sampleRate) => generateBlizzardNoise(length, sampleRate),
  'city-rain': (length, sampleRate) => generateCityRainNoise(length, sampleRate),
}

/** Per-color buffer duration override. wind/waves/fan/lofi/womb/blizzard now bake several
 * randomized amplitude-swell cycles into the buffer (see applyRandomWalkSwell) rather than exactly
 * one — a single fixed-period cycle repeated identically on every loop (sound-craft.md §1-2).
 * thunder needs enough buffer for one strike's decay to finish before the loop point; heartbeat
 * needs a whole number of beat periods; train needs a whole multiple of its click period; bowl
 * needs a whole strike period. Colors absent here use the caller's default duration. */
export const NOISE_BUFFER_SECONDS: Partial<Record<NoiseColor, number>> = {
  wind: WIND_BUFFER_SECONDS,
  waves: WAVES_BUFFER_SECONDS,
  fan: FAN_BUFFER_SECONDS,
  thunder: THUNDER_BUFFER_SECONDS,
  lofi: LOFI_BUFFER_SECONDS,
  heartbeat: HEARTBEAT_BUFFER_SECONDS,
  womb: WOMB_BUFFER_SECONDS,
  train: TRAIN_BUFFER_SECONDS,
  'singing-bowl': BOWL_BUFFER_SECONDS,
  blizzard: BLIZZARD_BUFFER_SECONDS,
}

export interface BufferHost {
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): EngineAudioBuffer
}

/** Render `seconds` of the given noise color into a mono AudioBuffer for the caller to loop. The
 * generator is asked for LOOP_CROSSFADE_MS more than that, and the surplus is crossfaded back over
 * the head (see crossfadeLoop) so the wrap is both click-free and level-flat — even
 * phase-continuous envelope designs still wrap two statistically unrelated raw-noise samples at
 * the loop point, which audio.md measured as an audible click risk on several colors (thunder
 * worst, at 74x its typical sample-to-sample delta). */
export function renderNoiseBuffer(
  host: BufferHost,
  color: NoiseColor,
  sampleRate: number,
  seconds = 10,
): EngineAudioBuffer {
  const length = Math.floor(sampleRate * seconds)
  const crossfade = Math.min(Math.round((LOOP_CROSSFADE_MS / 1000) * sampleRate), Math.floor(length / 2))
  const samples = crossfadeLoop(GENERATORS[color](length + crossfade, sampleRate), length)
  const buffer = host.createBuffer(1, length, sampleRate)
  buffer.copyToChannel(samples, 0)
  return buffer
}
