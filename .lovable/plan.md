# Linking Cashflow ↔ Holdings, Credit Cards, and Installments

Goal: stop forcing every money movement to be "income" or "expense". Add a small set of new entry kinds so transfers between accounts, credit-card cycles, and financed purchases stop polluting P&L, while still showing up in projections, balances, and the Sankey.

## 1. Classify holdings by horizon

Add `horizon: "long" | "short"` (default `long`) on `Holding`.

- New optional field in `HoldingDialog` (segmented control: "Long term" / "Short term").
- Filter chip on Holdings page + dashboard split: "Long-term portfolio" vs "Short-term / liquid".
- Used by the new transfer flow to suggest which holdings can act as a "cash-like" source/destination (short-term lending platforms, savings, brokerage cash).

## 2. New cashflow entry kind: `transfer`

Extend `CashflowEntry.kind` to `"income" | "expense" | "transfer"`.

A transfer has `fromAccount` and `toAccount`, where each side is one of:
- `liquidity` (the implicit cash pool we already track)
- `holding:<holdingId>` (any Holding, typically short-term)
- `credit:<cardId>` (see §3)

Behavior:
- Transfers are excluded from income/expense totals, Sankey income/expense columns, and the cashflow line "delta".
- They DO move balances: liquidity goes down/up, and the matching Holding gets an auto-generated `HoldingTransaction` (buy on the receiving side, sell on the sending side) tagged `source: "transfer"` so it's not double-counted.
- Sankey gets an optional "Transfers" middle band (toggle in chart settings) so you can visualize them without mixing with P&L.

User scenarios solved:
- "Invested 1751.71 into Quanloop" → Transfer: liquidity → holding:quanloop. Creates a Buy on Quanloop; not an expense.
- "Sold 1900 from Quanloop to pay the card" → Transfer: holding:quanloop → liquidity (sell on Quanloop). Then the card payment is its own entry (see §3). Neither shows as income.

## 3. Credit cards as first-class accounts

New top-level concept `CreditCard` (stored alongside holdings/categories):
- `id, name, color, currency, statementDay, dueDay, creditLimit?`
- Internally modeled as a liability account with negative-going balance.

Three entry shapes touch a card:
1. **Charge** = existing `expense` entry with `paymentMethod: "credit:<cardId>"`. Counts as expense immediately (real economic cost), but does NOT decrease liquidity; instead it increases card balance owed.
2. **Statement / payment** = `transfer` from `liquidity` → `credit:<cardId>`. Reduces card balance owed; not an expense (the expense already hit when you charged).
3. **Refund/credit on card** = `transfer` from `credit:<cardId>` → `liquidity` (or negative charge).

UI:
- Add `paymentMethod` selector on every expense (default `liquidity`). Persist last used per category.
- New "Cards" panel on Cashflow page: per-card balance owed, current cycle spend, next due date, "Mark statement paid" shortcut that prefills the transfer.
- Dashboard stat: "Card debt" line under Liquidity. Net worth = portfolio + liquidity - card debt.

This fixes the double-count problem: paying the card is not a new expense, and charging the card is not deferred - it shows the day it happened.

## 4. Installment / financed purchases

Add `installmentPlan` to any `expense` entry:
```
installmentPlan?: {
  total: number;        // total price
  count: number;        // e.g. 4
  frequency: "weekly" | "monthly";
  firstDueDate: string;
  paymentMethod: "liquidity" | "credit:<cardId>";
}
```

When set, the entry is rendered as N scheduled child charges (similar to existing `expandCashflows` recurrence expansion) instead of one lump sum. Each installment hits cashflow on its due date via the chosen payment method (so a financed purchase on a card behaves correctly per §3).

UI:
- In Add Entry form, "Pay in installments" toggle revealing count / frequency / first due date.
- Entries list groups installments under the parent purchase with progress ("2 of 4 paid, €X remaining").
- Filter chip "Installments" + a "Remaining installment obligations" stat on dashboard.

## 5. Entries list & filters

- Add "Type" filter: Income / Expense / Transfer / Installment.
- Add "Account" filter: Liquidity, each card, each holding (for transfers).
- Show a small badge per row: payment method, transfer arrow `Liquidity → Quanloop`, installment progress.

## 6. Sankey / charts impact

- Sankey: incomes and expenses unchanged. New optional middle column "Movements" showing transfers between liquidity / holdings / cards. Off by default to keep the classic view clean.
- Cashflow line chart: unchanged for cash balance; add a toggle "Include card debt" to plot net liquidity (liquidity - cardDebt).
- Holdings invested-vs-value chart: transfers feed Buys/Sells naturally so the existing chart "just works".

## 7. Data model summary (technical)

- `Holding.horizon?: "long" | "short"`
- `CashflowEntry.kind` += `"transfer"`, plus `fromAccount?`, `toAccount?`, `paymentMethod?`, `installmentPlan?`, `linkedTransactionId?` (set when a transfer auto-creates a HoldingTransaction).
- New `CreditCard` collection in `AppState` + `creditCards: CreditCard[]`.
- Migration: existing entries default `paymentMethod = "liquidity"`, no transfers, no installments. No data loss.
- Export/import envelope picks up the new fields automatically once added to the schema.

## 8. Rollout order

1. Add `horizon` to holdings + UI filter.
2. Add `paymentMethod` + Credit Cards CRUD + card debt stat.
3. Add `transfer` kind + auto-linked HoldingTransaction + Sankey toggle.
4. Add `installmentPlan` + expansion in `expandCashflows` + UI.
5. Update PDF export, filters, dashboard cards, i18n strings (6 locales).

## Open questions

1. For transfers into a holding, should we let you enter the **quantity** received (e.g. 0.031 XMR for €1751.71) or always treat the transfer as a pure cash-value buy and back out the price? I'd default to: ask for quantity only if the destination holding has a market price; for cash-like holdings (Quanloop, savings), skip quantity and treat 1 unit = 1 currency.
2. Should card-charge expenses count toward the "Net 30 days" stat the day of the charge, or the day they actually hit liquidity via the statement payment? I'd default to: count on charge date (true economic cost) and separately show "Upcoming card payments" on the dashboard.
3. Do you want a single global "Liquidity" pool or multiple cash accounts (e.g. checking, savings)? Multi-account is a bigger change; happy to scope it as a follow-up.
