// Closed-app wake alarm on iOS 26+ through AlarmKit. This is the iOS side of
// src/mobile/wake-alarm.ts, with the same "WakeAlarm" JS interface as the Android
// WakeAlarmPlugin.kt. JS decides when to arm and disarm it (the double-alarm rule is in
// wake-alarm.ts). Below iOS 26 every method reports unavailable, except cancel, which no-ops.
// JS then keeps the stage 3 backup notification.
// UNVERIFIED: written without Xcode against the AlarmKit docs, never compiled or run.
//
// Sound: AlarmKit plays the system alarm sound (.default). The wake sounds are Web Audio synths
// with no file to bundle, and AlarmKit custom sounds were reported to play the default sound
// anyway (Apple Forums 836432). So soundId and fadeSec are ignored, as on Android: no fade-in.
import Capacitor
import UIKit
#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import SwiftUI
#endif

/// Main.storyboard's root view controller. It exists to register app-local plugins, which
/// Capacitor 8 doesn't auto-discover (capacitorjs.com/docs/ios/custom-code).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WakeAlarmPlugin())
    }
}

@objc(WakeAlarmPlugin)
public class WakeAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WakeAlarmPlugin"
    public let jsName = "WakeAlarm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "canScheduleExact", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    private static let unavailable = "AlarmKit needs iOS 26"

    /// { at: epoch ms, soundId, fadeSec, title }. Asks for AlarmKit access the first time (the
    /// system prompt, with NSAlarmKitUsageDescription). Rejects when it's refused.
    @objc func schedule(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else { return call.unavailable(Self.unavailable) }
        guard let at = call.getDouble("at") else { return call.reject("at is required") }
        // fadeSec needs no clamp here: AlarmKit has no fade, so it is ignored (see the header).
        guard at.isFinite, at > Date().timeIntervalSince1970 * 1000 else { return call.reject("at must be in the future") }
        let title = call.getString("title") ?? "Wake alarm"
        Task {
            do {
                let manager = AlarmManager.shared
                var state = manager.authorizationState
                if state == .notDetermined {
                    state = try await manager.requestAuthorization()
                }
                guard state == .authorized else {
                    return call.reject("AlarmKit access was not granted")
                }
                Self.cancelAlarm() // one alarm at a time, re-armed under the same id
                let attributes = AlarmAttributes<WakeAlarmMetadata>(
                    presentation: AlarmPresentation(alert: Self.alert(title: title), countdown: nil, paused: nil),
                    metadata: nil,
                    tintColor: Color(red: 0x93 / 255, green: 0xA5 / 255, blue: 0xC8 / 255) // --so-accent (theme.css)
                )
                let configuration = AlarmManager.AlarmConfiguration<WakeAlarmMetadata>.alarm(
                    schedule: .fixed(Date(timeIntervalSince1970: at / 1000)),
                    attributes: attributes,
                    stopIntent: nil,
                    secondaryIntent: nil,
                    sound: .default
                )
                _ = try await manager.schedule(id: Self.alarmId, configuration: configuration)
                call.resolve()
            } catch {
                call.reject("AlarmKit schedule failed", nil, error)
            }
        }
        #else
        call.unavailable(Self.unavailable)
        #endif
    }

    /// Drop the pending alarm, and silence it if it is ringing. Resolves everywhere, because there is nothing to cancel below iOS 26.
    @objc func cancel(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) { Self.cancelAlarm() }
        #endif
        call.resolve()
    }

    /// A check, never a prompt. True while undecided, because schedule() asks then. Android's
    /// equivalent is a pure check, and iOS has no other point to ask at.
    @objc func canScheduleExact(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else { return call.unavailable(Self.unavailable) }
        call.resolve(["value": AlarmManager.shared.authorizationState != .denied])
        #else
        call.unavailable(Self.unavailable)
        #endif
    }

    /// Open SleepRings' page in Settings, where its alarm access can be turned back on. Resolves
    /// with whether access is granted once the user comes back. iOS-only counterpart of Android's
    /// "Alarms & reminders" screen.
    @objc func openSettings(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        guard #available(iOS 26.0, *) else { return call.unavailable(Self.unavailable) }
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return call.resolve(["value": false]) }
            var observer: NSObjectProtocol?
            observer = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
                if let observer { NotificationCenter.default.removeObserver(observer) }
                call.resolve(["value": AlarmManager.shared.authorizationState == .authorized])
            }
            UIApplication.shared.open(url)
        }
        #else
        call.unavailable(Self.unavailable)
        #endif
    }

    #if canImport(AlarmKit)
    // ponytail: one fixed id. The app arms at most one wake alarm, so cancel needs no stored state.
    private static let alarmId = UUID(uuidString: "5A3C1E0B-2F00-4000-8000-000000000001")!

    @available(iOS 26.0, *)
    private static func cancelAlarm() {
        try? AlarmManager.shared.stop(id: alarmId) // ringing → silent; throws when it isn't ringing
        try? AlarmManager.shared.cancel(id: alarmId) // scheduled → gone; throws when there is none
    }

    @available(iOS 26.0, *)
    private static func alert(title: String) -> AlarmPresentation.Alert {
        let resource = LocalizedStringResource(stringLiteral: title) // already translated by JS
        if #available(iOS 26.1, *) {
            return AlarmPresentation.Alert(title: resource) // system-provided stop control
        }
        // 26.0 only: deprecated in 26.1, where the system draws its own stop control.
        let stop = AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
        return AlarmPresentation.Alert(title: resource, stopButton: stop, secondaryButton: nil, secondaryButtonBehavior: nil)
    }
    #endif
}

#if canImport(AlarmKit)
/// AlarmKit wants a metadata type. Ours carries nothing, which the docs allow ("can be empty").
@available(iOS 26.0, *)
struct WakeAlarmMetadata: AlarmMetadata {}
#endif
