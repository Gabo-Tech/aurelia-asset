# Aurelia Asset

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
[![TanStack Start](https://img.shields.io/badge/TanStack-Start-000000)](https://tanstack.com/start)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB)](https://tauri.app)
[![Cloudflare Workers](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-F38020)](https://workers.cloudflare.com)

> Privacy-first personal finance and portfolio tracker. Cashflow, holdings,
> performance, budgets, savings goals, loans and forecasts — stored locally,
> encrypted in your browser, available as a web app or native desktop/mobile
> build via Tauri.

**[Live demo](https://financetracker.putopulse.org)** · Made by [GABO](https://solutions.gabo.rocks) · [Source code](https://github.com/Gabo-Tech/aurelia-asset)

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Documentation map](#documentation-map)
- [Environment variables](#environment-variables)
- [Using the app](#using-the-app)
- [Import file format](#import-file-format)
- [Finance providers & API keys](#finance-providers--api-keys)
- [Local AI models (native builds)](#local-ai-models-native-builds)
- [Native builds & releases](#native-builds--releases)
- [Self-hosting](#self-hosting)
- [License](#license)
- [Security & contributing](#security--contributing)

## Features

- **Cashflow** — recurring income/expenses, categories, transfers, credit cards, installments, Sankey visualisation
- **Holdings** — buy/sell transactions, horizons, multi-currency support
- **Performance** — time-weighted return via Finnhub, Yahoo Finance, Stooq, CoinGecko, Binance
- **Planning** — budgets, savings goals, loan amortization, 24-month forecast
- **AI Assistant** (`/assistant`) — offline chat, voice I/O, natural-language expense logging (built-in NLU on web; optional local LLM + Sherpa-ONNX on native)
- **Multilingual** — English, Spanish, Portuguese, Dutch, German, Valencian
- **Privacy** — local-only data, AES-GCM encryption, JSON/PDF export
- **Native builds** — Windows, macOS, Linux, Android, iOS (via Tauri)

## Quick start

```bash
npm ci                    # or: bun install
cp .env.example .env      # optional — see Environment variables
npm run dev
```

Open http://localhost:8080. Without env vars the app runs — finance data falls
back to public providers and the admin panel is disabled.

## Documentation map

| Topic                      | Where                                              |
| -------------------------- | -------------------------------------------------- |
| Import/export JSON schema  | [Import file format](#import-file-format)          |
| Finnhub key & CORS proxies | [Finance providers](#finance-providers--api-keys)  |
| Local LLM / voice models   | [Local AI models](#local-ai-models-native-builds)  |
| Desktop & mobile builds    | [Native builds](#native-builds--releases)          |
| Privacy & data flows       | [PRIVACY.md](./PRIVACY.md)                         |
| Security reporting         | [SECURITY.md](./SECURITY.md)                       |
| Contributing               | [CONTRIBUTING.md](./CONTRIBUTING.md)               |
| Code of conduct            | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)         |
| Third-party licenses       | [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) |

## Environment variables

All variables are **server-side only** — never exposed to the browser bundle.
See [`.env.example`](./.env.example).

| Variable          | Required | Purpose                                                               |
| ----------------- | -------- | --------------------------------------------------------------------- |
| `SITE_URL`        | No       | Canonical URL for SEO/OG tags (defaults to production URL)            |
| `FINNHUB_API_KEY` | No       | Finnhub token for `/api/finance-proxy` (recommended for self-hosting) |
| `ADMIN_PASSWORD`  | No       | Enables `/admin` sponsors panel                                       |
| `GITHUB_REPO`     | No       | `owner/repo` for sponsor persistence                                  |
| `GITHUB_BRANCH`   | No       | Branch for sponsor commits (default: `main`)                          |
| `GITHUB_TOKEN`    | No       | Fine-grained token with Contents read/write on `GITHUB_REPO`          |

## Using the app

Your data lives in browser local storage, encrypted with AES-GCM 256. Nothing is
sent to any server unless you explicitly query a price (and only the asset
symbol is sent).

### First run

1. Open `/` and click **Open the app**, or go to `/dashboard`.
2. Run the **onboarding tour** from the help icon (optional).
3. Set **language**, **theme**, and **base currency** in Settings.

### Cashflow (`/cashflow`)

Track income, expenses, transfers, and recurring entries. Filter by period,
export PDF, and explore the interactive Sankey diagram.

### Holdings (`/holdings`)

Add tickers (`AAPL`, `BTC`, `VWCE.DE`), buy/sell transactions, credit cards,
and installment plans.

### Performance (`/performance`)

Time-weighted return per asset with cached daily history (1M / 3M / 6M / 1Y / All).

### Planning (`/planning`)

Monthly budgets, savings goals with suggested contributions, 24-month liquidity
forecast, and loan amortization tables.

### AI Assistant (`/assistant`)

Log expenses in natural language (confirm before saving), ask spending questions,
use voice input/output. Web build uses built-in NLU; native builds can enable
local LLM and Sherpa-ONNX — see [Local AI models](#local-ai-models-native-builds).

### Dashboard (`/dashboard`)

Net worth, portfolio value, allocation pie, and quick stats.

### Settings → Data

- **Export** — JSON backup (schema-validated)
- **Import** — validated with Zod; replaces data after confirmation
- **Reset** — wipes all local data (irreversible)

## Import file format

The importer accepts the envelope produced by **Export**. Minimum viable file:

<details>
<summary>Example JSON (click to expand)</summary>

```json
{
  "version": 1,
  "exportedAt": "2026-06-30T12:00:00.000Z",
  "state": {
    "holdings": [
      {
        "id": "h_aapl",
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "type": "stock",
        "quantity": 10,
        "currentPrice": 195.5,
        "priceCurrency": "USD",
        "color": "#22c55e"
      }
    ],
    "cashflows": [
      {
        "id": "c_salary",
        "kind": "income",
        "source": "Acme Corp salary",
        "category": "salary",
        "amount": 3500,
        "currency": "EUR",
        "date": "2026-06-01",
        "recurrence": { "frequency": "monthly" }
      }
    ],
    "transactions": [],
    "categories": [
      { "id": "salary", "name": "Salary", "kind": "income", "group": "income", "color": "#22c55e" }
    ],
    "settings": {
      "useCorsProxy": true,
      "corsProxy": "https://corsproxy.io/?",
      "displayCurrency": "EUR",
      "privacyMode": false
    }
  },
  "userPreferences": { "language": "en" }
}
```

</details>

**Field notes:**

- `holdings.type`: `crypto` | `stock` | `etf` | `metal` | `other`
- `cashflows.kind`: `income` | `expense`; `date` is `YYYY-MM-DD`
- `cashflows.amountKind`: `fixed` (default) or `percent` with `percentOf` referencing another cashflow `id`
- `settings.corsProxy` must be an allow-listed value (`corsproxy.io` or `allorigins.win`)
- Legacy files containing only the `state` object are also accepted

## Finance providers & API keys

### Finnhub (optional, recommended for self-hosting)

For self-hosted deployments, set `FINNHUB_API_KEY` as a server env var. The
browser never sees it — requests go through `/api/finance-proxy`.

1. Sign up at https://finnhub.io (free tier available).
2. Set `FINNHUB_API_KEY` in your host's secret store or `.env`.
3. **Alternatively**, paste your key in **Settings → Finance providers** (stored
   encrypted locally; useful for native app or BYOK).

Without a Finnhub key, the app falls back to Yahoo Finance, Stooq, CoinGecko,
and Binance.

### CORS proxy

Some providers block direct browser requests. The fallback chain:

1. Direct request (when allowed)
2. Same-origin `/api/finance-proxy` (HTTPS allow-list, 2 MB cap) — best for self-hosting
3. Disclosed public proxies (`corsproxy.io`, `allorigins.win`) — opt-in via Settings

Native Tauri builds can reach providers directly and skip proxies.

### Provider priority

Finnhub → Yahoo Finance → Stooq → CoinGecko / Binance. Failed providers enter a
60-second cooldown.

## Local AI models (native builds)

The assistant works out of the box with built-in NLU. For stronger replies and
fully local voice on **Tauri builds**, enable optional Rust backends in
**Settings → AI Assistant**.

### Cargo features

| Feature       | Backend                                    | Powers                          |
| ------------- | ------------------------------------------ | ------------------------------- |
| `llm`         | [llama-cpp-2](https://docs.rs/llama-cpp-2) | Local LLM chat + tool calling   |
| `stt` / `tts` | [sherpa-onnx](https://docs.rs/sherpa-onnx) | Speech-to-text / text-to-speech |
| `local-ai`    | all of the above                           | Convenience alias               |

```bash
npm run setup:sherpa-onnx    # one-time: Sherpa-ONNX libs for voice

cd src-tauri
cargo tauri dev --features local-ai     # dev with all AI backends
cargo tauri build --features local-ai   # release build
```

**Build requirements** (only when enabling AI features): clang, C/C++ toolchain,
Sherpa-ONNX shared libs (`npm run setup:sherpa-onnx`), and enough RAM/disk for
model files.

### Download models

| Model                        | Source                                                                 | Size hint      |
| ---------------------------- | ---------------------------------------------------------------------- | -------------- |
| Qwen2.5-1.5B-Instruct GGUF   | [Hugging Face](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF) | ~1 GB (q4_k_m) |
| Sherpa-ONNX STT              | [Releases](https://github.com/k2-fsa/sherpa-onnx/releases)             | varies         |
| Sherpa-ONNX TTS (Piper/VITS) | [Releases](https://github.com/k2-fsa/sherpa-onnx/releases)             | varies         |

Configure paths in **Settings → AI Assistant**, or via env vars:

```bash
export AURELIA_LLM_MODEL=/path/to/model.gguf
export AURELIA_STT_MODEL=/path/to/sherpa-stt-folder
export AURELIA_TTS_MODEL=/path/to/sherpa-tts-folder
```

Settings paths take precedence. Chat history is encrypted locally; inference
runs on your device with local models enabled.

## Native builds & releases

```bash
cd src-tauri
cargo tauri dev               # desktop dev
cargo tauri build             # current OS installer
cargo tauri android build     # APK / AAB
cargo tauri ios build         # iOS (macOS host only)
```

From repo root: `npm run build:tauri` prepares the static bundle for Tauri.

GitHub Actions ([`.github/workflows/tauri-release.yml`](./.github/workflows/tauri-release.yml))
builds all platforms on tag push (`v*`). Download installers from
[GitHub Releases](https://github.com/Gabo-Tech/aurelia-asset/releases).

## Self-hosting

The web app targets **Cloudflare Workers** via TanStack Start + Nitro.

```bash
npm ci && npm run build
# Deploy .output to your Cloudflare Workers project
```

Set at minimum `FINNHUB_API_KEY` for reliable stock quotes. Optional: `SITE_URL`,
`ADMIN_PASSWORD`, and GitHub vars for the sponsors panel.

**Tech stack:** TanStack Start v1 (React 19) + Vite 8 + Tailwind v4 + shadcn-ui,
Tauri v2 wrapper. Vite config uses `@lovable.dev/vite-tanstack-config` (public
npm) as a convenience wrapper — standard `npm ci` / `npm run dev` works for all
contributors.

## License

Licensed under **GNU Affero General Public License v3.0 or later**
(AGPL-3.0-or-later). See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

- Personal, educational, and non-commercial use: free under AGPL-3.0.
- Commercial use that cannot meet AGPL obligations (including network-use
  source disclosure): contact [GABO](https://solutions.gabo.rocks) for a
  commercial license.

Attribution to GABO must be preserved in all distributions (see `NOTICE`).

## Security & contributing

- **Vulnerabilities:** report privately via [`SECURITY.md`](./SECURITY.md) — do
  not open public issues for security findings.
- **Contributions:** see [`CONTRIBUTING.md`](./CONTRIBUTING.md). By contributing
  you agree to license under AGPL-3.0-or-later.
- **Privacy:** see [`PRIVACY.md`](./PRIVACY.md) for data handling details.
- **Conduct:** [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
