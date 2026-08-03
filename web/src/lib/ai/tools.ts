/**
 * Tool definitions for the local LLM and their executors.
 *
 * Read tools (`get_*`) run against the live store and feed results back to the
 * model. The write tool (`add_transaction` / `update_transaction`) is resolved
 * into a {@link ProposedExpense} and surfaced to the user for confirmation
 * before anything is written (confirm-first policy).
 */

import type { AppState, CashflowEntry, Category } from "@/lib/types";
import { expandCashflows, valuesByEntry } from "@/routes/cashflow";
import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n-t";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
  isWithinInterval,
} from "date-fns";
import type { ProposedExpense, ToolSpec, ToolCall } from "./types";

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "add_transaction",
    kind: "write",
    description:
      "Record an expense the user described. Call when the user mentions spending money.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount spent, positive number." },
        category: {
          type: "string",
          description: "Best-matching expense category name.",
        },
        description: {
          type: "string",
          description: "Merchant or short note, e.g. 'coffee at Starbucks'.",
        },
        date: {
          type: "string",
          description: "ISO date (YYYY-MM-DD). Defaults to today.",
        },
        currency: {
          type: "string",
          description: "ISO currency code, e.g. USD. Defaults to display currency.",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "get_spending_summary",
    kind: "read",
    description: "Return total spending and top categories for a period.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "Time window.",
          enum: ["this_month", "last_month", "this_week", "all"],
        },
        category: {
          type: "string",
          description: "Optional: restrict to a single expense category name.",
        },
      },
    },
  },
  {
    name: "get_recent_transactions",
    kind: "read",
    description: "List the most recent transactions.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many to return (default 10)." },
      },
    },
  },
  {
    name: "get_budget_status",
    kind: "read",
    description: "Return the main budget plan with limits and how much is spent so far.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_transaction",
    kind: "write",
    description: "Correct the most recent matching expense (amount/category/description).",
    parameters: {
      type: "object",
      properties: {
        match: {
          type: "string",
          description: "Text identifying which entry to fix (merchant/category).",
        },
        amount: { type: "number", description: "New amount." },
        category: { type: "string", description: "New category name." },
        description: { type: "string", description: "New description." },
      },
    },
  },
];

export type Period = "this_month" | "last_month" | "this_week" | "all";

function periodWindow(period: Period): { start: Date; end: Date } | null {
  const now = new Date();
  switch (period) {
    case "this_month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    case "this_week":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case "all":
      return null;
  }
}

/** Fuzzy-match a free-text category to an existing expense category. Returns the
 *  category (name is what cashflow entries store) or undefined. */
export function matchExpenseCategory(
  text: string | undefined,
  categories: Category[],
): Category | undefined {
  const expense = categories.filter((c) => c.kind === "expense");
  if (!text) return undefined;
  const q = text.trim().toLowerCase();
  if (!q) return undefined;
  // Exact, then contains either direction.
  return (
    expense.find((c) => c.name.toLowerCase() === q) ||
    expense.find((c) => c.name.toLowerCase().includes(q)) ||
    expense.find((c) => q.includes(c.name.toLowerCase())) ||
    // A few common synonyms mapped onto default categories.
    matchBySynonym(q, expense)
  );
}

const SYNONYMS: Record<string, string[]> = {
  food: [
    "groceries",
    "grocery",
    "restaurant",
    "lunch",
    "dinner",
    "coffee",
    "snack",
    "meal",
    "eat",
    "walmart",
    "supermarket",
  ],
  transport: ["gas", "fuel", "uber", "taxi", "bus", "train", "metro", "parking", "car"],
  entertainment: ["movie", "netflix", "game", "concert", "spotify", "subscription", "fun"],
  rent: ["rent", "mortgage", "housing", "apartment"],
};

function matchBySynonym(q: string, expense: Category[]): Category | undefined {
  for (const [catName, words] of Object.entries(SYNONYMS)) {
    if (words.some((w) => q.includes(w))) {
      const hit = expense.find((c) => c.name.toLowerCase() === catName);
      if (hit) return hit;
    }
  }
  return undefined;
}

export interface ToolDeps {
  state: AppState;
  toDisplay: (amount: number, from?: string) => number;
  currency: string;
  locale: string;
  /** Whether the user has already seen the financial-advice disclaimer. */
  adviceDisclaimerSeen?: boolean;
  /** Persist disclaimer acknowledgement (first advice only). */
  markAdviceDisclaimerSeen?: () => void;
}

export interface ToolRunResult {
  /** Compact human/LLM-readable summary of the result. */
  summary: string;
  data: unknown;
}

/** Resolve `add_transaction` arguments into a confirmable proposal. Does NOT
 *  write to the store. */
export function resolveExpenseProposal(
  args: Record<string, unknown>,
  deps: ToolDeps,
): { proposal?: ProposedExpense; error?: string } {
  const amount = Number(args.amount);
  if (!isFinite(amount) || amount <= 0) {
    return { error: "no-amount" };
  }
  const cat = matchExpenseCategory(
    typeof args.category === "string" ? args.category : undefined,
    deps.state.categories,
  );
  // Fall back to the first expense category or "Other" so we always have a slot.
  const fallback = deps.state.categories.find((c) => c.kind === "expense");
  const categoryName = cat?.name ?? fallback?.name ?? "Other";
  const currency =
    typeof args.currency === "string" && args.currency.trim()
      ? args.currency.trim().toUpperCase()
      : deps.currency;
  const dateStr =
    typeof args.date === "string" && args.date.trim()
      ? args.date.trim()
      : new Date().toISOString().slice(0, 10);
  const iso = new Date(`${dateStr}T12:00:00`);
  return {
    proposal: {
      amount,
      currency,
      categoryName,
      categoryId: cat?.id,
      description: typeof args.description === "string" ? args.description.trim() : undefined,
      date: (isNaN(iso.getTime()) ? new Date() : iso).toISOString(),
      paymentMethod: "liquidity",
    },
  };
}

/** Convert a confirmed proposal into the payload for `addCashflow`. */
export function proposalToCashflow(p: ProposedExpense): Omit<CashflowEntry, "id"> {
  return {
    kind: "expense",
    source: "",
    category: p.categoryName,
    amount: p.amount,
    currency: p.currency,
    date: p.date,
    amountKind: "fixed",
    description: p.description || undefined,
    paymentMethod: (p.paymentMethod as CashflowEntry["paymentMethod"]) || "liquidity",
  };
}

/** Execute a read tool and return a summary + structured data. */
export function runReadTool(call: ToolCall, deps: ToolDeps): ToolRunResult {
  const m = (n: number) => formatMoney(n, deps.currency);
  const periodLabel = (period: Period) =>
    t(`assistant.backend.periods.${period}` as "assistant.backend.periods.this_month");
  const now = new Date();
  const expanded = expandCashflows(deps.state.cashflows, now);
  const values = valuesByEntry(expanded, deps.toDisplay);

  switch (call.name) {
    case "get_spending_summary": {
      const period = (call.arguments.period as Period) || "this_month";
      const win = periodWindow(period);
      const catFilter =
        typeof call.arguments.category === "string"
          ? matchExpenseCategory(call.arguments.category, deps.state.categories)
          : undefined;
      let total = 0;
      const byCat = new Map<string, number>();
      for (const e of expanded) {
        if (e.kind !== "expense") continue;
        if (win && !isWithinInterval(new Date(e.date), win)) continue;
        if (catFilter && (e.category || "").toLowerCase() !== catFilter.name.toLowerCase())
          continue;
        const v = values.get(e.id) ?? 0;
        total += v;
        byCat.set(e.category || "Other", (byCat.get(e.category || "Other") ?? 0) + v);
      }
      const top = [...byCat.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      const summary = catFilter
        ? t("assistant.backend.tools.spentCategory", {
            total: m(total),
            category: catFilter.name,
            period: periodLabel(period),
          })
        : t("assistant.backend.tools.spentTotal", {
            total: m(total),
            period: periodLabel(period),
            top: top.map((row) => `${row.name} ${m(row.amount)}`).join(", ") || "—",
          });
      return { summary, data: { period, total, top, category: catFilter?.name } };
    }

    case "get_recent_transactions": {
      const limit = Math.max(1, Math.min(50, Number(call.arguments.limit) || 10));
      const items = [...deps.state.cashflows]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit)
        .map((e) => ({
          date: e.date.slice(0, 10),
          kind: e.kind,
          category: e.category || e.source || "—",
          amount: deps.toDisplay(e.amount, e.currency),
          description: e.description,
        }));
      const summary = items.length
        ? items
            .map((i) =>
              t("assistant.backend.tools.txLine", {
                date: i.date,
                kind: i.kind,
                category: i.category,
                amount: m(i.amount),
              }),
            )
            .join("; ")
        : t("assistant.backend.tools.noTransactions");
      return { summary, data: items };
    }

    case "get_budget_status": {
      const plans = deps.state.budgetPlans ?? [];
      const plan = plans.find((p) => p.id === deps.state.mainBudgetPlanId) ?? plans[0];
      if (!plan) return { summary: t("assistant.backend.tools.noBudget"), data: null };
      const nameToId = new Map<string, string>();
      for (const c of deps.state.categories) {
        if (c.kind === "expense") nameToId.set(c.name.trim().toLowerCase(), c.id);
      }
      const win = periodWindow("this_month")!;
      const spentByCatId = new Map<string, number>();
      for (const e of expanded) {
        if (e.kind !== "expense") continue;
        if (!isWithinInterval(new Date(e.date), win)) continue;
        const catId = nameToId.get((e.category || "").trim().toLowerCase());
        if (!catId) continue;
        spentByCatId.set(catId, (spentByCatId.get(catId) ?? 0) + (values.get(e.id) ?? 0));
      }
      const catNameById = new Map(deps.state.categories.map((c) => [c.id, c.name]));
      const lines = plan.items.map((it) => {
        const limit = deps.toDisplay(it.amount, it.currency);
        const spent = it.categoryId ? (spentByCatId.get(it.categoryId) ?? 0) : 0;
        return {
          label: it.label || (it.categoryId ? catNameById.get(it.categoryId) : ""),
          limit,
          spent,
          remaining: limit - spent,
        };
      });
      const totalLimit = lines.reduce((s, l) => s + l.limit, 0);
      const totalSpent = lines.reduce((s, l) => s + l.spent, 0);
      const over = lines.filter((l) => l.spent > l.limit && l.limit > 0);
      const summary =
        t("assistant.backend.tools.budgetStatus", {
          name: plan.name,
          spent: m(totalSpent),
          limit: m(totalLimit),
        }) +
        (over.length
          ? t("assistant.backend.tools.overOn", { list: over.map((l) => l.label).join(", ") })
          : t("assistant.backend.tools.onTrack"));
      return { summary, data: { planName: plan.name, totalLimit, totalSpent, lines } };
    }

    default:
      return { summary: t("assistant.backend.tools.unknownTool"), data: null };
  }
}
