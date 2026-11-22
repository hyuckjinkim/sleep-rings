# iOS "Play last mix" widget — Xcode setup

The widget's source is in the repo, but its **Widget Extension target is not**. Adding an extension
target means new pbxproj objects (target, build phases, embed phase, signing), and those can't be
written safely without Xcode. Do the steps below once in Xcode and commit the resulting
`ios/App/App.xcodeproj/project.pbxproj` changes.

UNVERIFIED: none of the Swift has been compiled. It was written without Xcode, against the
WidgetKit and `@capgo/capacitor-widget-kit` 8.2.2 docs.

## What is already in the repo

| Piece | File |
|-------|------|
| Widget (small, one tap target, shows the mix name when it can) | `ios/App/SleepRingsWidget/PlayLastMixWidget.swift` |
| Tap route: `sleeprings://play-last-mix` → the launcher shortcut's quick action → `playLastMix()` | `ios/App/App/AppDelegate.swift`, `CFBundleURLTypes` in `ios/App/App/Info.plist` |
| Mix name written to a widget-kit session in the App Group | `src/mobile/widget.ts` (called from `src/main.tsx`) |
| Plugin | `@capgo/capacitor-widget-kit@8.2.2` (linked into the app by `npx cap sync ios`) |

The tap opens the app, which then plays. A widget can't play the mix by itself, because the audio
is Web Audio inside the WebView.

## Steps (Xcode 26 or later)

1. Run `npm run build:ios`, then open `ios/App/App.xcodeproj`.
2. **File → New → Target… → iOS → Widget Extension → Next.**
   - Product Name: `SleepRingsWidget`
   - Team: the same team as the App target
   - Uncheck **Include Live Activity**, **Include Control** and **Include Configuration App Intent**
   - Embed in Application: `App`
   - Finish. If Xcode asks to activate the new scheme, either answer is fine.
3. **Swap in the repo's source.** Xcode puts its template files (`SleepRingsWidget.swift`,
   `SleepRingsWidgetBundle.swift`, and possibly others) in the `SleepRingsWidget` group.
   - Delete those template `.swift` files with **Move to Trash**. Keep `Assets.xcassets` and `Info.plist`.
   - Make sure `ios/App/SleepRingsWidget/PlayLastMixWidget.swift` is in the group, with target
     membership **SleepRingsWidget only**, not App. If Xcode made its own folder instead of
     using `ios/App/SleepRingsWidget/`, drag the file in from Finder and untick "Copy items if needed".
   - The file has the `@main` widget bundle. Two `@main`s in the extension means a template file is still there.
4. **SleepRingsWidget target → General → Minimum Deployments: iOS 16.0**, the same as the app.
   Bundle Identifier: keep Xcode's `com.sleeprings.app.SleepRingsWidget`.
5. **App Group.** Do this on **both** the App target and the SleepRingsWidget target:
   *Signing & Capabilities → + Capability → App Groups → +*, then add
   `group.com.sleeprings.app.widgetkit`.
   - This is the id the plugin derives by itself (`CapgoWidgetKitSharedStore.resolveAppGroupId`).
     It works without an Info.plist key, because the app's bundle id and the widget's both resolve to it.
   - If you register a different group id, also add `<key>CapgoWidgetKitAppGroup</key><string>your id</string>`
     to **both** `ios/App/App/Info.plist` and the widget's `Info.plist`.
   - Xcode registers the group under your team the first time you add it. That needs your account,
     which is why it isn't committed.
6. **Shared library for the mix name.** *File → Add Package Dependencies… → Add Local…*, choose
   `node_modules/@capgo/capacitor-widget-kit`, then add the product **CapgoWidgetKitShared** to
   **SleepRingsWidget** only. Don't add `CapgoCapacitorWidgetKit` anywhere; `CapApp-SPM` already
   links it into the app.
   - Optional: without it, `#if canImport(CapgoWidgetKitShared)` compiles the name out, and the widget just says "Play last mix".
7. Build and run on a device. Long-press the Home Screen, tap **+**, find **SleepRings**, and add
   the small widget. Play a saved preset in the app, so its name shows on the widget. Close the
   app, then tap the widget. The app should open and play the last mix.
8. Commit `project.pbxproj`, the widget's `Info.plist`/`Assets.xcassets`, and any `.entitlements`
   files Xcode created.

## If something doesn't work

- **The tap opens the app but nothing plays.** Check that `CFBundleURLTypes` (`sleeprings`) is
  still in `ios/App/App/Info.plist`. Then check that `AppDelegate.application(_:open:options:)`
  is reached. The quick-action route behind it is the stage 3 one, `src/mobile/app-shortcuts.ts`.
  If autoplay is blocked, the app offers a "play" tap instead, as the shortcut does.
- **No mix name.** Check that both targets have the same App Group, and that
  `CapgoWidgetKitShared` is linked to the widget. The app logs `[widget] update failed` when the store can't be written.
- **`npx cap sync` is safe.** It regenerates only `ios/App/CapApp-SPM/Package.swift`. It leaves
  the widget target and its local package reference alone.
