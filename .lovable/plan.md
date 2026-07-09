# Cashflow: Category Pie Charts

Add a collapsible "Breakdown by category" section beneath the Sankey chart on `/cashflow`, showing three pies: Incomes, Expenses, Investments. Default collapsed. Each slice = a category; clicking a slice drills into that category's individual entries. Clicking the center (or a Back button) returns to the category view.

## UX

- New `<Collapsible>` section immediately under the Sankey card, closed by default, labeled "Breakdown by category" with a chevron.
- Inside: responsive grid — 3 columns desktop, 1 column mobile — one card per pie (Incomes / Expenses / Investments).
- Each pie card header shows: title, total amount, count of entries.
- Drill-down: clicking a slice re-renders that same pie showing the individual entries within the clicked category, with a small "← Back to categories" button and the category name shown as subtitle. State is per-pie (independent).
- Empty state per pie: muted "No entries yet" placeholder when that group has no data.
- Legend below each pie with color dot + label + percentage; slices under ~3% collapse into a single "Other" slice (still drillable).

## Data

Read from the existing cashflow store (same source the Sankey uses). Split entries by kind:

- Incomes = income entries
- Expenses = expense entries (excluding investments)
- Investments = entries flagged as investment / savings-transfer type

For each pie, aggregate by `category` for the top-level view; on drill-down, list raw entries within the selected category (label = entry description, value = amount). Amounts formatted with existing currency helper; percentages computed off the pie's own total.

## Implementation

- New component `src/components/category-pie-card.tsx` — self-contained card handling one pie: props `{ title, entries: {id, label, category, amount}[], emptyLabel }`, internal state for `drillCategory: string | null`.
- Uses Recharts `PieChart` / `Pie` / `Cell` / `Tooltip` (already a project dep via Sankey/other charts — verify in exploration; if not present, add `recharts`). Colors pulled from existing chart tokens in `src/styles.css` (`--chart-1..--chart-5`) so it matches the app palette; no hardcoded hex.
- New wrapper section in `src/routes/cashflow.tsx` using shadcn `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent`, placed directly after the Sankey `ChartFrame` block. Renders three `<CategoryPieCard>` in a `grid gap-4 md:grid-cols-3`.
- i18n: add keys `cashflow.breakdown.title`, `cashflow.breakdown.incomes`, `cashflow.breakdown.expenses`, `cashflow.breakdown.investments`, `cashflow.breakdown.back`, `cashflow.breakdown.empty`, `cashflow.breakdown.other` across existing locale files.

## Out of scope

- No changes to Sankey, planning, or store shape.
- No new persisted state (collapse state stays local; not saved).
- No export/download of pie data.
