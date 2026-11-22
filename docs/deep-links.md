# Mix share links and native deep links

## What works today

- **Share button** (mixer, next to preset save) builds `<base>#mix=<payload>`. The payload is
  versioned base64url JSON (`src/mixer/share.ts`). On web the base is the current page. Native
  builds use `PUBLIC_WEB_URL` (`https://sleep-rings.hyuckjin.workers.dev/`), because their own
  origin (`capacitor://localhost` or `https://localhost`) means nothing to the person receiving the link.
- **Web:** opening such a link loads the mix and removes `#mix=` from the address bar
  (`src/app/App.tsx`).
- **Native:** `App.tsx` listens to `@capacitor/app` `appUrlOpen` and also reads `getLaunchUrl()`
  for cold starts. Both use the same decoder as the web.

  **Until the setup below is done, the OS never hands the app a link**, so the listener stays
  idle. No verified domain is configured yet. (iOS registers the `sleeprings://` scheme for the
  home-screen widget: `AppDelegate` handles `sleeprings://play-last-mix` itself, and any app can
  open it. Any other `sleeprings://` URL reaches the same untrusted-input decoder as a shared
  link. Share links themselves stay https.) Tapping a shared link on a phone opens the web app in
  the browser, which works.

The fragment (`#mix=…`) never reaches a server. The decoder treats every link as untrusted input:
- It rejects unknown versions and anything larger than 6000 characters.
- It clamps all numbers.
- It drops sound ids that aren't in the catalog.
- It drops sounds the receiver's plan doesn't include, and then shows the upsell.
- It caps orbs to the plan's layer limit, and to at most 24.

## What you need to supply

To make a tapped link open the installed app (iOS Universal Links / Android App Links), these
values are needed. None of them are in the repo; do not commit guessed values.

| Value | Where to find it |
|-------|------------------|
| **Link domain** | The host that serves the web app and the two `.well-known` files below. Today that is `sleep-rings.hyuckjin.workers.dev`. A custom domain is better, because `workers.dev` hosts can change. If the domain changes, update `PUBLIC_WEB_URL` in `src/mixer/share.ts`. |
| **Apple Team ID** | Apple Developer → Membership details (10 characters, e.g. `ABCDE12345`). |
| **iOS bundle id** | `com.sleeprings.app` (from `capacitor.config.json`). Confirm it matches the App Store record. |
| **Android SHA-256 signing fingerprint(s)** | Play Console → *Test and release → App integrity → App signing*: the **app signing key** SHA-256. If you also install builds signed with your upload/release keystore, add that one too (`keytool -list -v -keystore <your.jks>`). Format: `AA:BB:…` (32 bytes). |

## Where each value goes

### 1. `public/.well-known/apple-app-site-association` (no file extension)

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["<TEAM_ID>.com.sleeprings.app"],
        "components": [{ "/": "/", "#": "mix=*", "comment": "mix share links" }]
      }
    ]
  }
}
```

Apple fetches this file over HTTPS, without redirects, from `https://<domain>/.well-known/apple-app-site-association`.

- **Content type:** serve it as `application/json`. Cloudflare static assets guess the type from the
  extension, and this file has none. Add `public/_headers` with:
  ```
  /.well-known/apple-app-site-association
    Content-Type: application/json
  ```
- **SPA fallback:** check that `wrangler.jsonc`'s `not_found_handling: "single-page-application"` does not
  answer it with `index.html`. A real file is served as-is, so this only goes wrong if the file is missing.

### 2. `public/.well-known/assetlinks.json`

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.sleeprings.app",
      "sha256_cert_fingerprints": ["<SHA256_APP_SIGNING_KEY>"]
    }
  }
]
```

### 3. `android/app/src/main/AndroidManifest.xml`

Add this inside `.MainActivity`, next to the existing launcher filter:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="<DOMAIN>" android:path="/" />
</intent-filter>
```

`MainActivity` is already `singleTask`, so a link that arrives while the app is running is delivered
as `appUrlOpen`.

Android intent filters cannot match the URL fragment, so this filter claims **every** visit to the
domain root, not just `#mix=` links. Once the link is verified, a phone with the app installed always
opens the app instead of the web page at `/`. That is fine while the domain is only this app's web
build. To keep `/` for the web, share under a dedicated path instead (e.g. `https://<DOMAIN>/m#mix=…`):
change `shareUrl`'s base and use `android:path="/m"` here and `"/": "/m"` in the iOS file above.
iOS can match the fragment (`"#": "mix=*"`), so the iOS file above only claims share links.

### 4. iOS Associated Domains entitlement

1. In Xcode → App target → *Signing & Capabilities*, add **Associated Domains** with
   `applinks:<DOMAIN>`. Xcode creates `ios/App/App/App.entitlements` and adds it to the build settings.
2. In the Apple Developer portal, the App ID needs the Associated Domains capability (Xcode's automatic
   signing does this).

`AppDelegate.swift` already forwards `continue userActivity` to Capacitor, so nothing else is needed.

## Verifying on a device

- **Android:** run `adb shell pm get-app-links com.sleeprings.app`. It should show `verified` for the domain.
  Then tap a shared link in a messenger app.
- **iOS:** install a build signed with the Team ID, then long-press a shared link in Notes or Messages.
  "Open in SleepRings" should appear. Apple caches the association file through its CDN, so changes can
  take a while to show up.
