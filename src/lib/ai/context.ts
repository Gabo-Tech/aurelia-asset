/**
 * Builds the finance context injected into the assistant before each message.
 *
 * Small local models cannot query the database, so we pre-compute the data the
 * user's questions usually need (recent activity, this month's spending, budget
 * status, categories) and hand it to the engine as structured data + a compact
 * prompt string. This is also what the deterministic NLU engine reads.
 *
 * All monetary values are normalised to the user's display currency via the
 * `toDisplay` converter from `useMoney()`.
 */

import type { AppState, Category } from "@/lib/types";
import { expandCashflows, valuesByEntry, liquidityImpact, cardDebtImpact } from "@/routes/cashflow";
import { formatMoney } from "@/lib/format";
import { startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

export interface ContextTransaction {
  id: string;
  date: string;
  kind: "income" | "expense" | "transfer";
  category: string;
  amountDisplay: number;
  description?: string;
}

export interface CategorySpend {
  name: string;
  amount: number;
}

export interface BudgetLineStatus {
  label: string;
  categoryName?: string;
  limit: number;
  spent: number;
}

export interface FinanceContext {
  currency: string;
  locale: string;
  /** Today's ISO date (YYYY-MM-DD), local time. */
  today: string;
  categories: Pick<Category, "id" | "name" | "kind" | "group">[];
  expenseCategoryNames: string[];
  /** Most recent activity, newest first (already in display currency). */
  recent: ContextTransaction[];
  month: {
    label: string;
    totalIncome: number;
    totalExpense: number;
    net: number;
    topExpenseCategories: CategorySpend[];
  };
  budget?: {
    planName: string;
    totalLimit: number;
    totalSpent: number;
    lines: BudgetLineStatus[];
  };
  goals: { name: string; target: number; current: number }[];
  wealth: {
    portfolioTotal: number;
    liquidityBalance: number;
    cardDebt: number;
    netWorth: number;
    /** Long-term holdings market value. */
    investedTotal: number;
    /** Short-horizon / cash-like holdings. */
    cashLikeHoldings: number;
    /** Net income as a fraction of income this month, or null if no income. */
    savingsRate: number | null;
  };
}

function localDate(iso: string): Date {
  return new Date(iso);
}

/**
 * Compute the full finance snapshot from the store state.
 *
 * @param recentLimit how many recent entries to include (default 15).
 */
export function buildFinanceContext(
  state: AppState,
  toDisplay: (amount: number, from?: string) => number,
  currency: string,
  locale: string,
  recentLimit = 15,
): FinanceContext {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Expand recurring/installment entries up to now so summaries match the rest
  // of the app (Planning/Dashboard use the same helpers).
  const expanded = expandCashflows(state.cashflows, now);
  const values = valuesByEntry(expanded, toDisplay);

  // ---- Recent activity (raw entries, newest first) ----
  const recent: ContextTransaction[] = [...state.cashflows]
    .sort((a, b) => localDate(b.date).getTime() - localDate(a.date).getTime())
    .slice(0, recentLimit)
    .map((e) => ({
      id: e.id,
      date: e.date.slice(0, 10),
      kind: e.kind,
      category: e.category || e.source || "—",
      amountDisplay: toDisplay(e.amount, e.currency),
      description: e.description,
    }));

  // ---- This month's summary ----
  let totalIncome = 0;
  let totalExpense = 0;
  const byCat = new Map<string, number>();
  for (const e of expanded) {
    const d = localDate(e.date);
    if (!isWithinInterval(d, { start: monthStart, end: monthEnd })) continue;
    const v = values.get(e.id) ?? 0;
    if (e.kind === "income") totalIncome += v;
    else if (e.kind === "expense") {
      totalExpense += v;
      const key = e.category || "Other";
      byCat.set(key, (byCat.get(key) ?? 0) + v);
    }
  }
  const topExpenseCategories = [...byCat.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  // ---- Main budget plan status ----
  const plans = state.budgetPlans ?? [];
  const mainPlan = plans.find((p) => p.id === state.mainBudgetPlanId) ?? plans[0];
  let budget: FinanceContext["budget"];
  if (mainPlan) {
    const nameToId = new Map<string, string>();
    for (const c of state.categories) {
      if (c.kind === "expense") nameToId.set(c.name.trim().toLowerCase(), c.id);
    }
    // Spend per category id for the current month.
    const spentByCatId = new Map<string, number>();
    for (const e of expanded) {
      if (e.kind !== "expense") continue;
      const d = localDate(e.date);
      if (!isWithinInterval(d, { start: monthStart, end: monthEnd })) continue;
      const catId = nameToId.get((e.category || "").trim().toLowerCase());
      if (!catId) continue;
      spentByCatId.set(catId, (spentByCatId.get(catId) ?? 0) + (values.get(e.id) ?? 0));
    }
    const catNameById = new Map(state.categories.map((c) => [c.id, c.name]));
    const lines: BudgetLineStatus[] = mainPlan.items.map((it) => {
      const limit = toDisplay(it.amount, it.currency);
      const spent = it.categoryId ? (spentByCatId.get(it.categoryId) ?? 0) : 0;
      return {
        label: it.label || (it.categoryId ? (catNameById.get(it.categoryId) ?? "") : ""),
        categoryName: it.categoryId ? catNameById.get(it.categoryId) : undefined,
        limit,
        spent,
      };
    });
    budget = {
      planName: mainPlan.name,
      totalLimit: lines.reduce((s, l) => s + l.limit, 0),
      totalSpent: lines.reduce((s, l) => s + l.spent, 0),
      lines,
    };
  }

  const goals = (state.goals ?? []).map((g) => ({
    name: g.name,
    target: toDisplay(g.targetAmount, g.currency),
    current: toDisplay(g.currentAmount, g.currency),
  }));

  // ---- Wealth snapshot (holdings + liquidity + debt) ----
  let portfolioTotal = 0;
  let investedTotal = 0;
  let cashLikeHoldings = 0;
  for (const h of state.holdings) {
    const v = toDisplay(h.quantity * h.currentPrice, h.priceCurrency);
    portfolioTotal += v;
    if (h.horizon === "short") cashLikeHoldings += v;
    else investedTotal += v;
  }

  let liquidityBalance = 0;
  let cardDebt = 0;
  const cards = state.creditCards ?? [];
  for (const e of expanded) {
    const v = values.get(e.id) ?? 0;
    liquidityBalance += liquidityImpact(e, v);
    for (const c of cards) cardDebt += cardDebtImpact(e, c.id, v);
  }

  const netWorth = portfolioTotal + liquidityBalance - cardDebt;
  const savingsRate =
    totalIncome > 0 ? (totalIncome - totalExpense) / totalIncome : null;

  return {
    currency,
    locale,
    today: now.toISOString().slice(0, 10),
    categories: state.categories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      group: c.group,
    })),
    expenseCategoryNames: state.categories.filter((c) => c.kind === "expense").map((c) => c.name),
    recent,
    month: {
      label: now.toLocaleDateString(locale, { month: "long", year: "numeric" }),
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      topExpenseCategories,
    },
    budget,
    goals,
    wealth: {
      portfolioTotal,
      liquidityBalance,
      cardDebt,
      netWorth,
      investedTotal,
      cashLikeHoldings,
      savingsRate,
    },
  };
}

/** Render the context as a compact prompt block for the LLM. Kept terse to save
 *  tokens on small models. */
export function formatContextForPrompt(ctx: FinanceContext): string {
  const m = (n: number) => formatMoney(n, ctx.currency);
  const lines: string[] = [];
  lines.push(`Today: ${ctx.today}. Currency: ${ctx.currency}.`);
  lines.push(`Expense categories: ${ctx.expenseCategoryNames.join(", ") || "(none)"}.`);
  lines.push(
    `This month (${ctx.month.label}): income ${m(ctx.month.totalIncome)}, ` +
      `expenses ${m(ctx.month.totalExpense)}, net ${m(ctx.month.net)}.`,
  );
  if (ctx.month.topExpenseCategories.length) {
    lines.push(
      "Top spending: " +
        ctx.month.topExpenseCategories.map((c) => `${c.name} ${m(c.amount)}`).join(", ") +
        ".",
    );
  }
  if (ctx.budget) {
    lines.push(
      `Budget "${ctx.budget.planName}": spent ${m(ctx.budget.totalSpent)} of ` +
        `${m(ctx.budget.totalLimit)}.`,
    );
  }
  const w = ctx.wealth;
  lines.push(
    `Wealth: net worth ${m(w.netWorth)}, portfolio ${m(w.portfolioTotal)} ` +
      `(invested ${m(w.investedTotal)}, cash-like holdings ${m(w.cashLikeHoldings)}), ` +
      `liquidity ${m(w.liquidityBalance)}, card debt ${m(w.cardDebt)}.`,
  );
  if (w.savingsRate != null) {
    lines.push(`Savings rate this month: ${Math.round(w.savingsRate * 100)}%.`);
  }
  if (ctx.goals.length) {
    lines.push(
      "Goals: " +
        ctx.goals
          .map((g) => `${g.name} ${m(g.current)}/${m(g.target)}`)
          .join(", ") +
        ".",
    );
  }
  if (ctx.recent.length) {
    lines.push("Recent entries:");
    for (const r of ctx.recent.slice(0, 10)) {
      lines.push(
        `- ${r.date} ${r.kind} ${r.category} ${m(r.amountDisplay)}` +
          (r.description ? ` (${r.description})` : ""),
      );
    }
  }
  return lines.join("\n");
}
