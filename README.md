# Aurelia Asset — Portfolio Tracker (React Native)

Privacy-first personal finance and portfolio tracker. **React Native CLI** (no Expo / EAS). Data, LLM, and speech stay on-device.

| Surface | Location |
|--------|----------|
| **Native tracker** (Android / iOS / Windows / macOS) | Repo root |
| **Linux desktop** | `npm run web` → React Native Web |
| **Marketing site + admin** | [`web/`](./web/) (separate TanStack build) |
| **Legacy Tauri** | [`archive/src-tauri/`](./archive/src-tauri/) (reference only) |

Live site (landing): [financetracker.putopulse.org](https://financetracker.putopulse.org)

## Features (native app)

- Cashflow, holdings, performance, planning, offline AI assistant
- Encrypted local persistence (AsyncStorage + AES-GCM)
- JSON import/export, cashflow CSV/PDF, chart PNG capture (`react-native-view-shot`)
- Optional online market quotes (Yahoo / Stooq / CoinGecko / Binance / Finnhub)
- Local LLM via **llama.rn** · Speech via **@siteed/sherpa-onnx.rn**
- In-app model download (GGUF + Sherpa archives) from Settings

## Prerequisites

| Platform | Tools |
|----------|--------|
| All | Node.js ≥ 22.11, JDK 17+, npm |
| Android | Android Studio, SDK 24+, emulator or device |
| iOS | macOS, Xcode 15+, CocoaPods |
| Windows | Visual Studio 2022 with C++ desktop + UWP/WinUI workloads, [RN Windows guide](https://microsoft.github.io/react-native-windows/) |
| macOS (RN) | Xcode + `react-native-macos` init (see below) |
| Linux | Modern browser for RN Web build |

```bash
npm ci
```

## Run (development)

```bash
# Metro
npm start

# Android
npm run android

# iOS (macOS host)
cd ios && bundle install && bundle exec pod install && cd ..
npm run ios

# Linux / local web (RN Web)
npm run web
```

## Local AI models

1. Place a GGUF (e.g. `models/qwen2.5-1.5b-instruct-q4_k_m.gguf`) on device storage.
2. In **Settings → Local AI**, pick the LLM file and STT/TTS model folders (Sherpa-ONNX layouts).
3. Optional: `npm run setup:models` copies the bundled GGUF into Android assets for packaging hints.

Sherpa native Linux libs used by the old Tauri build remain under `native/sherpa-onnx/` for reference when linking desktop natives.

## Build / release (local only — no cloud)

### Android

```bash
npm ci
npm run setup:models   # optional
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/
```

### iOS

```bash
npm ci
cd ios && bundle exec pod install && cd ..
npx react-native run-ios --mode Release
# or archive from Xcode → Product → Archive
```

### Windows (`react-native-windows`)

On a Windows machine:

```bash
npm ci
npx react-native init-windows --overwrite
npm run windows
# Release: open windows/*.sln in Visual Studio → Release|x64
```

### macOS (`react-native-macos`)

On a Mac:

```bash
npm ci
npx react-native-macos-init
cd macos && pod install && cd ..
npm run macos
```

### Linux (RN Web)

```bash
npm ci
npm run web:build
# Serve web-app/dist locally (any static server), e.g.:
npx --yes serve web-app/dist
```

**Limitation:** llama.rn and sherpa-onnx.rn do not run in the browser. Linux web uses the built-in NLU assistant; use Android/iOS/Windows/macOS for full local LLM/STT/TTS.

### Marketing / admin site

```bash
cd web && npm ci && npm run build
```

## Project structure

```
App.tsx                 # RN entry UI shell
src/
  screens/              # Tracker screens (no landing/admin)
  navigation/           # React Navigation tabs
  lib/                  # Domain: types, store, finance, AI, export
  platform/             # llama.rn + sherpa wrappers
  components/           # ChartFrame, shared UI
  i18n/                 # Locales
android/ ios/           # Native projects
web/                    # Separate site (landing + admin)
web-app/                # RN Web (Linux) Vite entry
archive/src-tauri/      # Former Tauri host
models/                 # Optional local GGUF
```

## Testing key features

1. **Import/export** — Settings → Export JSON → Import JSON on another install.
2. **Chart capture** — Dashboard / Cashflow Sankey → Save PNG → share/Downloads.
3. **Cashflow Sankey** — Cashflow tab → pick period → Sankey diagram + long-press to delete.
4. **Cashflow export** — Export period CSV or PDF (summary, balance chart, entry table).
5. **Assistant NLU** — Assistant tab → “I spent 12 on food” → Confirm.
6. **Voice I/O** — Settings: set Sherpa STT/TTS model folders → Assistant Mic button → speak → reply (optional TTS toggle).
7. **Local LLM** — Settings pick or download GGUF → ask a spending question (device with enough RAM).
8. **Model download** — Settings → Local AI → Download LLM / STT / TTS (or Download all).

## License

AGPL-3.0-or-later. See [LICENSE](./LICENSE), [PRIVACY.md](./PRIVACY.md), [SECURITY.md](./SECURITY.md).
