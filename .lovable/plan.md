## Root cause

The Salary entry in your screenshot shows "CHF 3,000" in the Cashflow list but "CHF 2,428.67" in Planning → Forecast (Monthly income recurring). Same happens with expenses.

3,000 × 0.8095 ≈ 2,428.67 — that's the USD→CHF conversion. So the app is converting a value that should not be converted.

Why: some cashflow entries have no `currency` field stored (older entries, or entries added before the currency picker was wired). The two places disagree on what "no currency" means:

- `src/routes/cashflow.tsx` entry list (line 1282) renders `formatMoney(c.amount, (c.currency || currency))` — falls back to the user's display currency, so it shows the raw number labelled "CHF".
- `src/lib/store.tsx` `toDisplay` (line 416) does `convert(amount, from || "USD", displayCurrency, rates)` — falls back to **USD** and converts to CHF, shrinking 3,000 to 2,428.67.

Planning (recurring totals, forecast chart, savings rate, runway), Budgets ("spent"), Holdings/Transactions, and the credit-cards manager all go through `toDisplay`, so any entry missing `currency` is silently mis-converted everywhere those totals appear.

## Fix

1. **Change the fallback in `useMoney().toDisplay`** (`src/lib/store.tsx`) from `from || "USD"` to `from || displayCurrency`. Same change for `fmt` / `mask` derivations (they already flow through `toDisplay`, so a single edit fixes all callers). This makes "unspecified currency" mean "already in the user's currency" — matching what the Cashflow entry row shows.

2. **Backfill on read** in the store hydration: when loading persisted state, for any `cashflow`, `budget`, `holding`, `transaction`, or `transfer` whose `currency` is missing/empty, set it to `state.settings.displayCurrency`. This keeps future edits/exports explicit and prevents the ambiguity from resurfacing if the user later changes display currency.

3. **Guarantee `currency` on create** in the add/edit forms (`src/routes/cashflow.tsx` add + `EditEntryDialog`, plus the equivalent forms in Planning/Budgets and Holdings) by defaulting the state to `displayCurrency` when the user doesn't pick one. Most already do; verify and patch any that don't.

No visual/UX changes — only the numbers reconcile. After the fix, the Salary entry will read CHF 3,000 in both Cashflow and Planning, and the same reconciliation applies to expenses and any other affected totals (budgets spent, savings rate, forecast balances, holdings valuations).

## Verification

- Reload → the "Monthly income (recurring)" card should read CHF 3,000.00.
- The Forecast liquidity chart, savings-rate, runway, and Budgets "spent" values should shift accordingly.
- Export → re-import JSON round-trips with explicit `currency` on every record.
