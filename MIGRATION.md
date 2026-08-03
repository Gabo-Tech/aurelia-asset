# Migration notes

## Decisions (locked)

1. **Android = native RN tracker** — `App.tsx` mounts `RootNavigator` (Obsidian + gold UI). Offline store, llama.rn, Sherpa, and file I/O stay on-device.
2. **Linux = Tauri + web SPA** — `web/src-tauri/` hosts the aligned Dark Luxury SPA with optional `local-ai` (llama + Sherpa).
3. **Web site** — Landing + admin + tracker UI live in `web/` (TanStack Start). Theme defaults to dark Obsidian gold.
4. **Optional online market data** — Quotes stay available; core finance data is local.

## Architecture (current)

```
Android RN ──► RootNavigator ──► src/screens/*
                │
                └── llama.rn / sherpa / RNFS / AsyncStorage

Linux Tauri ──WebView──► web/.output/public ──► same SPA (dark luxury)
                └── invoke() ──► Rust commands (ai/export/models)
```

`WebShell` (WebView bridge) remains in the repo for reference but is **not** the default Android entry.

## Visual language

- Obsidian charcoal `#0a0a0b` / `#141416`, warm gold `#c5a880`
- Native fonts: Fraunces (display) + Manrope (UI) in `assets/fonts/`
- Web fonts: same families via Google Fonts; `.dark` tokens aligned 1:1 with native

## Build outputs

| Target | Command | Output |
|--------|---------|--------|
| Android (release, signed) | `cd android && ./gradlew :app:assembleRelease` | `android/app/build/outputs/apk/release/app-release.apk` |
| Linux (Tauri + local-ai) | `cd web && bash scripts/tauri-build-local-ai.sh` | `web/src-tauri/target/release/bundle/{deb,appimage}/` |
| Linux RN Web (optional) | `npm run web:build` | `web-app/dist/` |
| Android (install) | `adb install -r android/app/build/outputs/apk/release/app-release.apk` | device/emulator |

### Release signing

Signing reads `android/keystore.properties` (gitignored) → `android/app/aurelia-release.keystore` (gitignored).

## Remaining TODOs (host/device)

- [ ] `react-native-windows` / `react-native-macos` native trees
- [ ] iOS build (macOS + Xcode)
- [ ] Per-ABI APK splits / signed AAB
- [ ] End-to-end device verification of model download / STT / TTS
