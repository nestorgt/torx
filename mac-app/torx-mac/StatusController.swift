import AppKit
import Foundation
import Network
import SystemConfiguration

final class StatusController: NSObject, NSMenuDelegate {
    private let bar = NSStatusBar.system

    private var itemGreen: NSStatusItem!
    private var itemRed: NSStatusItem!
    private var itemMenu: NSStatusItem!
    private var itemPingBadge: NSStatusItem!
    private var itemUsageBadge: NSStatusItem!
    private var installed = false
    private enum State { case unknown, black, green, red }
    private var state: State = .unknown
    private let targetIP = "185.87.45.245"
    private var currentIP: String?
    private weak var ipMenuItem: NSMenuItem?
    private weak var monitoringMenuItem: NSMenuItem?
    private let defaultsKeyMonitoring = "TorxMonitoringEnabled"
    private let defaultsKeyIPHistory = "TorxIPHistory"
    private let defaultsKeyAutoUpdate = "TorxAutoUpdateEnabled"
    private weak var ipHistoryRootItem: NSMenuItem?
    private weak var ipHistoryMenu: NSMenu?
    private var pingTimer: Timer?
    private var lastLatencyMs: Int?
    private var usageTimer: Timer?
    private var lastCPUPercent: Int = 0
    private var lastRAMPercent: Int = 0
    private var lastCPUTotalTicks: Double?
    private var lastCPUIdleTicks: Double?
    private var updateTimer: Timer?
    private var enforcementTimer: Timer?
    private var pathMonitor: NWPathMonitor?
    private var wifiMonitor: NWPathMonitor?
    private var wiredMonitor: NWPathMonitor?
    private var otherMonitor: NWPathMonitor?
    private var scStore: SCDynamicStore?
    private var scRunLoopSource: CFRunLoopSource?
    private weak var autoUpdateMenuItem: NSMenuItem?
    private weak var updateStatusMenuItem: NSMenuItem?
    private let defaultsKeyLastReleaseTag = "TorxLastReleaseTag"
    private let githubOwner = "project-torx"
    private let githubRepo = "torx-mac"
    private var effectiveOwner: String { ProcessInfo.processInfo.environment["TORX_GH_OWNER"] ?? githubOwner }
    private var effectiveRepo: String { ProcessInfo.processInfo.environment["TORX_GH_REPO"] ?? githubRepo }
    private var effectiveToken: String? {
        if let t = ProcessInfo.processInfo.environment["TORX_GH_TOKEN"], !t.isEmpty { return t }
        if let t = Bundle.main.object(forInfoDictionaryKey: "TorxEmbeddedGitHubToken") as? String, !t.isEmpty { return t }
        return nil
    }

    // IP elapsed tracking
    private var ipConnectedSince: Date?
    private var elapsedIPTimer: Timer?

    override init() {
        super.init()
        UserDefaults.standard.register(defaults: [defaultsKeyMonitoring: true, defaultsKeyAutoUpdate: true])
        
        // Monitor app lifecycle to trigger IP checks when app becomes active
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidBecomeActive),
            name: NSApplication.didBecomeActiveNotification,
            object: nil
        )
    }
    
    @objc private func appDidBecomeActive() {
        NSLog("App became active - checking IP immediately")
        updatePublicIP()
    }
    
    deinit {
        // Clean up timers and monitoring
        enforcementTimer?.invalidate()
        updateTimer?.invalidate()
        pingTimer?.invalidate()
        usageTimer?.invalidate()
        elapsedIPTimer?.invalidate()
        
        // Clean up network monitoring
        pathMonitor?.cancel()
        wifiMonitor?.cancel()
        wiredMonitor?.cancel()
        otherMonitor?.cancel()
        if let source = scRunLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), source, CFRunLoopMode.commonModes)
        }
        
        // Remove notification observer
        NotificationCenter.default.removeObserver(self)
    }

    func installItems() {
        if installed {
            refreshIcons()
            return
        }
        NSLog("Installing status bar items")
        
        // Request Apple Events permission immediately
        requestAppleEventsPermission()

        // Menu icon should appear to the right → create it FIRST
        itemMenu = bar.statusItem(withLength: NSStatusItem.variableLength)
        if let button = itemMenu.button {
            button.image = StatusIconFactory.render(
                symbolName: "gamecontroller.circle",
                tint: menuTintColor(),
                gradientTop: .clear,
                gradientBottom: .clear,
                diameter: 18
            )
            button.image?.isTemplate = false
            button.toolTip = "Menu"
        }
        itemMenu.menu = buildSettingsMenu()

        itemRed = makeItem(
            symbol: "arrowshape.down.fill",
            tint: NSColor(calibratedRed: 0.95, green: 0.10, blue: 0.10, alpha: 1),
            gradTop: NSColor.white.withAlphaComponent(0.96),
            gradBottom: NSColor.systemRed.withAlphaComponent(0.55),
            tooltip: "Fondo rojo",
            action: #selector(handleRedLeft)
        )

        itemGreen = makeItem(
            symbol: "arrowshape.up.fill",
            tint: NSColor(calibratedRed: 0.00, green: 0.65, blue: 0.15, alpha: 1),
            gradTop: NSColor.white.withAlphaComponent(0.96),
            gradBottom: NSColor.systemGreen.withAlphaComponent(0.55),
            tooltip: "Fondo verde",
            action: #selector(handleGreenLeft)
        )

        // Left-most: composite ping badge (dot above text)
        itemPingBadge = bar.statusItem(withLength: NSStatusItem.variableLength)
        if let button = itemPingBadge.button {
            button.image = StatusIconFactory.renderPingBadge(dotColor: .systemGray, text: "— ms", diameter: 18)
            button.image?.isTemplate = false
            button.toolTip = "Latency"
            button.target = nil
            button.action = nil
        }

        installed = true
        updatePublicIP()
        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(applicationLaunched(_:)),
            name: NSWorkspace.didLaunchApplicationNotification,
            object: nil
        )
        // Removed periodic latency and CPU/RAM timers to minimize resource usage
        startNetworkMonitoring()
        scheduleUpdateChecks()
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            guard let self = self else { return }
            self.checkGitHubForUpdate(installIfNewer: self.autoUpdateEnabled)
        }
    }

    private func makeItem(symbol: String,
                          tint: NSColor,
                          gradTop: NSColor,
                          gradBottom: NSColor,
                          tooltip: String,
                          action: Selector,
                          rightAction: Selector? = nil,
                          diameter: CGFloat = 18) -> NSStatusItem {
        let item = bar.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            button.image = StatusIconFactory.render(
                symbolName: symbol,
                tint: tint,
                gradientTop: gradTop,
                gradientBottom: gradBottom,
                diameter: diameter
            )
            if button.image == nil {
                button.title = "●"
            }
            button.image?.isTemplate = false
            button.toolTip = tooltip
            button.target = self
            button.action = action
            button.sendAction(on: [.leftMouseUp])
            if let ra = rightAction {
                let right = NSClickGestureRecognizer(target: self, action: ra)
                right.buttonMask = 0x2
                button.addGestureRecognizer(right)
            }
        }
        return item
    }

    func refreshIcons() {
        let greenBase = NSColor(calibratedRed: 0.00, green: 0.65, blue: 0.15, alpha: 1)
        let greenTint: NSColor = (state == .green) ? .white : greenBase
        if let b = itemGreen.button {
            b.image = StatusIconFactory.render(
                symbolName: "arrowshape.up.fill",
                tint: greenTint,
                gradientTop: .clear, gradientBottom: .clear, diameter: 18
            )
            b.image?.isTemplate = false
        }
        if let b = itemRed.button {
            let redBase = NSColor(calibratedRed: 0.95, green: 0.10, blue: 0.10, alpha: 1)
            let redTint: NSColor = (state == .red) ? .white : redBase
            b.image = StatusIconFactory.render(
                symbolName: "arrowshape.down.fill",
                tint: redTint,
                gradientTop: .clear, gradientBottom: .clear, diameter: 18
            )
            b.image?.isTemplate = false
        }
        if let b = itemMenu.button {
            b.image = StatusIconFactory.render(
                symbolName: "gamecontroller.circle",
                tint: menuTintColor(),
                gradientTop: .clear, gradientBottom: .clear, diameter: 18
            )
            b.image?.isTemplate = false
        }
        refreshPingUI()
        refreshUsageUI()
    }

    // MARK: - Actions
    @objc private func handleGreenLeft() {
        if state == .green { setBlack() } else { setGreen() }
    }

    @objc private func handleRedLeft() {
        if state == .red { setBlack() } else { setRed() }
    }

    private func buildSettingsMenu() -> NSMenu {
        let menu = NSMenu()
        menu.delegate = self
        let monitoringItem = NSMenuItem(title: "Monitoring Enabled", action: #selector(toggleMonitoring), keyEquivalent: "")
        monitoringItem.target = self
        monitoringItem.state = monitoringEnabled ? .on : .off
        menu.addItem(monitoringItem)
        self.monitoringMenuItem = monitoringItem
        let autoUpd = NSMenuItem(title: "Automatic Updates (GitHub)", action: #selector(toggleAutoUpdate), keyEquivalent: "")
        autoUpd.target = self
        autoUpd.state = autoUpdateEnabled ? .on : .off
        menu.addItem(autoUpd)
        self.autoUpdateMenuItem = autoUpd
        let manualUpd = NSMenuItem(title: "Check for Updates Now", action: #selector(manualCheckUpdate), keyEquivalent: "")
        manualUpd.target = self
        menu.addItem(manualUpd)
        let updStatus = NSMenuItem(title: "Update: —", action: nil, keyEquivalent: "")
        updStatus.isEnabled = false
        menu.addItem(updStatus)
        self.updateStatusMenuItem = updStatus
        let historyRoot = NSMenuItem(title: "IP History", action: nil, keyEquivalent: "")
        let historyMenu = NSMenu(title: "IP History")
        historyRoot.submenu = historyMenu
        menu.addItem(historyRoot)
        self.ipHistoryRootItem = historyRoot
        self.ipHistoryMenu = historyMenu
        rebuildIPHistoryMenu()
        let info = Bundle.main.infoDictionary
        let version = (info?["CFBundleShortVersionString"] as? String) ?? "-"
        let build = (info?["CFBundleVersion"] as? String) ?? "-"
        let execURL = Bundle.main.executableURL
        let attrs = (try? (execURL.flatMap { try FileManager.default.attributesOfItem(atPath: $0.path) })) ?? [:]
        let built = (attrs[.creationDate] as? Date) ?? Date()
        let df = DateFormatter()
        df.dateStyle = .medium
        df.timeStyle = .short
        let builtStr = df.string(from: built)

        let ipItem = NSMenuItem(title: "IP: …", action: nil, keyEquivalent: "")
        ipItem.isEnabled = false
        self.ipMenuItem = ipItem
        let versionItem = NSMenuItem(title: "Version \(version) (\(build))", action: nil, keyEquivalent: "")
        versionItem.isEnabled = false
        let builtItem = NSMenuItem(title: "Built \(builtStr)", action: nil, keyEquivalent: "")
        builtItem.isEnabled = false
        menu.addItem(.separator())
        menu.addItem(ipItem)
        menu.addItem(versionItem)
        menu.addItem(builtItem)
        menu.addItem(.separator())
        let exitItem = NSMenuItem(title: "Exit", action: #selector(quitApp), keyEquivalent: "")
        exitItem.target = self
        menu.addItem(exitItem)
        return menu
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }


    @objc func setGreen() {
        WallpaperManager.shared.setColor(NSColor(calibratedRed: 0.00, green: 0.65, blue: 0.15, alpha: 1))
        state = .green
        refreshIcons()
    }

    @objc func setBlack() {
        WallpaperManager.shared.setColor(.black)
        state = .black
        refreshIcons()
    }

    @objc func setRed() {
        WallpaperManager.shared.setColor(NSColor(calibratedRed: 0.95, green: 0.10, blue: 0.10, alpha: 1))
        state = .red
        refreshIcons()
    }

    // MARK: - IP
    private func menuTintColor() -> NSColor {
        if !monitoringEnabled { return .white }
        // When monitoring is ON but IP is unknown (e.g., during VPN transition), show blue
        guard let ip = currentIP else { return .systemBlue }
        return (ip == targetIP) ? NSColor.systemOrange : NSColor.systemBlue
    }

    private func updatePublicIP() {
        NSLog("updatePublicIP() called - currentIP: \(currentIP ?? "nil")")
        fetchPublicIP { [weak self] ip in
            DispatchQueue.main.async {
                guard let self = self else { return }
                let previousIP = self.currentIP
                self.currentIP = ip
                NSLog("IP update: previous=\(previousIP ?? "nil"), new=\(ip ?? "nil")")
                if previousIP != ip {
                    NSLog("IP changed! Previous: \(previousIP ?? "nil"), New: \(ip ?? "nil")")
                    self.ipConnectedSince = Date()
                    self.startElapsedIPTimer()
                } else {
                    NSLog("IP unchanged: \(ip ?? "nil")")
                }
                self.updateIPMenuTitle()
                if let m = self.monitoringMenuItem {
                    m.state = self.monitoringEnabled ? .on : .off
                }
                if let newIP = ip { self.recordIPIfNeeded(newIP) }
                self.rebuildIPHistoryMenu()
                self.refreshIcons()
                self.enforceChromePolicyIfNeeded()
            }
        }
    }

    private func fetchPublicIP(completion: @escaping (String?) -> Void) {
        guard let url = URL(string: "https://api.ipify.org?format=text") else {
            completion(nil)
            return
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6)
        request.httpMethod = "GET"
        let task = URLSession.shared.dataTask(with: request) { data, _, error in
            guard error == nil, let data = data, let raw = String(data: data, encoding: .utf8) else {
                completion(nil)
                return
            }
            completion(raw.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        task.resume()
    }

    // MARK: - NSMenuDelegate
    func menuWillOpen(_ menu: NSMenu) {
        updatePublicIP()
        if let m = monitoringMenuItem {
            m.state = monitoringEnabled ? .on : .off
        }
        if let a = autoUpdateMenuItem { a.state = autoUpdateEnabled ? .on : .off }
        updateIPMenuTitle()
        rebuildIPHistoryMenu()
    }

    // MARK: - Monitoring
    private var monitoringEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: defaultsKeyMonitoring) }
        set { UserDefaults.standard.set(newValue, forKey: defaultsKeyMonitoring) }
    }

    @objc private func toggleMonitoring() {
        monitoringEnabled.toggle()
        monitoringMenuItem?.state = monitoringEnabled ? .on : .off
        refreshIcons()
        enforceChromePolicyIfNeeded()
    }

    private var autoUpdateEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: defaultsKeyAutoUpdate) }
        set { UserDefaults.standard.set(newValue, forKey: defaultsKeyAutoUpdate) }
    }

    @objc private func toggleAutoUpdate() {
        autoUpdateEnabled.toggle()
        autoUpdateMenuItem?.state = autoUpdateEnabled ? .on : .off
    }

    @objc private func manualCheckUpdate() {
        setUpdateStatus("Checking…")
        checkGitHubForUpdate(installIfNewer: true, feedback: true)
    }

    @objc private func applicationLaunched(_ note: Notification) {
        guard monitoringEnabled else { return }
        guard currentIP == targetIP else { return }
        guard let app = (note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication) else { return }
        guard app.bundleIdentifier == "com.google.Chrome" else { return }
        app.terminate()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            if !app.isTerminated { _ = app.forceTerminate() }
        }
    }

    // MARK: - IP History
    private var ipHistory: [String] {
        get { (UserDefaults.standard.array(forKey: defaultsKeyIPHistory) as? [String]) ?? [] }
        set { UserDefaults.standard.set(newValue, forKey: defaultsKeyIPHistory) }
    }

    private func recordIPIfNeeded(_ ip: String) {
        guard ip != targetIP else { return }
        if currentIP != ip || !ipHistory.contains(ip) {
            var list = ipHistory
            if !list.contains(ip) { list.insert(ip, at: 0) }
            ipHistory = list
        }
    }

    private func rebuildIPHistoryMenu() {
        guard let menu = ipHistoryMenu else { return }
        menu.removeAllItems()
        let list = ipHistory.filter { $0 != targetIP }
        if list.isEmpty {
            let empty = NSMenuItem(title: "No history", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
            return
        }
        for ip in list {
            let item = NSMenuItem(title: ip, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        }
    }

    // MARK: - Ping / Latency
    // Removed latency sampling timer to avoid periodic work

    private func measureLatency() {
        guard let url = URL(string: "https://cloudflare.com/cdn-cgi/trace") else { return }
        let start = CFAbsoluteTimeGetCurrent()
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 3)
        req.httpMethod = "HEAD"
        let task = URLSession.shared.dataTask(with: req) { [weak self] _, response, error in
            let elapsed = (CFAbsoluteTimeGetCurrent() - start) * 1000
            DispatchQueue.main.async {
                if error == nil, let http = response as? HTTPURLResponse, (200...399).contains(http.statusCode) {
                    self?.lastLatencyMs = max(1, Int(elapsed.rounded()))
                } else {
                    self?.lastLatencyMs = nil
                }
                self?.refreshPingUI()
            }
        }
        task.resume()
    }

    private func refreshPingUI() {
        let online = (lastLatencyMs != nil)
        if let b = itemPingBadge.button {
            let text = lastLatencyMs.map { "\($0)ms" } ?? "— ms"
            b.image = StatusIconFactory.renderPingBadge(
                dotColor: online ? .systemBlue : .systemOrange,
                text: text,
                diameter: 18
            )
            b.image?.isTemplate = false
        }
    }

    // MARK: - Network Monitoring
    private func startNetworkMonitoring() {
        // Primary path monitor
        pathMonitor = NWPathMonitor()
        pathMonitor?.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async { self?.handleNetworkPathUpdate(path) }
        }
        let queue = DispatchQueue(label: "NetworkMonitor.primary")
        pathMonitor?.start(queue: queue)

        // Per-interface monitors to better capture transitions (e.g., VPN as .other)
        wifiMonitor = NWPathMonitor(requiredInterfaceType: .wifi)
        wifiMonitor?.pathUpdateHandler = { [weak self] _ in DispatchQueue.main.async { self?.updatePublicIP() } }
        wifiMonitor?.start(queue: DispatchQueue(label: "NetworkMonitor.wifi"))

        wiredMonitor = NWPathMonitor(requiredInterfaceType: .wiredEthernet)
        wiredMonitor?.pathUpdateHandler = { [weak self] _ in DispatchQueue.main.async { self?.updatePublicIP() } }
        wiredMonitor?.start(queue: DispatchQueue(label: "NetworkMonitor.wired"))

        otherMonitor = NWPathMonitor(requiredInterfaceType: .other)
        otherMonitor?.pathUpdateHandler = { [weak self] _ in DispatchQueue.main.async { self?.updatePublicIP() } }
        otherMonitor?.start(queue: DispatchQueue(label: "NetworkMonitor.other"))

        // Start IP change notifications (no polling)
        startIPChangeNotifications()

        // Remove heavy polling; rely on reactive signals
        // startIntelligentIPChecking() // disabled
        
        // Remove interface polling helper; NWPathMonitor + SCDynamicStore should suffice
        // startInterfaceMonitoring() // disabled
    }
    
    private func handleNetworkPathUpdate(_ path: NWPath) {
        NSLog("Network path update: status=\(path.status), availableInterfaces=\(path.availableInterfaces.count)")
        if path.status == .satisfied {
            // Network is available, check IP immediately
            // This will catch VPN connections and other network changes
            NSLog("Network path satisfied, checking IP immediately")
            updatePublicIP()
        } else {
            NSLog("Network path not satisfied, status: \(path.status)")
        }
    }
    
    private func startIPChangeNotifications() {
        var context = SCDynamicStoreContext(
            version: 0,
            info: UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque()),
            retain: nil,
            release: nil,
            copyDescription: nil
        )
        scStore = SCDynamicStoreCreate(
            kCFAllocatorDefault,
            "com.project-torx.torx-mac.ip-monitor" as CFString,
            { (store, changedKeys, info) in
                guard let info = info else { return }
                let me = Unmanaged<StatusController>.fromOpaque(info).takeUnretainedValue()
                NSLog("SCDynamicStore notification: changedKeys=\(changedKeys as? [String] ?? [])")
                DispatchQueue.main.async {
                    me.updatePublicIP()
                }
            },
            &context
        )
        guard let store = scStore else { return }
        let keys: [CFString] = [
            "State:/Network/Global/IPv4" as CFString,
            "State:/Network/Global/IPv6" as CFString,
            "State:/Network/Global/DNS" as CFString,
            "State:/Network/Interface" as CFString
        ]
        let patterns: [CFString] = [
            "State:/Network/Service/.*/IPv4" as CFString,
            "State:/Network/Service/.*/IPv6" as CFString,
            "State:/Network/Service/.*/DNS" as CFString,
            "State:/Network/Service/.*/Interface" as CFString,
            "Setup:/Network/Service/.*/Interface" as CFString,
            "State:/Network/Interface/.*/Link" as CFString,
            "State:/Network/Interface/.*/IPv4" as CFString,
            "State:/Network/Interface/.*/IPv6" as CFString
        ]
        SCDynamicStoreSetNotificationKeys(store, keys as CFArray, patterns as CFArray)
        scRunLoopSource = SCDynamicStoreCreateRunLoopSource(kCFAllocatorDefault, store, 0)
        if let src = scRunLoopSource {
            CFRunLoopAddSource(CFRunLoopGetMain(), src, CFRunLoopMode.commonModes)
        }
        // Trigger initial read once store is set up
        DispatchQueue.main.async { [weak self] in self?.updatePublicIP() }
    }
    
    // disabled: replaced by NWPathMonitor per-interface monitors
    // private func startIntelligentIPChecking() { }
    
    // private func checkIPIfNeeded() { }
    
    // private func startInterfaceMonitoring() { }
    
    // private func monitorInterfaceChanges() { }
    
    // private func getCurrentInterfaces() -> [String] { return [] }

    // MARK: - CPU / RAM Usage
    // Removed CPU/RAM usage timer to avoid periodic work

    private func sampleUsage() {
        var resultRAM: Int = lastRAMPercent
        var resultCPU: Int = lastCPUPercent

        // RAM usage via host_statistics64 (safe access)
        var vmStats = vm_statistics64()
        var countVM = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
        let krVM: kern_return_t = withUnsafeMutablePointer(to: &vmStats) { statsPtr in
            statsPtr.withMemoryRebound(to: integer_t.self, capacity: Int(countVM)) { intPtr in
                host_statistics64(mach_host_self(), HOST_VM_INFO64, intPtr, &countVM)
            }
        }
        if krVM == KERN_SUCCESS {
            let s = vmStats
            let pageSize = UInt64(vm_kernel_page_size)
            // Align with Activity Monitor: Memory Used ≈ active + wired + compressed
            let compressedBytes = UInt64(s.compressor_page_count) * pageSize
            let usedBytes = (UInt64(s.active_count + s.wire_count) * pageSize) + compressedBytes
            // Cached files (inactive + speculative) are not counted as used
            let cachedBytes = UInt64(s.inactive_count + s.speculative_count) * pageSize
            let freeBytes = UInt64(s.free_count) * pageSize
            let totalBytes = usedBytes + cachedBytes + freeBytes
            if totalBytes > 0 {
                resultRAM = Int((Double(usedBytes) / Double(totalBytes)) * 100.0)
            }
        }

        // CPU usage via host_statistics with delta between samples
        var cpuInfo = host_cpu_load_info()
        var countCPU = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.stride / MemoryLayout<integer_t>.stride)
        let krCPU = withUnsafeMutablePointer(to: &cpuInfo) { infoPtr -> kern_return_t in
            infoPtr.withMemoryRebound(to: integer_t.self, capacity: Int(countCPU)) { intPtr in
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, intPtr, &countCPU)
            }
        }
        if krCPU == KERN_SUCCESS {
            let user = Double(cpuInfo.cpu_ticks.0)
            let sys = Double(cpuInfo.cpu_ticks.1)
            let idle = Double(cpuInfo.cpu_ticks.2)
            let nice = Double(cpuInfo.cpu_ticks.3)
            let total = user + sys + idle + nice
            if let lastTotal = lastCPUTotalTicks, let lastIdle = lastCPUIdleTicks {
                let deltaTotal = max(1.0, total - lastTotal)
                let deltaIdle = max(0.0, idle - lastIdle)
                let busy = max(0.0, deltaTotal - deltaIdle)
                resultCPU = Int((busy / deltaTotal) * 100.0)
            }
            lastCPUTotalTicks = total
            lastCPUIdleTicks = idle
        }

        lastCPUPercent = max(0, min(100, resultCPU))
        lastRAMPercent = max(0, min(100, resultRAM))
        refreshUsageUI()
    }

    private func refreshUsageUI() {
        if itemUsageBadge == nil {
            itemUsageBadge = bar.statusItem(withLength: NSStatusItem.variableLength)
        }
        if let b = itemUsageBadge.button {
            b.image = StatusIconFactory.renderTwoLineBadge(topText: "\(lastCPUPercent)%", bottomText: "\(lastRAMPercent)%", diameter: 18)
            b.image?.isTemplate = false
            b.toolTip = "CPU / RAM"
        }
    }

    // MARK: - Local Updates (Downloads)
    private func scheduleUpdateChecks() {
        updateTimer?.invalidate()
        updateTimer = Timer.scheduledTimer(withTimeInterval: 4 * 60 * 60, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if self.autoUpdateEnabled {
                self.checkGitHubForUpdate(installIfNewer: true, feedback: false)
            }
        }
        if let t = updateTimer { RunLoop.main.add(t, forMode: .common) }
    }

    // Removed legacy SMB/local update flow

    private func currentVersion() -> (String, String) {
        let info = Bundle.main.infoDictionary
        let short = (info?["CFBundleShortVersionString"] as? String) ?? "0"
        let build = (info?["CFBundleVersion"] as? String) ?? "0"
        return (short, build)
    }

    private func versionOfApp(at appURL: URL) -> (String, String)? {
        let infoURL = appURL.appendingPathComponent("Contents/Info.plist")
        guard let data = try? Data(contentsOf: infoURL) else { return nil }
        var format = PropertyListSerialization.PropertyListFormat.xml
        guard let dict = try? PropertyListSerialization.propertyList(from: data, options: [], format: &format) as? [String: Any] else { return nil }
        let short = (dict["CFBundleShortVersionString"] as? String) ?? "0"
        let build = (dict["CFBundleVersion"] as? String) ?? "0"
        return (short, build)
    }

    private func parseVersionFromTag(_ tag: String) -> (String, String) {
        // Remove 'v' prefix if present and extract version
        let cleanTag = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        let parts = cleanTag.split(separator: ".")
        let major = parts.count > 0 ? String(parts[0]) : "0"
        let minor = parts.count > 1 ? String(parts[1]) : "0"
        let patch = parts.count > 2 ? String(parts[2]) : "0"
        let version = "\(major).\(minor).\(patch)"
        return (version, "0") // GitHub releases don't have build numbers
    }

    private func isNewer(_ a: (String, String), than b: (String, String)) -> Bool {
        let ac = a.0.split(separator: ".").map { Int($0) ?? 0 }
        let bc = b.0.split(separator: ".").map { Int($0) ?? 0 }
        let n = max(ac.count, bc.count)
        for i in 0..<n {
            let av = i < ac.count ? ac[i] : 0
            let bv = i < bc.count ? bc[i] : 0
            if av != bv { return av > bv }
        }
        // If short versions equal, compare build numbers lexicographically as integers
        let ab = Int(a.1) ?? 0
        let bb = Int(b.1) ?? 0
        return ab > bb
    }

    private func copyToDownloadsAndRelaunch(from sourceApp: URL) {
        guard let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first else { return }
        let dest = downloads.appendingPathComponent("Torx.app", isDirectory: true)
        let fm = FileManager.default
        do {
            if fm.fileExists(atPath: dest.path) {
                try? fm.removeItem(at: dest)
            }
            try fm.copyItem(at: sourceApp, to: dest)
            NSWorkspace.shared.open(dest)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { NSApp.terminate(nil) }
        } catch {
            NSLog("Update copy failed: \(error.localizedDescription)")
            setUpdateStatus("Install failed: \(error.localizedDescription)")
        }
    }

    private func setUpdateStatus(_ text: String) {
        updateStatusMenuItem?.title = "Update: \(text)"
    }

    // MARK: - GitHub Releases Updater (private repo support via token)
    private func checkGitHubForUpdate(installIfNewer: Bool, feedback: Bool = false) {
        let session = URLSession(configuration: .ephemeral)
        guard let url = URL(string: "https://api.github.com/repos/\(effectiveOwner)/\(effectiveRepo)/releases/latest") else { return }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        req.httpMethod = "GET"
        if let token = effectiveToken { req.addValue("token \(token)", forHTTPHeaderField: "Authorization") }
        req.addValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        let task = session.dataTask(with: req) { [weak self] data, resp, error in
            guard let self = self else { return }
            if let e = error { DispatchQueue.main.async { if feedback { self.setUpdateStatus("Error: \(e.localizedDescription)") } }; return }
            guard let data = data, let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                DispatchQueue.main.async { if feedback { self.setUpdateStatus("Invalid response") } }
                return
            }
            let tag = (obj["tag_name"] as? String) ?? ""
            let assets = (obj["assets"] as? [[String: Any]]) ?? []
            let zipAsset = assets.first { (a) in
                let n = (a["name"] as? String)?.lowercased() ?? ""
                return n.hasSuffix(".zip") && n.contains("torx")
            }
            guard let asset = zipAsset, let dl = asset["browser_download_url"] as? String, let dlURL = URL(string: dl) else {
                DispatchQueue.main.async { if feedback { self.setUpdateStatus("No asset found") } }
                return
            }
            // Compare current app version with GitHub release tag
            let currentVersion = self.currentVersion()
            let releaseVersion = self.parseVersionFromTag(tag)
            
            // Check if we already processed this release
            let last = UserDefaults.standard.string(forKey: self.defaultsKeyLastReleaseTag)
            if let last = last, last == tag, !installIfNewer {
                DispatchQueue.main.async { if feedback { self.setUpdateStatus("Up to date") } }
                return
            }
            
            // Check if the release is actually newer than current version
            if !self.isNewer(releaseVersion, than: currentVersion) {
                DispatchQueue.main.async { if feedback { self.setUpdateStatus("Up to date") } }
                return
            }
            if feedback { DispatchQueue.main.async { self.setUpdateStatus("Downloading…") } }
            self.downloadAndInstall(from: dlURL, tag: tag, token: ProcessInfo.processInfo.environment["TORX_GH_TOKEN"], feedback: feedback)
        }
        task.resume()
    }

    private func downloadAndInstall(from url: URL, tag: String, token: String?, feedback: Bool) {
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        if let token = token, !token.isEmpty { req.addValue("token \(token)", forHTTPHeaderField: "Authorization") }
        let task = URLSession.shared.downloadTask(with: req) { [weak self] temp, resp, error in
            guard let self = self else { return }
            if let e = error { DispatchQueue.main.async { if feedback { self.setUpdateStatus("Download error: \(e.localizedDescription)") } }; return }
            guard let temp = temp else { DispatchQueue.main.async { if feedback { self.setUpdateStatus("Download missing") } }; return }
            // Unzip into a temp dir, find .app, copy to Downloads, relaunch
            let fm = FileManager.default
            let work = (try? fm.url(for: .itemReplacementDirectory, in: .userDomainMask, appropriateFor: temp, create: true)) ?? temp.deletingLastPathComponent().appendingPathComponent("unzip_work_\(UUID().uuidString)")
            try? fm.createDirectory(at: work, withIntermediateDirectories: true)
            let proc = Process()
            proc.launchPath = "/usr/bin/ditto"
            proc.arguments = ["-x", "-k", temp.path, work.path]
            let pipe = Pipe()
            proc.standardOutput = pipe
            proc.standardError = pipe
            proc.launch()
            proc.waitUntilExit()
            let apps = (try? fm.contentsOfDirectory(at: work, includingPropertiesForKeys: nil))?.filter { $0.pathExtension == "app" } ?? []
            guard let app = apps.first else { DispatchQueue.main.async { if feedback { self.setUpdateStatus("App not found in zip") } }; return }
            DispatchQueue.main.async {
                self.setUpdateStatus("Installing…")
                self.copyToDownloadsAndRelaunch(from: app)
                UserDefaults.standard.set(tag, forKey: self.defaultsKeyLastReleaseTag)
            }
        }
        task.resume()
    }

    // MARK: - IP elapsed helpers
    private func startElapsedIPTimer() {
        elapsedIPTimer?.invalidate()
        elapsedIPTimer = Timer.scheduledTimer(withTimeInterval: 60.0, repeats: true) { [weak self] _ in
            self?.updateIPMenuTitle()
        }
        if let t = elapsedIPTimer { RunLoop.main.add(t, forMode: .common) }
    }

    private func updateIPMenuTitle() {
        guard let item = ipMenuItem else { return }
        let ipText = currentIP ?? "-"
        let elapsedText = ipConnectedSince.flatMap { formatElapsed(since: $0) } ?? "—"
        item.title = "IP: \(ipText)  \(elapsedText)"
    }

    private func formatElapsed(since: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(since))
        if seconds < 0 { return "0m" }
        let minutes = seconds / 60
        let hours = minutes / 60
        let days = hours / 24
        if hours == 0 { return "\(minutes)m" }
        if days == 0 { return "\(hours)h \(minutes % 60)m" }
        return "\(days)d \(hours % 24)h \(minutes % 60)m"
    }

    // MARK: - Enforcement
    private func enforceChromePolicyIfNeeded() {
        let shouldEnforce = monitoringEnabled && (currentIP == targetIP)
        NSLog("enforceChromePolicyIfNeeded: monitoring=\(monitoringEnabled), currentIP=\(currentIP ?? "nil"), targetIP=\(targetIP), shouldEnforce=\(shouldEnforce)")
        if shouldEnforce {
            if enforcementTimer == nil {
                NSLog("Starting enforcement timer")
                enforcementTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
                    self?.closeChromeIfRunning()
                }
                if let t = enforcementTimer { RunLoop.main.add(t, forMode: .common) }
            }
            closeChromeIfRunning()
        } else {
            enforcementTimer?.invalidate()
            enforcementTimer = nil
        }
    }

    private func closeChromeIfRunning() {
        NSLog("closeChromeIfRunning() called")
        let bundleIds = [
            "com.google.Chrome",
            "com.google.Chrome.beta",
            "com.google.Chrome.dev",
            "com.google.Chrome.canary"
        ]
        var anyFound = false
        for bid in bundleIds {
            let running = NSRunningApplication.runningApplications(withBundleIdentifier: bid)
            if running.isEmpty { continue }
            anyFound = true
            NSLog("Found Chrome variant: \(bid), count: \(running.count)")
            let appName: String
            switch bid {
            case "com.google.Chrome": appName = "Google Chrome"
            case "com.google.Chrome.beta": appName = "Google Chrome Beta"
            case "com.google.Chrome.dev": appName = "Google Chrome Dev"
            case "com.google.Chrome.canary": appName = "Google Chrome Canary"
            default: appName = "Google Chrome"
            }

            let scriptSource = """
            tell application \(String(reflecting: appName))
                try
                    quit
                end try
            end tell
            """
            if let script = NSAppleScript(source: scriptSource) {
                var error: NSDictionary?
                script.executeAndReturnError(&error)
                if error != nil {
                    NSLog("AppleScript failed, using killall")
                    // Use killall as fallback
                    let task = Process()
                    task.launchPath = "/usr/bin/killall"
                    task.arguments = [appName]
                    task.launch()
                    task.waitUntilExit()
                }
            } else {
                NSLog("AppleScript creation failed, using killall")
                // Use killall as fallback
                let task = Process()
                task.launchPath = "/usr/bin/killall"
                task.arguments = [appName]
                task.launch()
                task.waitUntilExit()
            }

            // Final check and escalation if the process lingers
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                let still = NSRunningApplication.runningApplications(withBundleIdentifier: bid)
                for app in still {
                    app.terminate()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                        if !app.isTerminated { _ = app.forceTerminate() }
                    }
                }
            }
        }
        if !anyFound { return }
    }
    
    private func requestAppleEventsPermission() {
        // Try to execute a simple AppleScript to trigger permission request
        let scriptSource = """
        tell application "System Events"
            return name of every process
        end tell
        """
        if let script = NSAppleScript(source: scriptSource) {
            var error: NSDictionary?
            script.executeAndReturnError(&error)
            // We don't care about the result, just triggering the permission request
        }
    }
}


