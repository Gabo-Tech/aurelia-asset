## Root cause

`ForecastPanel` in `src/routes/planning.tsx` computes two independent monthly aggregates that must agree but don't:

1. The chart's future buckets use `expandCashflows` + `valuesByEntry`, which:
   - Resolves `amountKind: "percent"` entries against their base (e.g. `25%` of income = a real currency amount).
   - Expands `installmentPlan` entries into their scheduled monthly (or weekly) charges.
2. The "Monthly income / expenses / savings rate" cards and the recurring lists just do `toDisplay(c.amount, c.currency)` per recurring entry. Percent entries get treated as raw currency (a "25%" tax reads as €25/mo), and installments are ignored.

With any percent expense or installment plan, the two views diverge: the summary can show a positive savings rate while the projected balance visibly drops.

Also: `runwayMonths = data[0].balance / recurring.expenseMo` mixes the chart's balance with the summary's (understated) expense number, giving nonsense runway ("-0.4 months") when balance is negative or expenses are wrong.

## Fix (all in `src/routes/planning.tsx`)

1. **Single source of truth for monthly income / expense / net.**
   - Compute `monthlyIncome`, `monthlyExpense`, `monthlyNet` from the same 12-month forward window used by the chart: run `expandCashflows(state.cashflows, addMonths(now, 12))`, filter to entries strictly in the future, resolve with `valuesByEntry`, split by `kind` (skipping credit-financed expenses via the existing `paymentMethod?.startsWith("credit:")` rule), sum, and divide by 12.
   - This automatically handles percent entries, installments, one-offs falling in the horizon, and recurrence expansions consistently.

2. **Rewire the three summary cards** ("Monthly income (recurring)", "Monthly expenses (recurring)", "Savings rate") to read from these new values. Update the labels to just "Monthly income" / "Monthly expenses" so they honestly represent the 12-month average (they already include recurring; now they also include percent/installments/one-offs).

3. **Recurring lists** (income & subscriptions) keep listing only entries with `c.recurrence` (that's what "recurring" means), but their `perMonth` now uses `valuesByEntry` for that single entry against the same monthly base, so a `25%` tax shows its real per-month currency figure, not `€25`.

4. **Runway** becomes `data[0].balance / monthlyExpense` using the new `monthlyExpense`. Keep the `Infinity` / `Number.isFinite` guards. If `data[0].balance <= 0`, render "no runway" copy instead of a negative months figure.

5. No changes to `expandCashflows`, `valuesByEntry`, `liquidityImpact`, chart shape, or i18n keys. Add a `defaultValue` fallback where a key label shifts (e.g. dropping "(recurring)").

## Verification

- With no percent entries and no installments: summary numbers and slope match today's behavior (regression-safe).
- Add a `25%` percent tax expense against income: summary "Monthly expenses" jumps to include the real tax; savings rate drops; chart slope now matches the summary's net.
- Add an installment plan (e.g. €1,200 over 4 months): during those 4 months the chart's slope reflects €300/mo and the summary shows that contribution too.
- Runway: with positive balance and positive expenses, `data[0].balance / monthlyExpense` matches the point where the chart crosses zero (±rounding). With `balance <= 0`, UI shows "no runway" copy instead of negative months.
