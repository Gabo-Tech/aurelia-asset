# Privacy Policy

Aurelia Asset is designed so your financial data stays on your device. This
document explains what data is stored locally, what may leave your device, and
how third-party services are used.

## Summary

| Data | Where it lives | Leaves your device? |
|------|----------------|---------------------|
| Cashflow, holdings, budgets, goals, loans | Browser local storage (AES-GCM encrypted) | No |
| Finnhub API key (optional, user-provided) | Encrypted local storage | Only when you query prices (symbol sent to provider) |
| Chat history (AI assistant) | Encrypted local storage | No (with local models); built-in NLU never calls a server |
| Theme, language, preferences | Local storage | No |
| Export / backup JSON | User-initiated download | Only if you choose to save or share the file |

**We do not operate analytics, advertising, or user accounts.** There is no
telemetry in this application.

## Local storage and encryption

Sensitive values in `localStorage` are encrypted with AES-GCM 256-bit using a key
stored in IndexedDB. The encryption key is bound to your browser origin and is
not transmitted to any server.

**Important limitation:** Because encryption and decryption happen in the same
browser context as the app, anyone with access to your unlocked device and
browser profile can read your data. This protects against casual inspection of
storage, not against malware or physical access to an unlocked session.

## Third-party finance APIs

When you refresh prices or exchange rates, the app may contact:

- Finnhub (stocks/ETFs) — via same-origin `/api/finance-proxy` when self-hosted,
  or direct when using a user-provided key
- Yahoo Finance, Stooq, CoinGecko, Binance — for quotes and history
- Open ER API, ExchangeRate API, Frankfurter — for FX rates

Only the **asset symbol or rate endpoint** is sent — not your portfolio
balances, cashflow entries, or personal notes.

If you enable **CORS proxies** in Settings (`corsproxy.io` or `allorigins.win`),
those third parties may see the proxied request URL. This is disclosed in the
app and disabled by default on native Tauri builds.

## Google Fonts

The web app loads **Playfair Display** and **Plus Jakarta Sans** from
`fonts.googleapis.com` and `fonts.gstatic.com`. This sends your IP address and
referrer to Google. Native Tauri builds use the same webview and may load fonts
the same way unless you self-host fonts.

## Self-hosted server features

If you deploy the server routes (e.g. on Cloudflare Workers), these optional
env vars enable server-side features:

| Variable | Purpose |
|----------|---------|
| `FINNHUB_API_KEY` | Injects Finnhub token in `/api/finance-proxy` (never sent to browser) |
| `ADMIN_PASSWORD` | Protects `/admin` sponsors panel |
| `GITHUB_TOKEN` / `GITHUB_REPO` | Persists sponsor data to a GitHub repo |

None of your personal finance data is sent to these server features.

## AI assistant

- **Web build:** Built-in NLU runs entirely in the browser. Optional browser
  speech APIs may send audio to your OS/vendor (e.g. Google on Chrome) if you
  use voice input without a local STT model.
- **Native build (optional):** Local LLM (llama.cpp) and Sherpa-ONNX speech
  models run on your device when enabled. Model files are user-downloaded and
  never uploaded.

Expense writes from the assistant always require your confirmation before saving.

## Backups and exports

JSON and PDF exports contain your full local dataset (except redacted API keys).
You control where those files are stored.

## Children's privacy

This app is not directed at children under 13 and does not knowingly collect
personal information.

## Changes

This policy may be updated as the project evolves. Material changes will be
reflected in this file and the project changelog.

## Contact

Questions about privacy: https://solutions.gabo.rocks
