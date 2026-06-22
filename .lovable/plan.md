## Problem

The Entries table is now correct (e.g. `€1,600.00 ≈ CHF 1,480.35`), but the **Income/Expenses/Net stat cards** and the **Sankey chart labels** show smaller numbers (e.g. Rent `CHF 1,194.30` instead of `CHF 1,480.35`).

## Root cause

In `src/routes/cashflow.tsx`:

- `totals.income`, `totals.expense`, and the Sankey `links[].value` are already produced by `toDisplay(amount, currency)` — i.e. they are already in the display currency (CHF).
- Those values are then formatted with `mask(v)` (one argument). `mask` is defined in `useMoney()` as `maskMoney(toDisplay(amount, from || "USD"), displayCurrency, …)`. With no `from`, it treats the already‑converted CHF number as USD and converts it to CHF a **second time**, multiplying by ~0.80.

That's why every Sankey/stat number is ~0.80× the correct value, while the table (which formats `c.amount` in its native currency and computes the badge from `c.amount + c.currency`) is right.

## Fix

In `src/routes/cashflow.tsx`, format already‑converted values directly with `formatMoney` (and honor privacy via `MASK`), instead of running them back through `mask`.

1. Stat cards (Income, Expenses, Net):
   - Replace `mask(totals.income)` → `privacy ? MASK : formatMoney(totals.income, currency)`
   - Same for `totals.expense` and `Math.abs(totals.net)`.

2. Sankey label/tooltip formatter:
   - Replace `format={(v) => mask(v)}` with `format={(v) => privacy ? MASK : formatMoney(v, currency)}`.

No changes to the Entries table (already correct), to `useMoney`, or to the Sankey component itself. No data/business‑logic changes.

## Verification

After the change, with `€1,600` Rent and display currency CHF:
- Entries row: `€1,600.00  ≈ CHF 1,480.35` (unchanged).
- Sankey "Rent" label: `CHF 1,480.35` (matches the badge).
- Income/Expenses/Net cards reflect the same converted totals as the chart.
