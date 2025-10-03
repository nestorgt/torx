import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var statusController: StatusController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        terminateOtherInstances()
        statusController = StatusController()
        statusController.installItems()

        // Prewarm wallpaper images to avoid menubar refresh on first click
        let green = NSColor(calibratedRed: 0.00, green: 0.65, blue: 0.15, alpha: 1)
        let red = NSColor(calibratedRed: 0.95, green: 0.10, blue: 0.10, alpha: 1)
        WallpaperManager.shared.prewarm(colors: [.black, green, red])

        DailyScheduler.shared.scheduleDaily(at: 23, minute: 0) {
            WallpaperManager.shared.setColor(.black)
        }

        let now = Date()
        let comps = Calendar.current.dateComponents([.hour, .minute], from: now)
        if let h = comps.hour, let m = comps.minute, (h > 23 || (h == 23 && m >= 0)) {
            WallpaperManager.shared.setColor(.black)
        }
    }

    private func terminateOtherInstances() {
        guard let bundleId = Bundle.main.bundleIdentifier else { return }
        let currentPid = ProcessInfo.processInfo.processIdentifier
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
            .filter { $0.processIdentifier != currentPid }
        for app in others { app.terminate() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            for app in NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
                where app.processIdentifier != currentPid {
                app.forceTerminate()
            }
        }
    }

    // Window UI removed per request; menu-only for now
}

