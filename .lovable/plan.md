## Goal

Let a percentage entry be tied to a specific base instead of always using total income. Examples:

- "10% of Salary (monthly)" — base is the Salary entry's resolved amount
- "20% of all income" (current behavior)
- "5% of all expenses" (new)

## Data model

Extend `CashflowEntry` in `src/lib/types.ts`:

```ts
amountKind?: "fixed" | "percent";
/** Only used when amountKind === "percent". Defaults to "all-income". */
percentOf?: "all-income" | "all-expense" | string; // string = another entry's id
```

Backwards compatible: existing percent entries with no `percentOf` continue to behave as "all-income".

## Value resolution

Rewrite `valuesByEntry()` in `src/routes/cashflow.tsx`:

1. First pass: resolve every **fixed** entry to its display-currency value.
2. Compute `baseIncome` and `baseExpense` from those fixed values.
3. Second pass: resolve each **percent** entry:
   - `percentOf === "all-income"` → `amount% × baseIncome` (default)
   - `percentOf === "all-expense"` → `amount% × baseExpense`
   - `percentOf === <entryId>` → `amount% ×` that entry's value (only fixed entries are pickable, so no recursion)
   - If the referenced entry is missing or is itself a percent → fall back to 0 and continue.

Sankey, totals, and chart all already use `valuesByEntry`, so they get the new behavior automatically.

## UI

In `AddForm` and `EditEntryDialog`:

- When the percentage toggle is on, replace the static "of total income" helper with a **"Percent of"** select:
  - `All income`
  - `All expenses`
  - Disabled separator: "— Subscribe to entry —"
  - Each **fixed** entry, labeled like `Salary · €4,000 /mo` (income) or `Rent · €1,200 /mo` (expense)
- Default value: `all-income`.
- Persist as `percentOf` on the entry.

State: `const [percentOf, setPercentOf] = useState<string>("all-income")` in both forms; pre-fill from the entry in the edit dialog.

## Display

In the entries table (line ~795 area) and the PDF export, change the percent label from `20% ≈ CHF 480` to:

- `20% of Salary ≈ CHF 480`
- `20% of all income ≈ CHF 480`
- `5% of all expenses ≈ CHF 200`

Tooltip on the chart already shows resolved values; no change needed there.

## Edge cases

- If a user deletes the referenced entry, percent entries pointing at it resolve to 0 and the table shows `20% of (deleted) ≈ CHF 0` with a muted style.
- The "Percent of" picker only lists fixed entries, so cycles are impossible.

## Files to edit

- `src/lib/types.ts` — add `percentOf` field.
- `src/routes/cashflow.tsx` — `valuesByEntry`, `AddForm`, `EditEntryDialog`, entries table render, PDF row formatter.
