## Why Performance and Holdings disagree

- Holdings header uses the store's `toDisplay(..., h.priceCurrency)`, which (after the earlier consistency fix) treats a missing `priceCurrency` as the display currency and applies no FX.
- Performance (`src/routes/performance.tsx`) builds its own FX map with `h.priceCurrency || "USD"`, so any holding without a stored currency gets an unwanted USD→CHF conversion (~×0.81). That accounts for the 3,795 vs 4,939 gap (ratio ≈ 0.77 ≈ USD→CHF).
- Secondary effect: the header number equals the last historical price point, not the live `currentPrice`, so even after the FX fix it can be a bit behind on volatile days.

## Fix

1. `src/routes/performance.tsx` — align currency fallback with the store:
   - Replace `h.priceCurrency || "USD"` in `fxByHolding` with a fallback to the user's display `currency` (same rule as `toDisplay`). Holdings with no stored currency are treated as already in display currency (no conversion), matching the Holdings page.

2. `src/lib/finance/index.ts` — make the last historical point reflect live prices:
   - In `fetchPortfolioHistory`, after building the day series, ensure the final point uses each holding's current live price (`h.currentPrice`) when it's newer than the last historical sample. Concretely: if `today` isn't already in `days`, append a `today` point priced with `h.currentPrice`; if the last day is today, overwrite each `perAssetPrice[h.id]` / `perAsset[h.id]` with `h.currentPrice` when available. This keeps the "last" value equal to `quantity * currentPrice`, which is exactly what Holdings shows.
   - Keep `perAssetPrice` populated so tooltips and the indexed/% mode continue to work.

3. Sanity check the header:
   - After the two fixes, `metrics.last.total` in `performance.tsx` should equal `Σ toDisplay(h.quantity * h.currentPrice, h.priceCurrency)` — same as the Holdings header. No changes needed to the Holdings page.

## Non-goals

- No change to how history is fetched, cached, or merged.
- No change to the chart's period selector, indexed/% mode, or PDF export.
- No change to the Holdings page total or to `toDisplay`.

## Verification

- Reload the app on `/performance` and `/holdings` with the same display currency; the two "Portfolio value" numbers must match to the cent.
- Toggle period (1D → Max): the header stays equal to the live Holdings total; historical points before today are unchanged.
- Switch display currency (CHF ↔ EUR ↔ USD): both pages update in lockstep.
- Add a new holding with no explicit currency: it contributes 1:1 to both totals (no phantom USD→display conversion).
