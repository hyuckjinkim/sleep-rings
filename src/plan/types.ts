// Subscription tier. roadmap-v030.md §2: 4 tiers, "무료 최대 개방" — see tiers.ts for what each
// unlocks. tier10000's real content (file-based premium library) is deferred until sound assets
// exist (docs/plan-tiers.md); the type/gating logic exists now so the plumbing is ready.
export type Plan = 'free' | 'tier2000' | 'tier5000' | 'tier10000'
