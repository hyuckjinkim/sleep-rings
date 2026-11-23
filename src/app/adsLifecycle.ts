// M1 fix (.omc/reviews/v030-review.md M1, docs/ads-setup.md §6): the old wiring called
// showBanner() directly from the settings-screen mount effect. ads.ts's showBanner() no-ops
// silently while `initialized` is still false, so a banner requested before initAds() resolves
// was lost forever — nothing ever retried it. Routing every show/hide through this module's single
// `ensureAdsInit()` promise means every caller waits on the *same* init, so a banner request can
// never land before init actually finishes, no matter which of them mounts first.
import { hideBanner, initAds, showBanner } from '../ads'

let initPromise: Promise<void> | null = null

/** App-start-once, idempotent: the first caller triggers initAds(), every later caller (including
 * a Settings screen mounted before that first call resolves) just awaits the same promise. */
export function ensureAdsInit(): Promise<void> {
  if (!initPromise) initPromise = initAds()
  return initPromise
}

/** Latest intent, not the intent captured when a call started. A show requested while init was
 * still pending used to fire regardless of what happened during the wait — leave the settings
 * screen fast enough and the banner appeared over the mixer, which is the one placement
 * docs/ads-setup.md §5 forbids. Awaited calls re-read this before acting, so the last caller wins
 * (.omc/reviews/v040-review.md HIGH-1). */
let desiredVisible = false

/** Waits for ads to actually be ready, then shows or hides the bottom banner per `shouldShow`
 * (free plan, settings screen mounted, screen not dimmed — the caller decides that, not this). */
export async function showBannerWhenReady(shouldShow: boolean): Promise<void> {
  desiredVisible = shouldShow
  // Never initialise the SDK just to hide something that was never shown. Booting the SDK has
  // user-visible cost — on iOS it is what triggers the ATT prompt — so a paid subscriber, who can
  // never see a banner, must not pay that cost (.omc/qa4/monetization.md CRITICAL-1).
  if (!shouldShow && !initPromise) return
  await ensureAdsInit()
  if (desiredVisible) await showBanner('bottom')
  else await hideBanner()
}

export { hideBanner }
