// Current-plan state + localStorage persistence. Same fail-safe pattern as src/sleep/
// persistence.ts (corrupt/missing storage never throws, just falls back to 'free').
import { create } from 'zustand'
import type { Plan } from './types'

const PLAN_KEY = 'so.plan'
const VALID_PLANS: Plan[] = ['free', 'tier2000', 'tier5000', 'tier10000']

function readStoredPlan(): Plan {
  try {
    const v = localStorage.getItem(PLAN_KEY)
    return (VALID_PLANS as string[]).includes(v ?? '') ? (v as Plan) : 'free'
  } catch {
    return 'free'
  }
}

interface PlanStore {
  plan: Plan
  setPlan(plan: Plan): void
}

export const usePlanStore = create<PlanStore>((set) => ({
  plan: readStoredPlan(),
  setPlan(plan) {
    try {
      localStorage.setItem(PLAN_KEY, plan)
    } catch {
      // ponytail: storage full/blocked — plan still updates in-memory for this session
    }
    set({ plan })
  },
}))

/** Non-reactive read for use outside React components (mixer/store.ts, ads/plan-gate.ts). */
export function getPlan(): Plan {
  return usePlanStore.getState().plan
}
