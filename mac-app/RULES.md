## Torx Project Rules

### Build & Run
- Always build the app and copy it to the repo root as `Torx.app` for quick testing.
- Before launching a fresh build, terminate any existing `Torx.app` and then open the new one.

### Networking & Monitoring
- Use Apple native frameworks for reactivity:
  - Network path changes with `Network.NWPathMonitor`.
  - IP/address configuration changes with `SystemConfiguration.SCDynamicStore` notifications.
- Avoid polling for IP changes.

### Auto-Update
- Releases are fetched from GitHub Releases (`/releases/latest`).
- Release asset must be a `.zip` containing `torx` in the name (e.g., `Torx-vX.Y.Z.zip`).
- The app compares its `CFBundleShortVersionString` to the GitHub tag (e.g., `vX.Y.Z`).

### Permissions
- App Sandbox enabled.
- Require outbound network (`com.apple.security.network.client`).
- Automation/Apple Events allowed with temporary exception for Chrome bundles.

### Development Conventions
- Modify only what's needed; keep coding style consistent with existing files.
- Keep comments minimal and purposeful.
- Prefer concise, readable code with meaningful names.

### Release Process
1. Build Release with Xcode.
2. Zip the `.app` into `Torx-vX.Y.Z.zip`.
3. Tag `vX.Y.Z`, push `main` and the tag.
4. Publish GitHub release attaching the zip (use `gh release create`).

### Testing
- Verify background IP-reactivity by toggling VPN; UI/Chrome enforcement should react without opening the menu.
- Test auto-update by creating a newer tag and using "Check for Updates Now".

### Repo Remotes
- Primary personal remote: `origin-personal`.
- Use it for pushing `main` and tags when needed.


