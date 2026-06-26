# Add Net Worth stat to Dashboard

## Goal
Keep **Total portfolio value** as holdings-only, and add a new **Net worth** stat that = portfolio value + cumulative cashflow balance (all income − all expenses, including recurrences, in the display currency).

## Changes

### `src/routes/dashboard.tsx`
1. Import `expandCashflows` from `src/routes/cashflow.tsx` (or extract to `src/lib/cashflow.ts` if not already exported — quick check; if extraction is needed, move the helper to a shared lib file and re-import in both places).
2. Compute `cashflowBalance`:
   - Expand recurring entries up to today.
   - Sum `+income / −expense` converted via `toDisplay(amount, currency)`.
   - Respect `amountKind: "percent"` using the same resolution logic already used in cashflow (reuse helper if exported; otherwise compute fixed-only balance and note percent entries are excluded — confirm with user if needed).
3. Compute `netWorth = portfolioTotal + cashflowBalance`.
4. Update the stats grid: add a new card **"Net worth"** next to **"Total portfolio value"**, using `mask(netWorth)`. Subtitle shows the cashflow delta (e.g. `+€1,240 from cashflow` in success/destructive color).
5. Leave existing **Net (30d)** card as-is.

## Notes
- Sign convention: expenses reduce net worth.
- Privacy mode already handled via `mask()`.
- No changes to data model or storage.
