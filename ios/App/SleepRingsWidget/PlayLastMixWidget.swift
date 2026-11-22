// "Play last mix" home-screen widget — source for the SleepRingsWidget extension target, which has
// to be created in Xcode first (docs/ios-widget-setup.md). Deliberately not in the App target: its
// @main WidgetBundle would clash with AppDelegate's @UIApplicationMain.
// UNVERIFIED: written without Xcode against the WidgetKit and @capgo/capacitor-widget-kit 8.2.2
// docs, never compiled or run.
//
// Tap → sleeprings://play-last-mix → AppDelegate posts the launcher shortcut's "play-last-mix" item →
// src/mobile/app-shortcuts.ts → playLastMix(), the same route as the stage 3 quick action.
// The mix name comes from the widget-kit session src/mobile/widget.ts writes to the shared App Group.
import SwiftUI
import WidgetKit
#if canImport(CapgoWidgetKitShared)
import CapgoWidgetKitShared
#endif

// Must match src/mobile/widget.ts.
private let widgetKind = "PlayLastMixWidget"
private let sessionId = "last-mix"
private let playURL = URL(string: "sleeprings://play-last-mix")!

// ponytail: two inline languages instead of a .strings file in the extension; the app ships ko + en.
private let isKorean = Locale.preferredLanguages.first?.hasPrefix("ko") ?? false
private let playLastMixTitle = isKorean ? "마지막 믹스 재생" : "Play last mix"

@main
struct SleepRingsWidgetBundle: WidgetBundle {
    var body: some Widget {
        PlayLastMixWidget()
    }
}

struct PlayLastMixWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: widgetKind, provider: PlayLastMixProvider()) { entry in
            PlayLastMixView(entry: entry)
        }
        .configurationDisplayName(playLastMixTitle)
        .description(isKorean ? "누르면 SleepRings가 열리고 마지막 믹스가 재생돼요." : "Opens SleepRings and plays your last mix.")
        .supportedFamilies([.systemSmall])
    }
}

struct PlayLastMixEntry: TimelineEntry {
    let date: Date
    let mixName: String?
}

struct PlayLastMixProvider: TimelineProvider {
    func placeholder(in context: Context) -> PlayLastMixEntry {
        PlayLastMixEntry(date: Date(), mixName: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (PlayLastMixEntry) -> Void) {
        completion(currentEntry())
    }

    // .never: the app calls reloadWidgets whenever the mix name changes (src/mobile/widget.ts).
    func getTimeline(in context: Context, completion: @escaping (Timeline<PlayLastMixEntry>) -> Void) {
        completion(Timeline(entries: [currentEntry()], policy: .never))
    }

    private func currentEntry() -> PlayLastMixEntry {
        PlayLastMixEntry(date: Date(), mixName: storedMixName())
    }

    private func storedMixName() -> String? {
        #if canImport(CapgoWidgetKitShared)
        // No App Group yet (or nothing stored) → nil, and the widget shows just "Play last mix".
        guard let session = (try? CapgoNativeWidgetBridge())?.loadSession(widgetId: sessionId),
              let state = try? JSONSerialization.jsonObject(with: session.stateData) as? [String: Any],
              let name = state["name"] as? String, !name.isEmpty
        else { return nil }
        return name
        #else
        return nil
        #endif
    }
}

// Fixed night palette, as the Android widget (widget_background.xml / widget_play_last_mix.xml).
private let nightBackground = Color(red: 0x12 / 255, green: 0x16 / 255, blue: 0x26 / 255)
private let nightForeground = Color(red: 0xE6 / 255, green: 0xE9 / 255, blue: 0xF2 / 255)

struct PlayLastMixView: View {
    let entry: PlayLastMixEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "play.circle.fill")
                .font(.system(size: 36))
                .accessibilityHidden(true)
            Spacer(minLength: 0)
            Text(playLastMixTitle)
                .font(.headline)
                .lineLimit(2)
            if let name = entry.mixName {
                Text(name)
                    .font(.caption)
                    .lineLimit(1)
                    .opacity(0.7)
            }
        }
        .foregroundColor(nightForeground)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(playURL) // the whole small widget is one tap target
        .widgetBackground(nightBackground)
    }
}

private extension View {
    // iOS 17 renders a "please adopt containerBackground" placeholder without it; 16 doesn't have it.
    @ViewBuilder
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(color, for: .widget)
        } else {
            padding().background(color)
        }
    }
}
