## Torx (macOS)

Small macOS menu bar app to monitor public IP and enforce a workflow.

### What it does
- Shows a gamepad menu icon tinted by monitoring/IP state:
  - Monitoring OFF → white
  - Monitoring ON + IP = 185.87.45.245 → orange
  - Monitoring ON + IP ≠ 185.87.45.245 → blue
- Displays current public IP and an IP History (excluding 185.87.45.245).
- Option to enable/disable monitoring (default ON) from the menu.
- When monitoring is ON and IP matches 185.87.45.245, closes Google Chrome.
  

### How it works
- Status bar items/UI and logic live in `torx-mac/StatusController.swift`.
- Public IP is fetched via `https://api.ipify.org?format=text`.
- IP History persists in `UserDefaults` (`TorxIPHistory`).
- Monitoring setting persists in `UserDefaults` (`TorxMonitoringEnabled`, default true).
- Chrome enforcement uses AppleScript (requires Automation permission) and also observes app launches.
  

### Networking model (reactive, no polling)
- Network path changes are observed with Apple's `Network` framework (`NWPathMonitor`), including per-interface monitors (`.wifi`, `.wiredEthernet`, `.other`).
- Public IP changes are observed with `SystemConfiguration` (`SCDynamicStore`) notifications for IPv4/IPv6/DNS/interface changes.
- No periodic timers are used for IP detection; updates are reactive to system notifications.
- Opening the menu also triggers an on-demand IP refresh.

### Permissions & entitlements
- App Sandbox enabled.
- Outbound network: `com.apple.security.network.client`.
- Automation / Apple Events: `com.apple.security.automation.apple-events` with temporary exception for `com.google.Chrome`.
- On first use, macOS will ask to allow controlling Google Chrome. Approve in System Settings → Privacy & Security → Automation.

### Configuration
- Target IP constant: `targetIP` in `StatusController.swift` (default `185.87.45.245`).
- Monitoring default: registered in `StatusController.init()` (on by default).
- Ping interval/endpoint: see `measureLatency()` in `StatusController.swift`.

### Auto-update (GitHub Releases)
- Manual: Menu → "Check for Updates Now".
- Automatic: every ~4 hours when "Automatic Updates (GitHub)" is enabled.
- Looks up the latest release from `https://api.github.com/repos/<owner>/<repo>/releases/latest`.
- Picks a `.zip` asset whose name contains "torx" (e.g., `Torx-v1.1.1.zip`).
- Compares app version with release tag (e.g., `v1.1.1`) and downloads if newer. Installs to `~/Downloads/Torx.app` and relaunches.

### Build & run
#### Xcode
1. Open `torx-mac.xcodeproj` in Xcode.
2. Select the `torx-mac` scheme, run.

#### CLI
```bash
xcodebuild -project torx-mac.xcodeproj -scheme "torx-mac" -configuration Debug -destination 'platform=macOS' -derivedDataPath build clean build
cp -R build/Build/Products/Debug/torx-mac.app ./Torx.app
open ./Torx.app
```

#### One-step build to Torx.app in repo root
```bash
# Builds Debug by default, copies to ./Torx.app and opens it
./build_root_app.sh

# Optional: build Release
CONFIGURATION=Release ./build_root_app.sh

# Skip auto-open
OPEN_AFTER_BUILD=0 ./build_root_app.sh
```

#### Make a release (manual)
```bash
# Build Release
xcodebuild -project torx-mac.xcodeproj -scheme "torx-mac" -configuration Release -destination 'platform=macOS' -derivedDataPath build clean build

# Zip the .app
cd build/Build/Products/Release
zip -r ../../../Torx-vX.Y.Z.zip torx-mac.app
cd -

# Tag and push
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin-personal main
git push origin-personal vX.Y.Z

# Publish GitHub release (requires gh CLI auth)
gh release create vX.Y.Z build/Torx-vX.Y.Z.zip -t "Release vX.Y.Z" -n "Notes..."
```

### Troubleshooting
- No IP displayed: ensure network entitlement is present and Internet is reachable.
- Chrome not closing: verify Automation permission is granted for Chrome under System Settings → Privacy & Security → Automation.
- Icon colors not matching: toggle Monitoring in the menu to force an update, or open the menu to trigger an IP refresh.
 - Auto-update not triggering: ensure the release zip is named with "torx" and ends with `.zip`, and that the app version is lower than the tag.

### Notes
- The app is menu-only; there is no main window.
- Wallpaper color controls are available via arrow icons (green/red/black) if present.

