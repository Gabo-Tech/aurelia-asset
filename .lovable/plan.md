## Goal

Make the Sankey in Cashflow legible and breathing — like the reference chart the user shared — instead of the cramped, overlapping labels visible in the current mobile screenshot.

## Root causes in `src/components/sankey-chart.tsx`

1. **Fixed height** (`height=380` by default) does not grow with the number of nodes, so with many expense categories the node bands and their two-line labels (name + amount) collide.
2. **Node padding is small and static** (18px desktop / 12px mobile). d3-sankey packs nodes to fit height, so more expenses = tighter bands = overlapping labels.
3. **Labels use one flat font size** and place amount directly under the name with only 14px between baselines — smaller bands overlap the neighbor.
4. **Right/left margins are fixed** — long labels like "Swisscard Credit Card" get clipped or overwrite adjacent labels.
5. **No node-name truncation guard**, so on narrow widths long names crash into the numbers/percentages.
6. Percentages (visible in the reference: "€286 (29.5%)") are not shown — only the raw amount, which hides the story.

## Fix (only `src/components/sankey-chart.tsx`, plus tiny call-site tweak in `src/routes/cashflow.tsx`)

1. **Dynamic height.** Compute `autoHeight = max(baseHeight, maxSide * rowHeight + padding)` where `maxSide = max(incomeNodeCount, expenseNodeCount)` and `rowHeight ≈ 56px` desktop / 44px mobile. Use it when the caller doesn't force a height. This is the key fix: the chart grows as expenses grow, so bands stay thick and labels never overlap.
2. **Dynamic node padding.** Scale `nodePadding` with available height per node: `clamp(14, innerH / (maxSide * 3), 40)`. More expenses → more total height (rule 1) → padding stays generous instead of collapsing.
3. **Two-line labels with real spacing.** Keep name on line 1, amount + percentage on line 2, but:
   - increase vertical gap to ~18px desktop / 14px mobile
   - name font 13/12px semibold, amount 11/10px muted
   - only render the label pair when the band is tall enough (`n.y1 - n.y0 >= 14`); otherwise render name only, centered
   - append `(xx.x%)` to the amount using each node's share of its side's total (income share for income/source nodes, expense share for expense/sink nodes) — matches the reference.
4. **Wider side margins + truncation.** Bump right margin to `max(140, longestLabelPx + 24)` measured with a canvas 2d context; left margin similar when left-side labels exist. Truncate any single label to ~22 chars with an ellipsis so nothing crashes into numbers.
5. **Mobile behavior.** On `isNarrow`, render labels above/below the node rect instead of to the side when the node is on the far right and its label would overflow the viewport; also raise `nodeWidth` to 14 so the color band is visible.
6. **Cashflow call site** (`src/routes/cashflow.tsx`): stop passing a fixed `height={...}` to `SankeyChart` for the cashflow view so the new auto-height kicks in; keep `ChartFrame` wrapper. Modal (fullscreen) path in `ChartFrame` already forces `h-full` so nothing else changes.

No changes to data shape, drag-to-reorder, gradients, or i18n.

## Verification

- With the demo dataset from the screenshot (many small expense nodes): bands stay ≥ ~24px tall, no label overlaps, percentages visible next to each amount.
- Adding more expense categories visibly grows the chart height instead of squeezing bands.
- Long labels ("Swisscard Credit Card", "Abanca Credit Card") don't overlap the amount column.
- Desktop and 375px-wide mobile both render cleanly; fullscreen modal still fills the dialog.
