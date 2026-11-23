// Current-plan state + localStorage persistence. Same fail-safe pattern as src/sleep/
// persistence.ts (corrupt/missing storage never throws, just falls back to 'free').
import { create } from 'zustand'
import type { Plan } from './types'

const PLAN_KEY = 'so.plan'
const VALID_PLANS: Plan[] = ['free', 'tier2000', 'tier5000', 'tier10000']

// 테스트 빌드는 최대 플랜으로 고정해 모든 기능을 확인한다: `npm run dev` 가 켜고, 기기용은
// `VITE_TEST_PLAN=tier10000 npm run build:android`. 공개 배포(deploy:web·스토어 빌드)에는 없다.
const TEST_PLAN = import.meta.env.VITE_TEST_PLAN as string | undefined

function readStoredPlan(): Plan {
  if (TEST_PLAN && (VALID_PLANS as string[]).includes(TEST_PLAN)) return TEST_PLAN as Plan
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

/** Non-reactive read for use outside React components (mixer/store.ts, ads/planGate.ts). */
export function getPlan(): Plan {
  return usePlanStore.getState().plan
}
