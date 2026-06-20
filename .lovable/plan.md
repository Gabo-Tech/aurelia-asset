## Elegant Portfolio Tracker — Build Plan

A client-side portfolio tracker with live price data, historical charts, cashflow Sankey, and full local persistence. No backend, no API keys required for core features.

### Stack adaptation
The project uses **TanStack Start + React 19 + Tailwind v4 + shadcn/ui** (not vanilla Vite + React 18). The app stays fully client-side — server functions are not used. All data lives in `localStorage`. This matches the spec's intent (static, no backend).

Libraries to add: `recharts`, `date-fns`, `sonner`, `@tanstack/react-query` (already present), shadcn components as needed (`table`, `dialog`, `tabs`, `select`, `input`, `button`, `card`, `dropdown-menu`, `sonner`, `tooltip`, `skeleton`, `badge`).

### Routes (TanStack file-based)
```
src/routes/
  __root.tsx            (existing — add Toaster, sidebar/nav shell, dark mode default)
  index.tsx             Dashboard
  holdings.tsx          Holdings table + add/edit/delete modals
  performance.tsx       Period selector + multi-line chart + returns table
  cashflow.tsx          Income/expense forms + Sankey
  settings.tsx          CORS proxy toggle, Finnhub key, export/import/reset
```
Each route gets distinct `head()` metadata.

### Design system (`src/styles.css`)
Dark mode by default (apply `.dark` to `<html>` in root shell). Refine `@theme` tokens:
- background: deep navy/charcoal (`oklch(0.16 0.02 250)`)
- card: slightly lifted surface
- primary: refined teal/blue
- success (positive): teal-green
- destructive (negative): soft red-orange
- Add `--shadow-elevated`, `--gradient-surface` tokens
- rounded-2xl cards, generous spacing, Inter font loaded via `<link>` in root head

### Data model (localStorage, single key `ept_state_v1`)
```ts
type AssetType = 'crypto' | 'stock' | 'etf' | 'metal' | 'other';
type Holding = {
  id: string; symbol: string; name: string; type: AssetType;
  quantity: number; manualPrice?: number; currentPrice: number;
  color: string; coinGeckoId?: string; lastPriceAt?: number;
};
type CashflowEntry = {
  id: string; kind: 'income' | 'expense';
  source: string; category: string; amount: number; date: string;
};
type Settings = { useCorsProxy: boolean; finnhubKey?: string };
type AppState = { holdings: Holding[]; cashflows: CashflowEntry[]; settings: Settings };
```
Zustand-style hook or plain Context + reducer with `useSyncExternalStore` over localStorage. Auto-save on every change.

### API layer (`src/lib/finance/`)
- `client.ts` — fetch wrapper, optional CORS proxy prefix, retry with exponential backoff, JSON parse.
- `coingecko.ts` — `searchCrypto`, `getCryptoPrice`, `getCryptoHistory(coinId, days)`.
- `yahoo.ts` — `searchYahoo`, `getYahooQuotes(symbols[])`, `getYahooHistory(symbol, range)`.
- `finnhub.ts` — optional fallback when key provided.
- `index.ts` — unified `searchAssets`, `fetchCurrentPrice`, `fetchHistoricalPrices` dispatching by asset type, with Yahoo→Finnhub fallback.
- `cache.ts` — in-memory + localStorage cache with TTL (prices 5 min, history keyed by symbol+range, 1 h).

All wrapped in **React Query** hooks: `useAssetSearch`, `useLivePrices(holdings)`, `usePortfolioHistory(holdings, range)`. Parallel `Promise.all` for multi-asset history with per-asset caching.

### Historical portfolio calc
Given holdings + range:
1. Fetch each asset's daily series in parallel.
2. Build a union of all dates, forward-fill missing prices per asset.
3. Compute `value[t] = Σ qty_i * price_i[t]`.
4. Return `{ date, total, perAsset: Record<id, value> }[]` for the chart.

### Sections

**Dashboard (`/`)**
- Hero card: total value, 24h change %, period change.
- Quick stats row: # holdings, top performer, worst performer, cash net flow (30d).
- Allocation `PieChart` using each holding's color, donut style, hover tooltip with %.
- Recent activity (latest cashflow entries).

**Holdings (`/holdings`)**
- shadcn `Table` with sort (click headers), filter (search + type filter), pagination.
- Columns: color dot, Symbol, Name, Type, Quantity, Current Price, Market Value, % Portfolio, actions.
- "Add holding" modal: asset search (debounced, hits crypto + stock APIs by tab), quantity, color picker (preset palette + custom hex), optional manual price override.
- Edit/Delete via row dropdown. Refresh-prices button (toast feedback).

**Performance (`/performance`)**
- Segmented control: 1D / 7D / 1M / 3M / 6M / YTD / 1Y / 5Y / 10Y / Max.
- `LineChart` — bold total line + faint toggleable per-asset lines (legend toggles visibility).
- Metrics table below: start value, end value, abs change, % return per asset and total.
- Loading skeletons; empty state when no holdings.

**Cashflow (`/cashflow`)**
- Two-column add forms (Income / Expense) with category, source, amount, date.
- Recent entries tables (sortable, delete).
- Recharts `Sankey`: nodes = sources → categories → "Spent"/"Saved". Tasteful palette tied to design tokens.
- Summary cards: total in, total out, net.

**Settings (`/settings`)**
- Toggle "Use CORS proxy" (with proxy URL select: corsproxy.io / allorigins).
- Finnhub key input (password type, stored in localStorage).
- Export JSON, Import JSON (file picker, schema-validated), Export Holdings CSV, Reset (confirm dialog).

### Polish
- Sonner toasts for save/import/price-refresh/errors.
- Skeleton loaders on every async card.
- Empty states with CTA buttons.
- Mobile: collapsible sidebar → bottom tab bar under `sm`.
- Micro-animations via `tw-animate-css` (already installed).

### README addition
Short section in `src/routes/README.md` (or new `README.md`) covering: API sources, why CORS proxy may be needed, how to get a free Finnhub key, data persistence model.

### Out of scope (explicit)
- No auth, no server functions, no Lovable Cloud.
- No multi-currency (USD only, matching spec).
- No tax-lot accounting (single avg position per holding).

### Build order
1. Install deps, set up design tokens + dark default + root shell with sidebar/nav + Toaster.
2. State store + localStorage persistence.
3. Finance API layer + React Query hooks + caching.
4. Holdings route (foundation for everything else).
5. Dashboard.
6. Performance.
7. Cashflow + Sankey.
8. Settings + import/export.
9. Polish pass: skeletons, empty states, mobile, animations.
