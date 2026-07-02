## Why the projected balance slopes down despite a "+CHF 39/mo" snapshot

The two views compute recurring flows differently and disagree:

- **Snapshot cards** (`recurring` memo, `src/routes/planning.tsx` ~L409): each recurring entry is summed as `toDisplay(c.amount, c.currency)`. A percent entry like a 25% tax (stored as `amount: 25, amountKind: "percent"`) is counted as CHF 25/mo instead of 25% × income (CHF 750/mo). Weekly entries use a `×4.345` approximation.
- **Forecast chart** uses `expandCashflows` + `valuesByEntry`, which correctly resolves percent entries against `all-income` / `all-expense` / the target entry and expands weeklies to their actual per-month occurrences. This is the accurate number.

Net effect for the user: expenses look like CHF 2,961 in the cards but are really ~CHF 3,700/mo once taxes/percent items are evaluated, so the line slopes down ~CHF 700/mo — consistent with the chart.

A secondary issue is the chart's starting balance: `expandCashflows(state.cashflows, now)` sums every historical occurrence of every recurring entry back to its `date`, so a long-running recurrence added retroactively can push the starting point deep negative.

## Fix

1. `src/routes/planning.tsx` — replace the ad-hoc `recurring` computation with the same evaluator the chart uses, so both agree:
   - Build the next 12 months of occurrences with `expandCashflows(state.cashflows, addMonths(now, 12)).filter(e => new Date(e.date) > now)`.
   - Resolve values with `valuesByEntry(...)` so percent entries evaluate against real income/expense bases and installments/weeklies count their actual occurrences.
   - Aggregate to a monthly average: `sum(next 12 months) / 12` for both income and expense. Exclude credit-card-funded expenses to match the chart's `paymentMethod?.startsWith("credit:")` rule.
   - Derive `savingsRate = max(0, (incomeMo - expenseMo) / incomeMo)` from these consistent numbers.

2. Recurring list rows (Income vs Subscriptions cards):
   - Show a truthful per-month number per entry using the same expansion: for each recurring parent, average its next-12-month occurrences' resolved values. This makes a "25% tax" line read CHF 750/mo and a weekly grocery line read its true monthly cost.
   - Keep existing name/category/sort logic.

3. Anchor the chart to today's real liquidity, not a synthetic past sum:
   - Replace the "sum all past occurrences from entry.date" starting balance with the same value the Dashboard already computes for "Liquidity" (running liquidity across all past cashflows and transfers as of today). If a shared helper doesn't already exist, add one small pure function in `src/routes/cashflow.tsx` (`currentLiquidity(state, asOf)`) and reuse it here and on the Dashboard.
   - This removes the "starts at -CHF 900" surprise and makes the chart reflect what the user actually has on hand.

4. Runway math becomes consistent:
   - `runwayMonths = currentLiquidity / max(0, expenseMo - incomeMo)` when net is negative; otherwise `Infinity` (no runway concept when saving).
   - Update the caption copy so it doesn't say "-0.4 months of runway" when net cashflow is positive.

## Non-goals

- No change to how cashflows are entered, edited, or stored.
- No change to the chart's visual style, gradient, or period selector.
- No change to how installments or credit-card debt are tracked.

## Verification

- With income CHF 3,000/mo and a 25% recurring tax expense, the snapshot must read expenses ≈ CHF 750 higher than before and net near 0 (or negative), matching the chart's slope.
- Chart start point equals the Dashboard's "Liquidity" figure to the cent.
- Toggling months 3 / 6 / 12 / 24 keeps the same monthly slope; only the horizon length changes.
- Adding a new weekly expense updates both the snapshot and the chart by the same per-month amount.
