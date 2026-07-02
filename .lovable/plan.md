## Goal

Fetch each holding's full ("Max") price history a single time per session, cache it, and derive every chart/period locally — no refetch when switching periods or navigating between Dashboard / Holdings / Performance.

## Current state

`src/lib/finance/index.ts` already implements `fetchMaxHistory` (24 h localStorage cache, stale fallback, in-flight dedupe) and `fetchHistorical` slices from that full series. So the data layer is fine.

The waste is at the React layer: `performance.tsx` and `holdings-charts.tsx` each own a separate `useQuery` keyed by `["portfolioHistory", period]`. Switching period or route re-runs `fetchPortfolioHistory`, which re-walks every holding (cache hits, but still async work + re-render churn), and `fetchCurrentQuote` fires again per mount.

## Plan

1. **New shared hook `src/hooks/use-price-history.ts`**
   - `usePortfolioMaxHistory(holdings)` — one `useQuery` keyed by a stable hash of `holdings.map(h => h.id + qty + symbol + customHistory-length)`, `staleTime: 24h`, `gcTime: 24h`, returns `PortfolioHistoryPoint[]` at **Max** granularity.
   - `usePortfolioHistory(holdings, period)` — wraps the above and returns `useMemo`-sliced points for the requested `PeriodId` (reusing `sliceByDays` / `sliceYtd` logic exported from `finance/index.ts`).
   - `useCurrentQuotes(holdings)` — one `useQuery` batching `fetchCurrentQuote` per holding, `staleTime: 5 min`.

2. **Export slicing helpers** from `src/lib/finance/index.ts` (`sliceByDays`, `sliceYtd`) so the hook can filter locally without another async call.

3. **Prefetch on app boot** in `src/components/app-shell.tsx` (runs on every authenticated page): call `queryClient.prefetchQuery` for `usePortfolioMaxHistory` and `useCurrentQuotes` once holdings are hydrated. This warms the cache before the user opens Performance/Holdings.

4. **Refactor call sites** to consume the shared hook:
   - `src/routes/performance.tsx` → replace its `useQuery` with `usePortfolioHistory(holdings, period)`. Period switches become pure `useMemo`, no network.
   - `src/components/holdings-charts.tsx` → same swap.
   - `src/components/holding-dialog.tsx` and `src/routes/holdings.tsx` → use `useCurrentQuotes` instead of ad-hoc `fetchCurrentQuote` on mount (keep the manual "refresh" button that force-invalidates).

5. **Cache invalidation**
   - Expose `invalidatePriceHistory()` that calls `clearPriceHistoryCache()` + `queryClient.invalidateQueries({ queryKey: ["price-history"] })`. Wire it to the existing manual refresh buttons and to `addHoldingTransaction` so a new holding triggers one fetch.

## Result

- First page after login: one background fetch per holding (Max series) + one quote batch.
- Every subsequent chart / period toggle / route change: zero network, instant render from React Query cache + local slice.
- Existing 24 h localStorage cache still survives full reloads.
