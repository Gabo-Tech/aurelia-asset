## Goal

Build installers for **all platforms** in CI on tag push, all unsigned, distributed by direct download from the website. No App Store, no code-signing certs, no secrets required.

## Reality of "unsigned" per platform

| Platform | What CI produces | User experience |
|---|---|---|
| Linux | `.deb`, `.rpm`, `.AppImage` | Install normally, no warning |
| Windows | `.msi`, `.exe` (NSIS) | SmartScreen warns first time → "More info" → "Run anyway" |
| macOS | `.dmg` (universal) | Gatekeeper blocks → right-click → Open → confirm. Quarantine attribute requires `xattr -dr com.apple.quarantine` if downloaded via Safari |
| Android | `.apk` (signed with auto-generated debug key) | "Unknown sources" prompt, then installs |
| iOS | unsigned `.ipa` | Requires AltStore / Sideloadly + user's free Apple ID, re-sign every 7 days |

No GitHub secrets needed for any of this. Android already has a debug-key fallback in the workflow.

## Changes

### 1. `.github/workflows/tauri-release.yml`
- **Android**: keep the keystore-signing block but make it conditional - if no `ANDROID_KEYSTORE_BASE64` secret, fall back to building debug APK (`cargo tauri android build --apk --debug`). Currently it requires the secret.
- **iOS**: add new `ios` job on `macos-latest`:
  - Install Rust iOS targets (`aarch64-apple-ios`, `x86_64-apple-ios`, `aarch64-apple-ios-sim`)
  - `cargo install tauri-cli`
  - `cargo tauri ios init`
  - Patch generated Xcode project to disable code signing (`CODE_SIGNING_REQUIRED=NO`, `CODE_SIGN_IDENTITY=""`, `CODE_SIGNING_ALLOWED=NO`) via `xcodebuild` flags
  - `cargo tauri ios build --export-method debugging` then repackage `.app` → unsigned `.ipa` by zipping into a `Payload/` folder
  - Upload `.ipa` to the GitHub release alongside the other artifacts
- **macOS / Windows**: leave as-is - they already build unsigned by default.

### 2. `src-tauri/README.md`
- Replace the signing-secrets section with a short "Distribution & first-run warnings" table mirroring the matrix above, so users know what to expect.
- Add a "How to install the unsigned .ipa" subsection pointing to AltStore + Sideloadly.

### 3. Landing page Downloads section
- Currently Windows / macOS / iOS are marked "coming soon".
- Replace with real download links pointing to the latest GitHub release assets (`https://github.com/<owner>/<repo>/releases/latest/download/<file>`).
- Per-platform notes/tooltips:
  - macOS: "Right-click → Open on first launch"
  - Windows: "Click 'More info' → 'Run anyway' on SmartScreen"
  - iOS: "Requires AltStore or Sideloadly"
  - Android: "Enable installs from unknown sources"
- Translate the new strings in all 6 locales (`en`, `es`, `ca`, `pt`, `nl`, `de`) under the existing landing namespace.

### 4. Repo name source
- The GitHub repo name comes from the `GITHUB_REPO` runtime secret already set in this project; I'll read it to wire the download URLs, falling back to `import.meta.env.VITE_GITHUB_REPO` so the landing page doesn't need a server call.
- If not present at build time, links degrade to a generic "Latest releases" GitHub link.

## What's NOT in scope
- Auto-update (Tauri updater) - would require a signing key. Skip for now; users re-download.
- macOS notarization, Windows code-signing, iOS provisioning - all explicitly out per your decision.
- Publishing to Play Store / App Store / Microsoft Store.

## After merge

Tag a release: `git tag v0.1.0 && git push --tags`. CI produces (~25-40 min):
- `*.deb`, `*.rpm`, `*.AppImage`
- `*.msi`, `*-setup.exe`
- `*.dmg` (universal)
- `*.apk` (debug-signed)
- `*.ipa` (unsigned)

All attached to a draft GitHub Release. You publish the release, and the landing page's "latest" links start working immediately.