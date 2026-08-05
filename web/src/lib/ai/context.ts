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
import {
  expandCashflows,
  valuesByEntry,
  liquidityImpact,
  cardDebtImpact,
} from "@/routes/cashflow";
import { formatMoney } from "@/lib/format";
import { startOfMonth, endOfMonth, isWithinInterval, startOfYear } from "date-fns";

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
  /** Calendar year-to-date (Jan 1 → today). */
  year: {
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
  goals: { name: string; target: number; current: number; targetDate?: string }[];
  holdings: {
    symbol: string;
    name: string;
    type: string;
    horizon: string;
    value: number;
    quantity: number;
  }[];
  loans: {
    name: string;
    principal: number;
    apr: number;
    termMonths: number;
    extraMonthly: number;
  }[];
  creditCards: { name: string; limit: number }[];
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
  recentLimit = 40,
): FinanceContext {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const yearStart = startOfYear(now);

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

  const summarizeWindow = (start: Date, end: Date) => {
    let totalIncome = 0;
    let totalExpense = 0;
    const byCat = new Map<string, number>();
    for (const e of expanded) {
      const d = localDate(e.date);
      if (!isWithinInterval(d, { start, end })) continue;
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
      .slice(0, 8);
    return { totalIncome, totalExpense, net: totalIncome - totalExpense, topExpenseCategories };
  };

  const monthStats = summarizeWindow(monthStart, monthEnd);
  const yearStats = summarizeWindow(yearStart, now);

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
    targetDate: g.targetDate,
  }));

  // ---- Wealth snapshot (holdings + liquidity + debt) ----
  let portfolioTotal = 0;
  let investedTotal = 0;
  let cashLikeHoldings = 0;
  const holdings = state.holdings.map((h) => {
    const v = toDisplay(h.quantity * h.currentPrice, h.priceCurrency);
    portfolioTotal += v;
    if (h.horizon === "short") cashLikeHoldings += v;
    else investedTotal += v;
    return {
      symbol: h.symbol,
      name: h.name,
      type: h.type,
      horizon: h.horizon ?? "long",
      value: v,
      quantity: h.quantity,
    };
  });
  holdings.sort((a, b) => b.value - a.value);

  let liquidityBalance = 0;
  let cardDebt = 0;
  const cards = state.creditCards ?? [];
  for (const e of expanded) {
    const v = values.get(e.id) ?? 0;
    liquidityBalance += liquidityImpact(e, v);
    for (const c of cards) cardDebt += cardDebtImpact(e, c.id, v);
  }

  const creditCards = cards.map((c) => ({
    name: c.name,
    limit: toDisplay(c.creditLimit ?? 0, c.currency),
  }));

  const loans = (state.loans ?? []).map((l) => ({
    name: l.name,
    principal: toDisplay(l.principal, l.currency),
    apr: l.apr,
    termMonths: l.termMonths,
    extraMonthly: toDisplay(l.extraMonthly ?? 0, l.currency),
  }));

  const netWorth = portfolioTotal + liquidityBalance - cardDebt;
  const savingsRate =
    monthStats.totalIncome > 0
      ? (monthStats.totalIncome - monthStats.totalExpense) / monthStats.totalIncome
      : null;

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
      ...monthStats,
    },
    year: {
      label: String(now.getFullYear()),
      ...yearStats,
    },
    budget,
    goals,
    holdings,
    loans,
    creditCards,
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
      "Top spending this month: " +
        ctx.month.topExpenseCategories.map((c) => `${c.name} ${m(c.amount)}`).join(", ") +
        ".",
    );
  }
  lines.push(
    `Year to date (${ctx.year.label}): income ${m(ctx.year.totalIncome)}, ` +
      `expenses ${m(ctx.year.totalExpense)}, net ${m(ctx.year.net)}.`,
  );
  if (ctx.year.topExpenseCategories.length) {
    lines.push(
      "Top spending YTD: " +
        ctx.year.topExpenseCategories.map((c) => `${c.name} ${m(c.amount)}`).join(", ") +
        ".",
    );
  }
  lines.push(
    "You have full on-device access to cashflows, holdings, budgets, goals, loans, and cards. " +
      "Use tools (get_net_worth, get_portfolio, get_spending_summary, get_budget_status, get_goals_status, get_loans_status) when helpful.",
  );
  if (ctx.budget) {
    lines.push(
      `Budget "${ctx.budget.planName}": spent ${m(ctx.budget.totalSpent)} of ` +
        `${m(ctx.budget.totalLimit)}.`,
    );
    const tight = ctx.budget.lines
      .filter((l) => l.limit > 0)
      .map((l) => ({ ...l, pct: l.spent / l.limit }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
    if (tight.length) {
      lines.push(
        "Budget lines: " +
          tight
            .map((l) => `${l.label} ${m(l.spent)}/${m(l.limit)}`)
            .join(", ") +
          ".",
      );
    }
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
  if (ctx.holdings.length) {
    lines.push(
      "Holdings: " +
        ctx.holdings
          .slice(0, 12)
          .map((h) => `${h.symbol} (${h.type}, ${h.horizon}) ${m(h.value)}`)
          .join(", ") +
        (ctx.holdings.length > 12 ? "…" : "") +
        ".",
    );
  }
  if (ctx.creditCards.length) {
    lines.push(
      "Credit cards: " +
        ctx.creditCards.map((c) => `${c.name} limit ${m(c.limit)}`).join(", ") +
        ".",
    );
  }
  if (ctx.loans.length) {
    lines.push(
      "Loans: " +
        ctx.loans
          .map(
            (l) =>
              `${l.name} principal ${m(l.principal)} @ ${l.apr}% / ${l.termMonths}mo` +
              (l.extraMonthly > 0 ? ` (+${m(l.extraMonthly)}/mo extra)` : ""),
          )
          .join(", ") +
        ".",
    );
  }
  if (ctx.goals.length) {
    lines.push(
      "Goals: " +
        ctx.goals
          .map(
            (g) =>
              `${g.name} ${m(g.current)}/${m(g.target)}` +
              (g.targetDate ? ` by ${g.targetDate.slice(0, 10)}` : ""),
          )
          .join(", ") +
        ".",
    );
  }
  if (ctx.recent.length) {
    lines.push("Recent entries:");
    for (const r of ctx.recent.slice(0, 12)) {
      lines.push(
        `- ${r.date} ${r.kind} ${r.category} ${m(r.amountDisplay)}` +
          (r.description ? ` (${r.description})` : ""),
      );
    }
  }
  return lines.join("\n");
}
