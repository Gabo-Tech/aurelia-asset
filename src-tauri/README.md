# Portfolio Tracker - Tauri wrapper

[Tauri v2](https://tauri.app) wrapper that compiles the web app into native
binaries for **Windows, macOS, Linux (deb / rpm / AppImage), Android and iOS**.
The wrapper loads the published web app inside a native webview, so all data
still lives locally in the user's browser storage.

## Continuous releases (recommended)

Push a `v*` tag and `.github/workflows/tauri-release.yml` builds everything and
attaches it to a draft GitHub Release:

```
git tag v0.1.0
git push --tags
```

Artifacts produced:

| File                           | Platform          |
| ------------------------------ | ----------------- |
| `*.deb`, `*.rpm`, `*.AppImage` | Linux             |
| `*.msi`, `*-setup.exe`         | Windows           |
| `*.dmg`                        | macOS (universal) |
| `*.apk` (+ `.aab` if signed)   | Android           |
| `*-unsigned.ipa`               | iOS               |

**No signing secrets are required.** All builds ship unsigned. If you later add
an Android release keystore (set `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` repo
secrets), the workflow automatically switches to a signed release APK + AAB.

## Distribution & first-run warnings

| Platform               | What users see                        | Workaround                                                                                                                          |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Linux deb/rpm/AppImage | Installs normally                     | None                                                                                                                                |
| Windows .msi/.exe      | SmartScreen blocks first run          | Click "More info" > "Run anyway"                                                                                                    |
| macOS .dmg             | Gatekeeper blocks first launch        | Right-click the app > Open > confirm. If Safari quarantines: `xattr -dr com.apple.quarantine /Applications/Portfolio\ Tracker.app`  |
| Android .apk           | "Install from unknown sources" prompt | Enable in Settings > Security                                                                                                       |
| iOS .ipa (unsigned)    | iOS refuses direct install            | Install with [AltStore](https://altstore.io) or [Sideloadly](https://sideloadly.io) using your free Apple ID. Re-sign every 7 days. |

## Local builds

```
# Desktop (current OS)
cargo tauri build

# Linux
cargo tauri build --bundles deb,rpm,appimage

# Windows (on Windows)
cargo tauri build --bundles msi,nsis

# macOS (on macOS)
cargo tauri build --bundles app,dmg

# Android (first time)
cargo tauri android init
cargo tauri android build --apk

# iOS (first time, macOS only)
cargo tauri ios init
cargo tauri ios build
```

Requires: Rust, `cargo install tauri-cli --version "^2.0" --locked`, plus the
platform toolchain (Xcode, VS 2022 Build Tools, Android Studio + NDK, or the
Linux dev packages: `libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf rpm`).

## Icons

Place a 1024x1024 PNG at `src-tauri/app-icon.png`, then regenerate all
platform icons (desktop bundles, iOS, and Android):

```
cargo tauri icon src-tauri/app-icon.png
```

**Android note:** `src-tauri/gen/android` is gitignored and recreated by
`cargo tauri android init` with the default Tauri launcher art. Always run
`cargo tauri icon` again after `android init`, before `cargo tauri android build`.
