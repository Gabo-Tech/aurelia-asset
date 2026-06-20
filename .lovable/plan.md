## What's happening

The Value column on `/holdings` is being FX-converted twice, which is why your manual €4,798.74 holding shows as €4,184.13 (≈ 4798.74 × EUR/USD ≈ 0.872).

In `src/routes/holdings.tsx`:

```ts
// row build — already converts to display currency (EUR):
const mv = toDisplay(h.quantity * h.currentPrice, h.priceCurrency);
// ...
marketValue: mv,
```

Then in the cell:

```tsx
<TableCell ...>{mask(h.marketValue)}</TableCell>
```

`mask` from `useMoney` is defined as `maskMoney(toDisplay(amount, from), displayCurrency, privacy)`. Because no `from` is passed, it defaults to `"USD"` and converts the already-EUR value from USD→EUR a second time. Result: `value ≈ price × USD→EUR rate`.

That's why Price (shown in the holding's native currency, no conversion) and Value (converted twice) disagree even when quantity is 1.

The same double-conversion happens for `total` (line 67), which is then used in the % column and the summary, so percentages and totals are also slightly off in mixed-currency cases.

## Fix

In `src/routes/holdings.tsx`, stop running already-converted amounts through `toDisplay` again:

1. Render the cell with `maskMoney(h.marketValue, currency, privacy)` (importing `maskMoney` from `@/lib/format` and reading `currency` from `useMoney`) instead of `mask(h.marketValue)`. Or equivalently, store the un-converted `quantity * currentPrice` in the row and call `mask(raw, h.priceCurrency)` in the cell.
2. Apply the same correction to any other place in this file that feeds an already-converted number into `mask`/`fmt` (the summary "Total value" row, if it uses `mask` on `total`).

No other files need changes — `cashflow.tsx` and `index.tsx` already pass the native currency as the `from` argument, so they're not affected.

## Verification

- Open `/holdings`, confirm the custom QUAN row shows Price €4,798.74 and Value €4,798.74 with quantity 1.
- Add a second custom holding in a different currency (e.g. USD) and confirm Value converts once to your display currency and the % column sums to 100%.
- Toggle privacy mode to ensure masking still works.
