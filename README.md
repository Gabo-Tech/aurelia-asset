# Aurelia Asset

A privacy-first personal finance and portfolio tracker. Cashflow, holdings,
performance, budgets, savings goals, loans and forecasts - all stored locally
in your browser (AES-GCM encrypted) and shippable as a web app or a native
desktop/mobile app via Tauri.

Made by [GABO](https://solutions.gabo.rocks).

## Features

- Cashflow with recurring income/expenses, categories, transfers, credit
  cards, installments and Sankey visualisation
- Holdings with buy/sell transactions, horizons (short/long term) and
  multi-currency support
- Performance tracking via Finnhub, Yahoo Finance, Stooq, CoinGecko and
  Binance (with same-origin proxy fallback)
- Planning: budgets, savings goals, loan amortization, 24-month forecast
- **AI Assistant** (`/assistant`): fully offline chat about your finances,
  voice input/output, natural-language expense logging with confirm-first
  flow, spending summaries and saving tips (built-in engine on web; optional
  local LLM + Sherpa-ONNX speech on native builds)
- Multilingual: English, Spanish, Portuguese, Dutch, German, Valencian
- Light/dark theme, mobile-first responsive UI, onboarding tour
- Local-only data, encrypted at rest, exportable as JSON or PDF
- Optional native builds for Windows, macOS, Linux, Android and iOS

## Tech stack

TanStack Start v1 (React 19) + Vite 7 + Tailwind v4 + shadcn-ui, Tauri v2
wrapper, deployed to Cloudflare Workers.

## Getting started

```bash
bun install
cp .env.example .env   # fill in what you need (all optional for local dev)
bun run dev
```

Open http://localhost:8080. Without env vars the app still runs - finance
data falls back to public providers and the admin panel is disabled.

## Environment variables

See [`.env.example`](./.env.example). All are read server-side only.

## Using the app

The app is fully client-side: your data lives in your browser's local
storage, encrypted with an AES-GCM 256 key that never leaves your
device. Nothing is sent to any server unless you explicitly query a
price (and even then, only the asset symbol is sent).

### First run

1. Open `/` (landing page) and click **Open the app**, or go straight
   to `/dashboard`.
2. Optionally run the **onboarding tour** from the help icon in the
   header - it walks you through every screen.
3. Pick your **language**, **theme** (light/dark) and **base currency**
   in **Settings**.

### Cashflow (`/cashflow`)

Track everything that moves money in or out.

- **Add entry**: pick *Income* or *Expense*, amount, currency, date,
  category, and an optional short description. Toggle **Recurring** to
  set a frequency (weekly, monthly, yearly, custom) and an end date.
- **Percent amounts**: switch the amount kind to **%** to compute a
  value relative to another entry (useful for taxes, tithes, fees).
- **Transfers**: move money between accounts (cash, holdings, credit
  card). Transfers appear in the Sankey diagram and never count as
  income or expense.
- **Categories**: create your own under **Manage categories**. Defaults
  use green for income, red for expenses, blue for savings, green for
  investments.
- **Filters**: filter the entries table by type, category, week,
  month, year or custom date range.
- **Edit / delete**: click any row to edit; recurring entries can be
  edited as a single occurrence or for the whole series.
- **Export PDF**: the *Export* button generates a styled PDF of the
  filtered period including a colour-coded cumulative balance chart.
- **Sankey diagram**: drag and drop nodes to reorder; the order is
  remembered. Use the toolbar to toggle labels and customise colours.
  Open fullscreen to resize and export as PNG.

### Holdings (`/holdings`)

- **Add holding**: ticker (e.g. `AAPL`, `BTC`, `VWCE.DE`), quantity,
  currency, account, and **horizon** (short / long term).
- **Buy / sell transactions**: add as many as you want; the current
  quantity is computed from the transaction history.
- **Credit cards**: track limit, balance and statement payments; use
  the **Pay** shortcut to log a repayment as a cashflow transfer.
- **Installments**: split a purchase into N scheduled payments.

### Performance (`/performance`)

Shows time-weighted return per asset and overall, using cached
daily-history data. Switch period (1M / 3M / 6M / 1Y / All). The data
is fetched once per day per asset and sliced locally to avoid
rate-limits.

### Planning (`/planning`)

- **Budgets**: monthly spending limits per category, with progress
  bars based on the current month's cashflow.
- **Savings goals**: target amount and date; the app suggests a
  monthly contribution.
- **Forecast**: 24-month liquidity projection from your recurring
  entries, with runway calculation.
- **Loans**: enter principal, rate, term and optional extra payment;
  see the full amortization table and payoff date.

### AI Assistant (`/assistant`)

Talk to an on-device finance assistant by text or voice.

- **Log expenses naturally** — e.g. *"I spent 45 dollars on groceries at
  Walmart yesterday"* — and confirm before anything is saved.
- **Ask questions** — spending this month, recent transactions, budget
  status, saving tips — answers use your real local data.
- **Voice** — tap the mic to speak; replies can be read aloud (toggle in
  the header or in Settings).
- **Quick chips** — shortcuts like "Add expense" or "How much on food
  this month?".

On the **web build**, the assistant uses a built-in local NLU engine and
your browser's speech APIs. No model download required.

On **native Tauri builds**, you can optionally enable a local LLM
(Qwen-2.5 GGUF via llama.cpp) and Sherpa-ONNX speech models — see
[Local AI models](#local-ai-models-native-builds) below.

### Dashboard (`/dashboard`)

Net worth (cashflow balance + holdings), portfolio value (holdings
only), allocation pie, and quick stats.

## Settings: data, proxy and API keys

### Import / export

In **Settings -> Data**:

- **Export**: download a JSON file containing all entries, holdings,
  transactions, categories, budgets, goals, loans and preferences.
  Schema-validated; safe to keep as a backup.
- **Import**: load a previously exported JSON file. Imports are
  validated with Zod and replace your current data after confirmation.
- **Reset**: wipes all local data (irreversible).

#### Import file format

The importer accepts the envelope produced by **Export**. Minimum
viable file:

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
      },
      {
        "id": "h_btc",
        "symbol": "BTC",
        "name": "Bitcoin",
        "type": "crypto",
        "quantity": 0.25,
        "currentPrice": 65000,
        "priceCurrency": "USD",
        "color": "#f59e0b",
        "coinGeckoId": "bitcoin"
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
        "recurrence": { "frequency": "monthly" },
        "description": "Net monthly salary"
      },
      {
        "id": "c_rent",
        "kind": "expense",
        "source": "Apartment rent",
        "category": "housing",
        "amount": 1100,
        "currency": "EUR",
        "date": "2026-06-03",
        "recurrence": { "frequency": "monthly", "until": "2027-06-01" }
      },
      {
        "id": "c_tax",
        "kind": "expense",
        "source": "Income tax",
        "category": "taxes",
        "amount": 20,
        "currency": "EUR",
        "date": "2026-06-01",
        "amountKind": "percent",
        "percentOf": "c_salary"
      }
    ],
    "transactions": [
      {
        "id": "t_aapl_buy",
        "holdingId": "h_aapl",
        "kind": "buy",
        "date": "2025-01-15",
        "quantity": 10,
        "pricePerUnit": 180.2,
        "currency": "USD",
        "fees": 1.5
      }
    ],
    "categories": [
      { "id": "salary",  "name": "Salary",  "kind": "income",  "group": "income",     "color": "#22c55e" },
      { "id": "housing", "name": "Housing", "kind": "expense", "group": "expense",    "color": "#ef4444" },
      { "id": "taxes",   "name": "Taxes",   "kind": "expense", "group": "expense",    "color": "#f97316" },
      { "id": "savings", "name": "Savings", "kind": "expense", "group": "savings",    "color": "#3b82f6" },
      { "id": "invest",  "name": "Invest",  "kind": "expense", "group": "investment", "color": "#10b981" }
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

Field notes:

- `id` is any unique string you choose; reuse it to update an item
  on re-import.
- `holdings.type`: `crypto` | `stock` | `etf` | `metal` | `other`.
- `holdings.color` / `categories.color`: 3- or 6-digit hex.
- `holdings.coinGeckoId` is required for live crypto pricing
  (e.g. `bitcoin`, `ethereum`, `solana`).
- `cashflows.kind`: `income` | `expense`. Use a **transfer category**
  to model account-to-account moves (configure in the UI).
- `cashflows.date` is `YYYY-MM-DD`.
- `cashflows.recurrence.frequency`: `weekly` | `monthly` | `yearly`;
  omit `recurrence` for one-off entries.
- `cashflows.amountKind`: `fixed` (default) or `percent`; when
  `percent`, set `percentOf` to another cashflow `id`.
- `categories.group`: `income` | `expense` | `savings` | `investment`
  (drives default colour grouping).
- `settings.corsProxy` must be one of the two allow-listed values
  shown above.
- `version` and `exportedAt` are optional but recommended; a legacy
  file containing only the `state` object is also accepted.


### Finnhub API key (optional, recommended)

The app ships with a server-side Finnhub key behind
`/api/finance-proxy` so prices work out of the box. If you self-host
or run the native app, add your own key for higher rate limits:

1. Sign up for a free key at https://finnhub.io.
2. **Self-hosted web**: set `FINNHUB_API_KEY` as a server env var (see
   [`.env.example`](./.env.example)). The browser never sees it.
3. **Native app or "bring your own key"**: paste it in
   **Settings -> Finance providers -> Finnhub API key**. Stored
   encrypted in local storage.

### CORS proxy

Some providers (Yahoo, Stooq) don't allow direct browser requests. The
chain is:

1. Direct request (when the endpoint allows it).
2. Same-origin `/api/finance-proxy` (Cloudflare Workers route, allow-
   listed hosts, HTTPS only, 2 MB cap). Best option, no third party.
3. Disclosed public proxies (`corsproxy.io`, `allorigins.win`) - only
   if you enable them in **Settings -> Finance providers**.

To change the proxy or disable public proxies entirely, edit those
fields in Settings. Native Tauri builds can talk to providers
directly and skip proxies altogether.

### Provider priority

Finnhub -> Yahoo Finance -> Stooq -> CoinGecko / Binance (for crypto).
The first provider that returns valid data wins; failed providers go
into a 60-second cooldown to keep refreshes fast.

## Local AI models (native builds)

The AI Assistant works out of the box with a built-in on-device NLU
engine. For stronger replies and fully local voice on **desktop/mobile
Tauri builds**, compile the optional Rust backends and point the app at
downloaded model files in **Settings → AI Assistant**.

### Cargo features

AI backends are **off by default** so normal builds stay fast and do not
require clang or ONNX tooling. Enable them when building the native app:

| Feature | Backend | What it powers |
|---------|---------|----------------|
| `llm` | [llama-cpp-2](https://docs.rs/llama-cpp-2) | Local LLM chat + tool calling |
| `stt` | [sherpa-onnx](https://docs.rs/sherpa-onnx) | Speech-to-text |
| `tts` | [sherpa-onnx](https://docs.rs/sherpa-onnx) | Text-to-speech |
| `local-ai` | all of the above | Convenience alias |

```bash
# One-time: Sherpa-ONNX shared libs for voice (STT/TTS)
npm run setup:sherpa-onnx

cd src-tauri

# Dev with all local AI backends
cargo tauri dev --features local-ai

# Or from repo root (also handles bindgen paths when needed):
npm run tauri:dev:local-ai

# Release build (current OS)
cargo tauri build --features local-ai

# Or enable individually
cargo tauri build --features llm
cargo tauri build --features "llm,stt,tts"
```

**Build requirements** (only when enabling these features):

- **clang** — llama.cpp uses bindgen (same as upstream llama-cpp-rs).
- **Sherpa-ONNX shared libraries** — required for `stt` / `tts` / `local-ai` on Linux.
  From the repo root:

  ```bash
  npm run setup:sherpa-onnx
  ```

  This downloads prebuilt `libsherpa-onnx-c-api.so` and `libonnxruntime.so` into
  `native/sherpa-onnx/lib/` and writes `src-tauri/.cargo/config.toml` with
  `SHERPA_ONNX_LIB_DIR` (absolute path; needed when the project path contains spaces).
- **C/C++ toolchain** — for sherpa-onnx native libraries.
- Enough RAM/disk for model files (see below).

With features disabled, the app still compiles and the assistant falls
back to the built-in NLU engine and browser speech APIs.

### Download models

All models stay on your device. Nothing is uploaded to a cloud API.

#### Language model (GGUF)

Recommended starting point: **Qwen2.5-1.5B-Instruct** in GGUF format
(small, fast, good at tool-style replies).

1. Browse [Qwen2.5-1.5B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF)
   on Hugging Face.
2. Download a quantized file, e.g. `qwen2.5-1.5b-instruct-q4_k_m.gguf`
   (~1 GB — good balance of speed and quality).
3. In the app: **Settings → AI Assistant → Language model (GGUF) → Browse**
   and select the `.gguf` file.

Other GGUF chat models may work; Qwen2.5-Instruct is what the prompt
format targets.

#### Speech-to-text (Sherpa-ONNX folder)

Download a **pre-built Sherpa-ONNX offline recognizer** and unzip it.
The folder should contain model files the app can auto-detect:

- **Transducer** — `encoder*.onnx`, `decoder*.onnx`, `joiner*.onnx`, `tokens.txt`
- **Whisper** — `encoder*.onnx`, `decoder*.onnx`, `tokens.txt`
- **SenseVoice** — `model*.onnx`, `tokens.txt`

Sources:

- [Sherpa-ONNX releases](https://github.com/k2-fsa/sherpa-onnx/releases)
  (pre-built ONNX models)
- [csukuangfj on Hugging Face](https://huggingface.co/csukuangfj) —
  many `sherpa-onnx-*` STT packages

Example search terms: `sherpa-onnx whisper tiny en`, `sherpa-onnx zipformer`,
`sherpa-onnx sensevoice`.

In the app: **Settings → AI Assistant → Speech-to-text model folder → Browse**
and pick the **folder** (not a single file).

If no STT model is configured, native builds fall back to the browser
speech recognizer when available.

#### Text-to-speech (Sherpa-ONNX folder)

Download a **VITS / Piper-style** Sherpa-ONNX TTS package. The folder
should include at least:

- `model.onnx` (or similar)
- `tokens.txt`
- optional: `lexicon.txt`, `espeak-ng-data/`, `dict/`

Sources: same [Sherpa-ONNX releases](https://github.com/k2-fsa/sherpa-onnx/releases)
and [csukuangfj Hugging Face](https://huggingface.co/csukuangfj) —
look for `sherpa-onnx-vits-*` or `sherpa-onnx-piper-*` (match language
to your locale, e.g. `en_US`).

In the app: **Settings → AI Assistant → Text-to-speech model folder → Browse**.

If no TTS model is configured, replies use the browser's speech synthesis.

### Configure in Settings

Open **Settings → AI Assistant**:

| Control | Purpose |
|---------|---------|
| **Speak replies aloud** | Toggle TTS for assistant answers |
| **Language model (GGUF)** | Path to your `.gguf` file |
| **Speech-to-text model folder** | Folder with Sherpa STT ONNX files |
| **Text-to-speech model folder** | Folder with Sherpa TTS ONNX files |
| **Clear chat history** | Remove encrypted local conversation |

Green checkmarks appear when a backend is **compiled in** and the path
points at valid model files. Paths are stored in your encrypted local
settings and passed to the Rust backend on each request (models are
cached in memory after first load).

### Environment variable fallback (optional)

Instead of using the Settings UI, you can point the native backend at
models via env vars (useful for dev or CI):

```bash
export AURELIA_LLM_MODEL=/path/to/qwen2.5-1.5b-instruct-q4_k_m.gguf
export AURELIA_STT_MODEL=/path/to/sherpa-onnx-whisper-tiny.en
export AURELIA_TTS_MODEL=/path/to/sherpa-onnx-vits-piper-en_US
```

Settings paths take precedence when set.

### Privacy

- Chat history is stored **encrypted** in local storage (same AES-GCM
  scheme as the rest of the app).
- With local models enabled, **inference runs entirely on your device**.
- The built-in NLU engine never sends data to a server.
- Expense writes always require your **confirmation** before saving.

## Native builds

```bash
cd src-tauri
cargo tauri dev               # desktop dev
cargo tauri build             # current OS
cargo tauri dev --features local-ai   # desktop dev + on-device LLM/STT/TTS
cargo tauri build --features local-ai # release with local AI backends
cargo tauri android build     # APK / AAB
cargo tauri ios build         # iOS (macOS only)
```

For model downloads, Settings paths and build requirements for the AI
Assistant, see [Local AI models](#local-ai-models-native-builds).

GitHub Actions workflow at `.github/workflows/tauri-release.yml` builds
all platforms on tag push.

## License

This project is licensed under the **GNU Affero General Public License
v3.0 or later** (AGPL-3.0-or-later). See [`LICENSE`](./LICENSE) and
[`NOTICE`](./NOTICE).

- Personal, educational and non-commercial use: free under AGPL-3.0.
- Commercial use that cannot meet AGPL-3.0 obligations (including the
  network-use source-disclosure requirement): a separate commercial
  license is available - contact [GABO](https://solutions.gabo.rocks).

Attribution to GABO must be preserved in all distributions and
deployments (see [`NOTICE`](./NOTICE)).

## Security

To report a vulnerability, see [`SECURITY.md`](./SECURITY.md). Please do
not open a public issue for security reports.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). By contributing you agree to
license your contribution under AGPL-3.0-or-later and grant GABO the
right to also offer it under a commercial license.
