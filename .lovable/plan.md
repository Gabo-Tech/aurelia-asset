## Goal

Make the multi-budget and multi-forecast UX communicate "create as many as you want, for any purpose", and add pie-chart views (with editable colors, labels, and percentages) to both.

## 1. Budget plans (`src/routes/planning.tsx` + types + store)

### 1a. Per-plan metadata

Extend `BudgetPlan` in `src/lib/types.ts`:

```ts
export type BudgetPlan = {
  id: string;
  name: string;
  items: BudgetItem[];
  description?: string; // e.g. "Summer vacation to Japan"
  color?: string; // accent color, default from palette on create
};
```

- Extend `updateBudgetPlan` in the store — no signature change (already accepts `Partial<BudgetPlan>`).
- Migration: existing plans get `color` from a rotating palette on first render (no persisted change until user edits).
- Add the same fields to Zod schemas in `src/routes/settings.tsx` so import/export keeps them.

### 1b. Plan-manager UX (freedom-focused)

Replace the current single dropdown with a "workspace" strip:

- Sticky top row: horizontal scroll of **plan chips** (color dot + name + item count). Active chip highlighted; "★ Main" badge on the main plan. Tap a chip to switch.
- Trailing "+ New plan" chip. Clicking it opens a small dialog with: name, optional description, color picker (6-swatch palette + custom hex).
- Active plan header card shows: color-tinted title, description (editable inline), total budget, spent-this-month, and buttons `Rename`, `Edit`, `Set main`, `Duplicate`, `Delete`.
- "Duplicate" is new: copies items to a new plan named "{name} (copy)". Useful for building variants (e.g. duplicate baseline, tweak for a trip).
- Empty state copy: "Create a budget for anything — a vacation, a personal project, a moving month, your regular monthly plan." with 3 quick-start template buttons (`Monthly`, `Vacation`, `Project`) that just prefill the name/description/color.

### 1c. Per-item color override

Extend `BudgetItem`:

```ts
export type BudgetItem = { ...; color?: string };
```

- In the item row and edit dialog, add a small color swatch. When empty, fall back to the linked category color, then to the plan color.
- Persist through existing `updateBudgetItem`.

### 1d. Budget pie chart (new, always visible under items)

Add a new `<BudgetPieCard>` (in `src/components/budget-pie-card.tsx`) that renders one donut per active plan:

- Data: one slice per budget item, `value = toDisplay(item.amount, item.currency)`, `color = item.color ?? categoryColor ?? planColor`, `label = item.label`.
- Center label: total budget for the plan.
- Legend list below: swatch + label + `{amount} · {pct}%` of plan total.
- Reuses the same visual language as `CategoryPieCard` (tooltip with `popover-foreground`, `allowEscapeViewBox`, "Other" rollup for slices <3%).
- Renders next to the item list on `lg:` (2/3 items | 1/3 pie) and stacks under it on mobile.
- Show/hide toggle button (default: shown for budgets — pie is the point) persisted in localStorage per user.

## 2. Forecast scenarios (`src/routes/planning.tsx` + types + store)

### 2a. Per-scenario metadata

Extend `ForecastScenario`:

```ts
export type ForecastScenario = {
  ...; description?: string; color?: string;
};
```

Migration + schema update same as budgets.

### 2b. Scenario-manager UX

Same chip strip pattern as budgets:

- Horizontal chip scroller with color dot + name; trailing `+ New scenario`.
- New dialog fields: name, description, color, months, income adjust, expense adjust, currency, notes.
- Header buttons: `Rename`, `Edit`, `Set main`, `Duplicate`, `Delete`.
- Empty-state templates: `Personal`, `Small business`, `Side project`, `Optimistic (+income)`, `Downturn (+expense)` — each seeds sensible defaults.

### 2c. Recurring income/expense pies (collapsible, hidden by default)

Add a `<Collapsible>` section under the forecast chart titled **"Recurring income & expenses"**, hidden by default (persist open/closed per scenario in localStorage).

Compute from the same recurring cashflows the forecast baseline uses:

- `recurringIncomeByMonth`: sum of resolved values from `expandCashflows(state.cashflows, oneMonthFromNow)` filtered to `kind === "income"` and grouped by `source` (fallback "Other"), for the next 1 month.
- `recurringExpenseByMonth`: same for `kind === "expense"` grouped by `category`.
- Include the scenario's `monthlyIncomeAdjust` / `monthlyExpenseAdjust` as an extra "Scenario adjustment" slice (only when non-zero).

Render two pies side by side (stacked on mobile) using the same `BudgetPieCard` component, retitled per pie. Slice colors come from the category color when available; otherwise a stable palette. Each slice shows `{amount} · {pct}%` of the pie's total in the legend and in the tooltip.

## 3. Store additions (`src/lib/store.tsx`)

- `duplicateBudgetPlan(id: string): BudgetPlan` — deep-copies items with new ids.
- `duplicateForecastScenario(id: string): ForecastScenario`.
- Everything else uses existing `update*` methods with the new optional fields.

## 4. i18n

Add strings under `planning.budgets.*` and `planning.forecast.*` for: description placeholder, color, duplicate, template names, "Recurring income", "Recurring expenses", "Show/Hide breakdown". Add English defaults inline via `t(key, { defaultValue })` so no locale file needs to ship in this pass.

## 5. Out of scope

- Goals and Loans panels are untouched.
- No changes to how the forecast projection line is computed — pies only visualize the existing baseline recurring flows plus the scenario adjustment.
- No new dependencies (recharts + existing pie card cover everything).

## Technical notes

- Reuse `CategoryPieCard` if adaptable; if the per-slice color/label freedom conflicts, factor a smaller `DonutChart` primitive that both `CategoryPieCard` and `BudgetPieCard` consume. Prefer the second (cleaner) approach.
- Chip strip: `overflow-x-auto` + `snap-x` on mobile; wraps to grid on `sm:`.
- Color picker: reuse the swatch pattern from `credit-cards-manager.tsx` if present; otherwise a small inline component with 8 palette swatches + native `<input type="color">`.
- Collapsible: shadcn `Collapsible` already imported elsewhere in the project.
- Persist per-scenario "breakdown open" state under `planning_forecast_breakdown_open_v1` (map of scenarioId → bool) via `secureSet` (already used for cashflow prefs).
