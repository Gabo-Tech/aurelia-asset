## Goal

Generate a downloadable `demo-data.json` file the user can import via the app's existing import flow to test today's new features: multi-budget plans (with a main plan), multi-forecast scenarios (with a main scenario), and the collapsible category pie charts (incomes / expenses / investments with drill-down) on the cashflow page.

## What the file will contain

Shape follows `AppState` in `src/lib/types.ts` so `importState` accepts it as-is.

- **settings**: `displayCurrency: "EUR"`, privacyMode off, defaults otherwise.
- **categories**: keep `DEFAULT_CATEGORIES` (10 built-ins) so category IDs match cashflow entries.
- **cashflows** (~25 entries in the last ~60 days, spread across categories so each pie has multiple slices and a drill-down makes sense):
  - Incomes: 2 salary entries, 2 freelance, 1 dividend, 1 other-income.
  - Expenses: 2 rent, 4 food, 3 transport, 2 entertainment.
  - Investments/savings group: 3 in `cat-investments` (ETF DCA, crypto DCA, single stock buy), 2 in `cat-savings` (emergency fund top-ups). These populate the "Investments" pie via the existing group filter.
  - Salary entries use `recurrence: monthly` so forecasts have realistic recurring baseline.
- **budgetPlans** (3 plans, to exercise the multi-plan UI + main selector):
  - `plan-baseline` — Rent 1200, Food 500, Transport 150, Entertainment 100, Savings 400 (each linked to its `categoryId` so actuals roll up).
  - `plan-vacation-month` — Rent 1200, Food 700, Transport 300, Entertainment 400, Savings 100.
  - `plan-frugal` — Rent 1200, Food 350, Transport 80, Entertainment 40, Savings 700, plus a free-form line "Buffer" 200 with no `categoryId` to show manual-only lines.
  - `mainBudgetPlanId: "plan-baseline"`.
- **forecastScenarios** (3 scenarios):
  - `scn-baseline` — 6 months, no adjustments.
  - `scn-raise` — 12 months, `monthlyIncomeAdjust: +500`.
  - `scn-tight` — 6 months, `monthlyExpenseAdjust: +300`, notes "cost-of-living bump".
  - `mainForecastScenarioId: "scn-baseline"`.
- **holdings / transactions / creditCards / goals / loans / budgets**: empty arrays (not the focus of today's work; keeps the import minimal and predictable).

Dates are generated relative to today (July 9, 2026) so the pies and cashflow list show recent activity on import.

## Deliverable

A single file written to `/mnt/documents/demo-data.json`, surfaced as a `<presentation-artifact>` so the user can download it and import via Settings → Import.

No code changes to the app itself.
