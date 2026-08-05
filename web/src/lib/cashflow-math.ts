import { addDays, addMonths, addWeeks, addYears, endOfDay, format, startOfDay } from "date-fns";
import type { CashflowEntry } from "@/lib/types";

export type ExpandedCashflowEntry = CashflowEntry & {
  parentId: string;
  isOccurrence: boolean;
};

/** Expand recurring cashflow entries into individual occurrences up to `until`. */
export function expandCashflows(
  entries: CashflowEntry[],
  until: Date = new Date(),
): ExpandedCashflowEntry[] {
  const out: ExpandedCashflowEntry[] = [];
  for (const e of entries) {
    if (e.installmentPlan && e.kind === "expense") {
      const plan = e.installmentPlan;
      const perCharge = plan.total / Math.max(1, plan.count);
      const start = new Date(plan.firstDueDate);
      for (let i = 0; i < plan.count; i++) {
        const occ = plan.frequency === "weekly" ? addWeeks(start, i) : addMonths(start, i);
        if (occ > until) break;
        out.push({
          ...e,
          id: `${e.id}__inst${i}`,
          amount: perCharge,
          amountKind: "fixed",
          date: occ.toISOString(),
          installmentPlan: undefined,
          parentId: e.id,
          isOccurrence: i > 0,
        });
      }
      continue;
    }
    if (!e.recurrence) {
      out.push({ ...e, parentId: e.id, isOccurrence: false });
      continue;
    }
    const start = new Date(e.date);
    const stop = e.recurrence.until ? new Date(e.recurrence.until) : until;
    const last = stop < until ? stop : until;
    const step =
      e.recurrence.frequency === "weekly"
        ? (d: Date, i: number) => addWeeks(d, i)
        : e.recurrence.frequency === "monthly"
          ? (d: Date, i: number) => addMonths(d, i)
          : (d: Date, i: number) => addYears(d, i);
    let i = 0;
    while (i < 600) {
      const occ = step(start, i);
      if (occ > last) break;
      out.push({
        ...e,
        id: `${e.id}__${occ.toISOString().slice(0, 10)}`,
        date: occ.toISOString(),
        parentId: e.id,
        isOccurrence: i > 0,
      });
      i++;
    }
  }
  return out;
}

export function getUpcomingOccurrences(
  entries: CashflowEntry[],
  opts: { from?: Date; days?: number } = {},
): ExpandedCashflowEntry[] {
  const from = startOfDay(opts.from ?? new Date());
  const days = opts.days ?? 30;
  const horizon = endOfDay(addDays(from, days));
  const expanded = expandCashflows(entries, horizon);
  return expanded
    .filter((e) => {
      if (e.kind === "transfer") return false;
      const d = new Date(e.date);
      return d >= from && d <= horizon;
    })
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
}

export function summarizeUpcoming(
  occurrences: ExpandedCashflowEntry[],
  values: Map<string, number>,
): { income: number; expense: number; net: number } {
  let income = 0;
  let expense = 0;
  for (const e of occurrences) {
    const v = values.get(e.id) ?? 0;
    if (e.kind === "income") income += v;
    else if (e.kind === "expense") expense += v;
  }
  return { income, expense, net: income - expense };
}

export function groupOccurrencesByDay(
  occurrences: ExpandedCashflowEntry[],
): Map<string, ExpandedCashflowEntry[]> {
  const map = new Map<string, ExpandedCashflowEntry[]>();
  for (const e of occurrences) {
    const key = format(new Date(e.date), "yyyy-MM-dd");
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

export function isRecurringParent(entry: CashflowEntry): boolean {
  return !!entry.recurrence || !!entry.installmentPlan;
}

export function liquidityImpact(entry: CashflowEntry, valueInDisplay: number): number {
  if (entry.kind === "income") return valueInDisplay;
  if (entry.kind === "expense") {
    const pm = entry.paymentMethod;
    if (pm && pm.startsWith("credit:")) return 0;
    return -valueInDisplay;
  }
  const from = entry.fromAccount;
  const to = entry.toAccount;
  let delta = 0;
  if (from === "liquidity") delta -= valueInDisplay;
  if (to === "liquidity") delta += valueInDisplay;
  return delta;
}

export function cardDebtImpact(
  entry: CashflowEntry,
  cardId: string,
  valueInDisplay: number,
): number {
  const ref = `credit:${cardId}` as const;
  if (entry.kind === "expense" && entry.paymentMethod === ref) return valueInDisplay;
  if (entry.kind === "transfer") {
    if (entry.toAccount === ref) return -valueInDisplay;
    if (entry.fromAccount === ref) return valueInDisplay;
  }
  return 0;
}

export function valuesByEntry(
  entries: CashflowEntry[],
  toDisplay: (amount: number, from?: string) => number,
): Map<string, number> {
  const bucketKey = (e: CashflowEntry) => {
    const d = e.date ? new Date(e.date) : null;
    if (!d || Number.isNaN(d.getTime())) return "_";
    return `${d.getFullYear()}-${d.getMonth()}`;
  };
  const fixed = new Map<string, number>();
  const baseIncomeByBucket = new Map<string, number>();
  const baseExpenseByBucket = new Map<string, number>();
  const fixedByParentByBucket = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if ((e.amountKind ?? "fixed") !== "fixed") continue;
    const v = toDisplay(e.amount, e.currency);
    fixed.set(e.id, v);
    const bk = bucketKey(e);
    if (e.kind === "income") baseIncomeByBucket.set(bk, (baseIncomeByBucket.get(bk) ?? 0) + v);
    else if (e.kind === "expense")
      baseExpenseByBucket.set(bk, (baseExpenseByBucket.get(bk) ?? 0) + v);
    const parentId = (e as CashflowEntry & { parentId?: string }).parentId ?? e.id;
    let bm = fixedByParentByBucket.get(bk);
    if (!bm) {
      bm = new Map();
      fixedByParentByBucket.set(bk, bm);
    }
    bm.set(parentId, (bm.get(parentId) ?? 0) + v);
  }
  const out = new Map<string, number>();
  for (const e of entries) {
    if ((e.amountKind ?? "fixed") === "percent") {
      const pct = Number(e.amount) / 100;
      const target = e.percentOf ?? "all-income";
      const bk = bucketKey(e);
      let base = 0;
      if (target === "all-income") base = baseIncomeByBucket.get(bk) ?? 0;
      else if (target === "all-expense") base = baseExpenseByBucket.get(bk) ?? 0;
      else {
        const bm = fixedByParentByBucket.get(bk);
        base = bm?.get(target) ?? fixed.get(target) ?? 0;
      }
      out.set(e.id, pct * base);
    } else {
      out.set(e.id, fixed.get(e.id) ?? toDisplay(e.amount, e.currency));
    }
  }
  return out;
}
