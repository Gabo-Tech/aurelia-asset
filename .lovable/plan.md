## Why the numbers disagree

- **Net worth's "+€988.57 cashflow"** is the all-time cumulative balance. It uses `expandCashflows` (projects every recurring entry up to today) and `valuesByEntry` (resolves `%` entries against their `percentOf` target).
- **"Cashflow · last 30 days = −€1,060.04"** filters raw `cashflows` by stored `date` and sums `amount` directly. It therefore:
  1. Skips recurring incomes/expenses whose original `date` is older than 30 days (a salary entered months ago contributes nothing this month).
  2. Treats `%` entries as literal currency amounts.
  3. Doesn't apply percent-of-target math, so deductions look right but the income they depend on is missing.

Net result: recurring income gets dropped from the 30‑day window while recurring/percent expenses still appear (or vice versa), producing the +€988 vs −€1,060 mismatch.

## Fix

Single change in `src/routes/dashboard.tsx`: replace the `net30` calculation so it uses the same pipeline as `cashflowBalance`, just windowed.

```ts
const net30 = useMemo(() => {
  const now = new Date();
  const cutoff = now.getTime() - 30 * 86400000;
  const expanded = expandCashflows(cashflows, now);
  const values = valuesByEntry(expanded, toDisplay);
  let bal = 0;
  for (const e of expanded) {
    if (new Date(e.date).getTime() < cutoff) continue;
    const v = values.get(e.id) ?? 0;
    bal += (e.kind === "income" ? 1 : -1) * v;
  }
  return bal;
}, [cashflows, toDisplay]);
```

After this:
- Recurring entries contribute their occurrences that fall inside the last 30 days.
- `%` entries resolve against their target, just like the net-worth card.
- The "Cashflow · last 30 days" value becomes a true subset of the cumulative cashflow shown under Net worth, so the signs and magnitudes stay coherent.

No other files or behaviours change.