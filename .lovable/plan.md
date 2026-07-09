## Goal

Fix the Cashflow "Flow" (Sankey) so it is legible on mobile and doesn't collide with the Credit Cards widget. Match the reference: labels sit ABOVE each node with amount + percentage of the type total.

## 1. Page layout (`src/routes/cashflow.tsx`)

Today the Sankey lives in the right column of a 2-column `lg:grid-cols-2` next to Add-form + Credit Cards, which caps its width at ~half the viewport on desktop and lets the cards row overlap it on mobile.

Change to three stacked sections (matches the request "its own space, beneath credit cards and above entries"):

```
[ StatCards row ]
[ 2-col on lg: AddForm | CreditCards ]   ← Sankey removed from here
[ Flow (Sankey) — full width, own Card ] ← new dedicated row
[ Breakdown by category (collapsible) ]
[ EntriesPanel ]
```

- Remove the Sankey `<Card>` from the right column and render it as a standalone full-width card between the AddForm/CreditCards grid and the Breakdown collapsible.
- Add generous vertical spacing (`mt-6 sm:mt-8`) between the CreditCards row and the Sankey card so on mobile the credit-cards manager can never overlap the graph.
- Keep the period selector + "Reset last month" controls in the Sankey card header; on narrow widths let them wrap under the title instead of squeezing next to it (`flex-col sm:flex-row`).

## 2. SankeyChart rewrite (`src/components/sankey-chart.tsx`)

Rebuild the label + sizing logic to be mobile-first.

### 2a. Use all available width
- Drop the current large adaptive `leftMargin` / `rightMargin` (up to 220px) that we needed for side labels. With labels moved above the nodes, side margins can shrink to ~4–8px, so the sankey ribbons take almost the full container width.
- Container already uses `ResizeObserver` on the wrapper; keep it, but set `min-width: 0` on the wrapper to make sure the parent flex/grid doesn't clip it.

### 2b. Labels above nodes (new default)
- For each node render a two-line label group centered horizontally on the node's `x0..x1` band, positioned ABOVE the node rectangle (`y = n.y0 - gap`).
  - Line 1: node name (bold, `--foreground`).
  - Line 2: `{amount} ({pct}%)` (muted).
- Anchor: `text-anchor: middle` when there's room; fall back to `start`/`end` for the leftmost/rightmost columns so the label doesn't clip the SVG edge.
- Reserve extra top space per node so labels don't collide: increase `nodePadding` (bumped floor: mobile ≥28px, desktop ≥36px) and increase per-row baseline height (mobile 68px, desktop 78px).
- Increase top margin to fit the top row's label (`margin.top = 40` mobile / `48` desktop).
- Truncate long names with a wider budget than today (labels are no longer cramped side-columns).

### 2c. Percentages of type total
Already computed as `pctFor(n)` (income → `n.value/incomeTotal`, expense → `n.value/expenseTotal`). Keep the same formula and always render `{money} ({pct}%)` on both income and expense nodes, matching the reference image. Pool/Saved/account nodes render just the money (no pct — they're not a "type").

### 2d. Label visibility policy
- Wide screens (`width >= 640`): show all labels always (ignore `labelMode` "always" default; overrideable via existing SankeyControls).
- Narrow screens (`width < 640`): default to hover/tap-only labels. Only the tapped/hovered node's label is visible; others fade to 0. Implement with local `activeIdx` state on `SankeyChart`; `onPointerEnter` / `onPointerLeave` for hover, and toggle on `onClick` for tap. Existing `SankeyControls` "Labels" selector still lets the user force "always" or "off".
- Keep the existing native `<title>` tooltip on each rect so long-press on mobile still surfaces the name + amount.

### 2e. Anti-collision safety
- Add `overflow: visible` to the SVG (already there) and remove the parent `overflow-hidden` wrapper in `cashflow.tsx` around the SankeyChart so top labels aren't clipped.
- Cap link stroke width at `max(1, min(l.width, 40))` so a single huge income/expense doesn't create a ribbon that swallows adjacent labels.

## 3. Keep working

- Drag-to-reorder for income/expense nodes: keep the pointer handlers; the drag target is still the node `<rect>`, only label position changed.
- Color pickers in SankeyControls: unchanged.
- Screenshot / PDF export via `ChartFrame`: unchanged (SVG structure still renders identically to raster).
- i18n: no new strings needed; existing labels + percentages are numeric.

## Technical notes (for reference)

- `pctFor` already exists and is exported implicitly through render logic; no data-model change.
- Height auto-computation formula becomes: `rowH = isNarrow ? 68 : 78; height = max(isNarrow ? 380 : 460, maxSide * rowH + margin.top + margin.bottom)`.
- `labelMode` prop stays; new effective default when unset on narrow is `"hover"`. `SankeyControls` in `cashflow.tsx` keeps writing to `prefs.labelMode`, so the user can still force `always`/`off`.
- No API/schema changes. No new deps.

## Out of scope

- No changes to CategoryPieCard or breakdown behavior.
- No changes to entries panel, add form, or credit cards widget internals (only their position in the page grid).
