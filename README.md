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

## Native builds

```bash
cd src-tauri
cargo tauri dev               # desktop dev
cargo tauri build             # current OS
cargo tauri android build     # APK / AAB
cargo tauri ios build         # iOS (macOS only)
```

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
