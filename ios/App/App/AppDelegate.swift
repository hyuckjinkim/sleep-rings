import UIKit
import Capacitor
import AppShortcutsPlugin

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        // "Play last mix" home-screen quick action that cold-launched the app
        // (@capawesome/capacitor-app-shortcuts README). UNVERIFIED: written without Xcode, never built.
        // Posted on the next main-queue turn rather than inline (README): the plugin only starts
        // observing once the bridge view controller loads, which happens after this method returns.
        if let shortcutItem = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem {
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: NSNotification.Name(AppShortcutsPlugin.notificationName), object: nil, userInfo: [AppShortcutsPlugin.userInfoShortcutItemKey: shortcutItem])
            }
            return false // handled here, so iOS doesn't also call performActionFor below
        }
        return true
    }

    // Quick action while the app was already running (same plugin, same UNVERIFIED caveat).
    func application(_ application: UIApplication, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        NotificationCenter.default.post(name: NSNotification.Name(AppShortcutsPlugin.notificationName), object: nil, userInfo: [AppShortcutsPlugin.userInfoShortcutItemKey: shortcutItem])
        completionHandler(true)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // "Play last mix" widget tap (ios/App/SleepRingsWidget): replay it as the launcher shortcut's
        // quick action, so JS takes the same route (app-shortcuts.ts → playLastMix()). Not forwarded
        // to the App plugin: as a launch URL it would make setPlayLastMixShortcut skip this session.
        // Async as above, for a cold launch. UNVERIFIED: written without Xcode, never built.
        if url.scheme == "sleeprings" && url.host == "play-last-mix" {
            let item = UIApplicationShortcutItem(type: "play-last-mix", localizedTitle: "Play last mix")
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: NSNotification.Name(AppShortcutsPlugin.notificationName), object: nil, userInfo: [AppShortcutsPlugin.userInfoShortcutItemKey: item])
            }
            return true
        }
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
