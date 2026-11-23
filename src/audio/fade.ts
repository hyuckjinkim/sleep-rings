// GainNode fade scheduling. Linear ramps only — exponential ramps can't reach 0 (design doc §5).
import type { EngineAudioParam } from './webAudioTypes'

const RAMP_FLOOR_SEC = 0.001

export function fadeTo(param: EngineAudioParam, now: number, target: number, durationSec: number): void {
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(target, now + Math.max(durationSec, RAMP_FLOOR_SEC))
}
