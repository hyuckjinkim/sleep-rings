/**
 * Real-ID swap point (roadmap-v030.md §3) — this is the ONE place production ad unit IDs go once
 * AdMob issues them. Values below are Google's official test ad unit IDs: safe to ship, never earn
 * real revenue, never trigger invalid-traffic flags. See docs/ads-setup.md for the swap procedure
 * and where the AdMob *App* ID (a separate value, ca-app-pub-...~...) belongs — that one lives in
 * native config (AndroidManifest.xml meta-data / Info.plist GADApplicationIdentifier), not here.
 */
export const AD_CONFIG = {
  bannerAdUnitId: {
    android: 'ca-app-pub-3940256099942544/9214589741',
    ios: 'ca-app-pub-3940256099942544/2435281174',
  },
  /** Registers test devices with AdMob so real-ID testing doesn't count as invalid traffic. */
  useTestAds: true,
} as const
