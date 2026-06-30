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
