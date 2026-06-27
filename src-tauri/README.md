# Portfolio Tracker — Tauri wrapper

This folder contains a [Tauri v2](https://tauri.app) wrapper that compiles the
web app into native binaries for **Windows, macOS, Linux (deb / rpm / AppImage),
Android and iOS**. The wrapper loads the published web app
(`https://financetracker.putopulse.org`) inside a native webview, so all data
still lives locally in the user's browser storage.

## Prerequisites

Install once on your build machine:

- Rust (`https://www.rust-lang.org/tools/install`)
- Tauri CLI: `cargo install tauri-cli --version "^2.0" --locked`
- Platform toolchains:
  - **macOS**: Xcode + Command Line Tools
  - **Windows**: Visual Studio 2022 Build Tools (Desktop development with C++)
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, `rpm`
  - **Android**: Android Studio + NDK, set `ANDROID_HOME` and `NDK_HOME`
  - **iOS**: Xcode + `rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim`

## Icons

Place a square 1024×1024 PNG in `src-tauri/app-icon.png`, then run:

```
cargo tauri icon src-tauri/app-icon.png
```

This regenerates everything under `src-tauri/icons/`.

## Build

From the project root:

```
# Desktop (current OS)
cargo tauri build

# Linux specific bundles
cargo tauri build --bundles deb,rpm,appimage

# Windows
cargo tauri build --bundles msi,nsis

# macOS
cargo tauri build --bundles app,dmg

# Android (first time)
cargo tauri android init
cargo tauri android build

# iOS (first time, macOS only)
cargo tauri ios init
cargo tauri ios build
```

Artifacts land under `src-tauri/target/release/bundle/` (desktop) and
`src-tauri/gen/android` / `src-tauri/gen/apple` for mobile.

## Continuous releases

A ready-to-use GitHub Actions workflow lives at
`.github/workflows/tauri-release.yml`. Push a tag like `v0.1.0` and it builds
all desktop targets and attaches the binaries to a GitHub Release. Mobile
builds run on the same workflow but require additional signing secrets — see
the comments in the workflow file.
