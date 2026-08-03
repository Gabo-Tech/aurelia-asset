/**
 * Budget plan period window helpers (ported from web planning route).
 */

import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
  isWithinInterval,
} from "date-fns";
import type { BudgetPlan, CashflowEntry, Category } from "@/lib/types";
import { expandCashflows, valuesByEntry } from "@/lib/cashflow-math";

export function computePlanWindow(plan: Pick<BudgetPlan, "periodType" | "periodDays">): {
  start: Date;
  end: Date;
  label: string;
} {
  const now = new Date();
  const type = plan.periodType ?? "monthly";
  switch (type) {
    case "daily":
      return { start: startOfDay(now), end: endOfDay(now), label: "Today" };
    case "weekly":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
        label: "This week",
      };
    case "biweekly": {
      const start = startOfDay(subDays(now, 13));
      return { start, end: endOfDay(now), label: "Last 14 days" };
    }
    case "yearly":
      return { start: startOfYear(now), end: endOfYear(now), label: "This year" };
    case "custom": {
      const n = Math.max(1, Math.min(3650, Math.floor(plan.periodDays || 30)));
      const start = startOfDay(subDays(now, n - 1));
      return { start, end: endOfDay(now), label: `Last ${n} days` };
    }
    case "monthly":
    default:
      return { start: startOfMonth(now), end: endOfMonth(now), label: "This month" };
  }
}

/** Map categoryId → spent amount in display currency for the plan window. */
export function spentByCategoryId(
  cashflows: CashflowEntry[],
  categories: Category[],
  window: { start: Date; end: Date },
  toDisplay: (amount: number, from?: string) => number,
): Map<string, number> {
  const expanded = expandCashflows(cashflows, window.end);
  const values = valuesByEntry(expanded, toDisplay);
  const nameToId = new Map<string, string>();
  for (const c of categories) {
    if (c.kind === "expense") nameToId.set(c.name.trim().toLowerCase(), c.id);
  }
  const byCat = new Map<string, number>();
  for (const e of expanded) {
    if (e.kind !== "expense") continue;
    const d = new Date(e.date);
    if (!isWithinInterval(d, { start: window.start, end: window.end })) continue;
    const v = values.get(e.id) ?? 0;
    const catId = nameToId.get((e.category || "").trim().toLowerCase());
    if (!catId) continue;
    byCat.set(catId, (byCat.get(catId) ?? 0) + v);
  }
  return byCat;
}
