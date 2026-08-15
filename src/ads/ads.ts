// Banner ad bridge (roadmap-v030.md §3, task B4). @capacitor-community/admob wraps the stable
// Google Mobile Ads SDK plus its bundled Google UMP consent SDK. Web/non-Capacitor builds are a
// complete no-op — same platform-gate pattern as src/mobile (Capacitor.isNativePlatform()).
//
// Placement policy (AdMob policy risk — see docs/ads-setup.md): banners belong on the library/
// settings/preset screens only, never the mixer control screen, never near a button a user taps
// repeatedly. That's enforced by where the caller mounts this, not by this module.
import { Capacitor } from '@capacitor/core'
import { AdMob, AdmobConsentStatus, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob'
import { AD_CONFIG } from './ad-config'

export type BannerPosition = 'top' | 'bottom'

let initialized = false
/** Non-personalized-ads fallback: true until consent info says ads can be requested (GDPR/UK UMP flow). */
let npa = true

function platformAdUnitId(): string {
  return Capacitor.getPlatform() === 'ios' ? AD_CONFIG.bannerAdUnitId.ios : AD_CONFIG.bannerAdUnitId.android
}

/**
 * Initializes the AdMob SDK, requests iOS ATT authorization, and runs the Google UMP consent flow
 * (GDPR/UK). Call once at app startup. No-op off native platforms. Never throws — ad failures must
 * not surface as errors in a sleep app; this is best-effort only.
 */
export async function initAds(): Promise<void> {
  if (!Capacitor.isNativePlatform() || initialized) return
  try {
    await AdMob.initialize({ initializeForTesting: AD_CONFIG.useTestAds })

    if (Capacitor.getPlatform() === 'ios') {
      const tracking = await AdMob.trackingAuthorizationStatus()
      if (tracking.status === 'notDetermined') await AdMob.requestTrackingAuthorization()
    }

    const consent = await AdMob.requestConsentInfo()
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
      await AdMob.showConsentForm()
    }
    npa = !consent.canRequestAds

    initialized = true
  } catch (err) {
    // ponytail: ad SDK failures are non-fatal — the sleep app must keep working without ads.
    console.warn('[ads] initAds failed', err)
  }
}

/** Shows a banner at the given screen edge. No-op off native or before initAds() has succeeded. */
export async function showBanner(position: BannerPosition = 'bottom'): Promise<void> {
  if (!Capacitor.isNativePlatform() || !initialized) return
  try {
    await AdMob.showBanner({
      adId: platformAdUnitId(),
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: position === 'top' ? BannerAdPosition.TOP_CENTER : BannerAdPosition.BOTTOM_CENTER,
      isTesting: AD_CONFIG.useTestAds,
      npa,
    })
  } catch (err) {
    console.warn('[ads] showBanner failed', err)
  }
}

/** Hides the current banner without destroying it. No-op off native. */
export async function hideBanner(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AdMob.hideBanner()
  } catch (err) {
    console.warn('[ads] hideBanner failed', err)
  }
}

/** Whether the ad SDK is active on this platform (native + initAds() has succeeded). */
export function isAdsEnabled(): boolean {
  return Capacitor.isNativePlatform() && initialized
}
