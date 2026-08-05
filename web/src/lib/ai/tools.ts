/**
 * Tool definitions for the local LLM and their executors.
 *
 * Read tools (`get_*`) run against the live store and feed results back to the
 * model. The write tool (`add_transaction` / `update_transaction`) is resolved
 * into a {@link ProposedExpense} and surfaced to the user for confirmation
 * before anything is written (confirm-first policy).
 */

import type {
  AppState,
  BudgetItem,
  CashflowEntry,
  Category,
  Holding,
  Loan,
  SavingsGoal,
} from "@/lib/types";
import { expandCashflows, valuesByEntry } from "@/routes/cashflow";
import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n-t";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfYear,
  subMonths,
  isWithinInterval,
} from "date-fns";
import type { ProposedChange, ToolSpec, ToolCall } from "./types";
import { buildFinanceContext } from "./context";

type ProposedExpense = {
  amount: number;
  currency: string;
  categoryName: string;
  categoryId?: string;
  description?: string;
  date: string;
  paymentMethod?: string;
};

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
    name: "delete_transaction",
    kind: "write",
    description: "Delete one matching transaction.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Text that identifies the row (date/category/description)." },
      },
      required: ["match"],
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
          description: "Time window. Use this_year/ytd for calendar year-to-date, all for full history.",
          enum: ["this_month", "last_month", "this_week", "this_year", "ytd", "all"],
        },
        category: {
          type: "string",
          description: "Optional: restrict to a single expense category name.",
        },
      },
    },
  },
  {
    name: "find_transactions",
    kind: "read",
    description: "Find transactions by fuzzy text and return candidate ids.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Date/category/description text." },
        limit: { type: "number", description: "Max matches to return." },
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
    name: "create_budget",
    kind: "write",
    description: "Create a budget plan with line items.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Budget plan name." },
        items: { type: "string", description: "JSON array of budget items with label, amount, optional category." },
      },
      required: ["name"],
    },
  },
  {
    name: "update_budget_item",
    kind: "write",
    description: "Update one budget line item in the main plan.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Item label to find." },
        amount: { type: "number", description: "New amount." },
        label: { type: "string", description: "New label." },
      },
      required: ["match"],
    },
  },
  {
    name: "add_goal",
    kind: "write",
    description: "Create a savings goal.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Goal name." },
        targetAmount: { type: "number", description: "Target amount." },
        currentAmount: { type: "number", description: "Current saved amount." },
        targetDate: { type: "string", description: "Optional ISO date." },
      },
      required: ["name", "targetAmount"],
    },
  },
  {
    name: "update_goal",
    kind: "write",
    description: "Update one savings goal.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Goal name to match." },
        targetAmount: { type: "number", description: "New target amount." },
        currentAmount: { type: "number", description: "New current amount." },
      },
      required: ["match"],
    },
  },
  {
    name: "add_loan",
    kind: "write",
    description: "Create a loan entry.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Loan name." },
        principal: { type: "number", description: "Principal amount." },
        apr: { type: "number", description: "Annual percentage rate." },
        termMonths: { type: "number", description: "Term in months." },
        startDate: { type: "string", description: "ISO date." },
      },
      required: ["name", "principal", "apr", "termMonths"],
    },
  },
  {
    name: "add_holding",
    kind: "write",
    description: "Create a holding.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker/symbol." },
        name: { type: "string", description: "Holding name." },
        type: { type: "string", description: "Asset type." },
        quantity: { type: "number", description: "Quantity." },
        currentPrice: { type: "number", description: "Current price." },
      },
      required: ["symbol", "name", "type", "quantity", "currentPrice"],
    },
  },
  {
    name: "update_holding",
    kind: "write",
    description: "Update one holding.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Holding symbol or name." },
        quantity: { type: "number", description: "New quantity." },
        currentPrice: { type: "number", description: "New price." },
      },
      required: ["match"],
    },
  },
  {
    name: "add_category",
    kind: "write",
    description: "Create a category.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Category name." },
        kind: { type: "string", description: "expense or income." },
      },
      required: ["name", "kind"],
    },
  },
  {
    name: "get_budget_status",
    kind: "read",
    description: "Return the main budget plan with limits and how much is spent so far.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_net_worth",
    kind: "read",
    description:
      "Return net worth breakdown: portfolio, invested vs cash-like holdings, liquidity, card debt, savings rate.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_portfolio",
    kind: "read",
    description: "List holdings with symbol, type, horizon, and current market value.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_goals_status",
    kind: "read",
    description: "Return savings goals with progress toward targets.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_loans_status",
    kind: "read",
    description: "Return loans with principal, APR, term, and optional extra payments.",
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

export type Period =
  | "this_month"
  | "last_month"
  | "this_week"
  | "this_year"
  | "ytd"
  | "all";

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
    case "this_year":
    case "ytd":
      return { start: startOfYear(now), end: now };
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

export interface ApplyStore {
  addCashflow: (c: Omit<CashflowEntry, "id">) => void;
  updateCashflow: (id: string, patch: Partial<CashflowEntry>) => void;
  removeCashflow: (id: string) => void;
  addBudgetPlan: (name: string) => { id: string };
  addBudgetItem: (planId: string, item: Omit<BudgetItem, "id">) => void;
  updateBudgetItem: (planId: string, itemId: string, patch: Partial<BudgetItem>) => void;
  addGoal: (g: Omit<SavingsGoal, "id">) => void;
  updateGoal: (id: string, patch: Partial<SavingsGoal>) => void;
  addLoan: (l: Omit<Loan, "id">) => void;
  addHolding: (h: Omit<Holding, "id">) => void;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  addCategory: (c: Omit<Category, "id">) => void;
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

function parseJsonItems(v: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(v)) return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed)
        ? parsed.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function findCashflow(state: AppState, match: string): CashflowEntry | undefined {
  const q = match.trim().toLowerCase();
  return [...state.cashflows]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .find(
      (e) =>
        (e.description || "").toLowerCase().includes(q) ||
        (e.category || "").toLowerCase().includes(q) ||
        e.date.slice(0, 10).includes(q),
    );
}

export function resolveWriteTool(
  call: ToolCall,
  deps: ToolDeps,
): { change?: ProposedChange; error?: string } {
  if (call.name === "add_transaction") {
    const { proposal, error } = resolveExpenseProposal(call.arguments, deps);
    if (error || !proposal) return { error: error || "invalid-transaction" };
    const payload = proposalToCashflow(proposal);
    return {
      change: {
        actions: [{ kind: "cashflow.add", payload }],
        preview: [
          {
            label: "Transaction",
            after: `${payload.kind} ${formatMoney(payload.amount, payload.currency || deps.currency)} · ${payload.category || "Other"}`,
          },
        ],
        summary: t("assistant.backend.expenseConfirm", {
          amount: formatMoney(payload.amount, payload.currency || deps.currency),
          category: payload.category || "Other",
          when: new Date(payload.date).toLocaleDateString(deps.locale),
        }),
      },
    };
  }
  if (call.name === "update_transaction") {
    const match = typeof call.arguments.match === "string" ? call.arguments.match : "";
    if (!match.trim()) return { error: "missing-match" };
    const entry = findCashflow(deps.state, match);
    if (!entry) return { error: "not-found" };
    const patch: Partial<CashflowEntry> = {};
    if (typeof call.arguments.amount === "number" && isFinite(call.arguments.amount)) patch.amount = Math.abs(call.arguments.amount);
    if (typeof call.arguments.description === "string") patch.description = call.arguments.description.trim();
    if (typeof call.arguments.category === "string") {
      const cat = matchExpenseCategory(call.arguments.category, deps.state.categories);
      patch.category = cat?.name || call.arguments.category.trim();
    }
    if (!Object.keys(patch).length) return { error: "empty-patch" };
    return {
      change: {
        actions: [{ kind: "cashflow.update", id: entry.id, patch: patch as Record<string, unknown> }],
        preview: [{ label: "Transaction update", before: `${entry.category} ${formatMoney(entry.amount, entry.currency || deps.currency)}`, after: `${patch.category || entry.category} ${formatMoney(patch.amount ?? entry.amount, entry.currency || deps.currency)}` }],
        summary: t("assistant.backend.done"),
      },
    };
  }
  if (call.name === "delete_transaction") {
    const match = typeof call.arguments.match === "string" ? call.arguments.match : "";
    const entry = match ? findCashflow(deps.state, match) : undefined;
    if (!entry) return { error: "not-found" };
    return {
      change: {
        actions: [{ kind: "cashflow.delete", id: entry.id }],
        preview: [{ label: "Delete transaction", before: `${entry.category || entry.description || "Transaction"} ${formatMoney(entry.amount, entry.currency || deps.currency)}`, after: "Deleted" }],
        summary: "Transaction will be deleted after confirmation.",
      },
    };
  }
  if (call.name === "create_budget") {
    const name = typeof call.arguments.name === "string" ? call.arguments.name.trim() : "";
    if (!name) return { error: "missing-name" };
    const itemsRaw = parseJsonItems(call.arguments.items);
    const items = itemsRaw
      .map((it) => {
        const categoryName = typeof it.category === "string" ? it.category : undefined;
        return {
          label: typeof it.label === "string" ? it.label.trim() : "",
          amount: Number(it.amount),
          categoryName,
          categoryId: categoryName
            ? deps.state.categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase())?.id
            : undefined,
        };
      })
      .filter((it) => it.label && isFinite(it.amount) && it.amount > 0);
    return {
      change: {
        actions: [{ kind: "budgetPlan.create", name, items }],
        preview: items.map((it) => ({ label: it.label, after: formatMoney(it.amount, deps.currency) })),
        summary: `Create budget "${name}" with ${items.length} item(s).`,
      },
    };
  }
  if (call.name === "update_budget_item") {
    const plan = deps.state.budgetPlans.find((p) => p.id === deps.state.mainBudgetPlanId) || deps.state.budgetPlans[0];
    if (!plan) return { error: "no-plan" };
    const match = typeof call.arguments.match === "string" ? call.arguments.match.toLowerCase() : "";
    const item = plan.items.find((x) => x.label.toLowerCase().includes(match));
    if (!item) return { error: "item-not-found" };
    const patch: Record<string, unknown> = {};
    if (typeof call.arguments.label === "string" && call.arguments.label.trim()) patch.label = call.arguments.label.trim();
    if (typeof call.arguments.amount === "number" && isFinite(call.arguments.amount)) patch.amount = Math.abs(call.arguments.amount);
    if (!Object.keys(patch).length) return { error: "empty-patch" };
    return {
      change: {
        actions: [{ kind: "budgetItem.upsert", planId: plan.id, itemId: item.id, item: patch }],
        preview: [{ label: item.label, before: formatMoney(item.amount, item.currency || deps.currency), after: formatMoney(Number(patch.amount ?? item.amount), item.currency || deps.currency) }],
        summary: "Budget item update ready.",
      },
    };
  }
  return { error: "unsupported-write-tool" };
}

export function applyProposedChange(change: ProposedChange, store: ApplyStore): void {
  for (const action of change.actions) {
    switch (action.kind) {
      case "cashflow.add":
        store.addCashflow(action.payload as Omit<CashflowEntry, "id">);
        break;
      case "cashflow.update":
        store.updateCashflow(action.id, action.patch as Partial<CashflowEntry>);
        break;
      case "cashflow.delete":
        store.removeCashflow(action.id);
        break;
      case "budgetPlan.create": {
        const created = store.addBudgetPlan(action.name);
        for (const it of action.items) {
          store.addBudgetItem(created.id, it as Omit<BudgetItem, "id">);
        }
        break;
      }
      case "budgetItem.upsert":
        if (action.itemId) store.updateBudgetItem(action.planId, action.itemId, action.item as Partial<BudgetItem>);
        else store.addBudgetItem(action.planId, action.item as Omit<BudgetItem, "id">);
        break;
      case "goal.add":
        store.addGoal(action.payload as Omit<SavingsGoal, "id">);
        break;
      case "goal.update":
        store.updateGoal(action.id, action.patch as Partial<SavingsGoal>);
        break;
      case "loan.add":
        store.addLoan(action.payload as Omit<Loan, "id">);
        break;
      case "holding.add":
        store.addHolding(action.payload as Omit<Holding, "id">);
        break;
      case "holding.update":
        store.updateHolding(action.id, action.patch as Partial<Holding>);
        break;
      case "category.add":
        store.addCategory(action.payload as Omit<Category, "id">);
        break;
    }
  }
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

    case "find_transactions": {
      const q = String(call.arguments.match || "").trim().toLowerCase();
      const limit = Math.max(1, Math.min(20, Number(call.arguments.limit) || 5));
      const matches = [...deps.state.cashflows]
        .filter(
          (e) =>
            !q ||
            (e.description || "").toLowerCase().includes(q) ||
            (e.category || "").toLowerCase().includes(q) ||
            e.date.slice(0, 10).includes(q),
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit)
        .map((e) => ({
          id: e.id,
          date: e.date.slice(0, 10),
          category: e.category || "Other",
          amount: deps.toDisplay(e.amount, e.currency),
          description: e.description || "",
        }));
      return {
        summary: matches.length
          ? matches.map((m) => `${m.id}: ${m.date} ${m.category} ${m.amount}`).join("; ")
          : t("assistant.backend.tools.noTransactions"),
        data: matches,
      };
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

    case "get_net_worth": {
      const ctx = buildFinanceContext(deps.state, deps.toDisplay, deps.currency, deps.locale);
      const w = ctx.wealth;
      const rate =
        w.savingsRate != null
          ? t("assistant.backend.tools.savingsRate", { rate: Math.round(w.savingsRate * 100) })
          : "";
      const summary = t("assistant.backend.tools.netWorth", {
        netWorth: m(w.netWorth),
        portfolio: m(w.portfolioTotal),
        invested: m(w.investedTotal),
        cashLike: m(w.cashLikeHoldings),
        liquidity: m(w.liquidityBalance),
        debt: m(w.cardDebt),
        savingsRate: rate,
      });
      return { summary, data: w };
    }

    case "get_portfolio": {
      const ctx = buildFinanceContext(deps.state, deps.toDisplay, deps.currency, deps.locale);
      if (!ctx.holdings.length) {
        return { summary: t("assistant.backend.tools.noHoldings"), data: [] };
      }
      const lines = ctx.holdings
        .slice(0, 20)
        .map((h) =>
          t("assistant.backend.tools.holdingLine", {
            symbol: h.symbol,
            name: h.name,
            type: h.type,
            horizon: h.horizon,
            value: m(h.value),
          }),
        )
        .join("; ");
      const summary = t("assistant.backend.tools.portfolio", {
        total: m(ctx.wealth.portfolioTotal),
        lines,
      });
      return { summary, data: ctx.holdings };
    }

    case "get_goals_status": {
      const ctx = buildFinanceContext(deps.state, deps.toDisplay, deps.currency, deps.locale);
      if (!ctx.goals.length) {
        return { summary: t("assistant.backend.tools.noGoals"), data: [] };
      }
      const lines = ctx.goals
        .map((g) => {
          const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
          return t("assistant.backend.tools.goalLine", {
            name: g.name,
            current: m(g.current),
            target: m(g.target),
            pct,
          });
        })
        .join("; ");
      return { summary: lines, data: ctx.goals };
    }

    case "get_loans_status": {
      const ctx = buildFinanceContext(deps.state, deps.toDisplay, deps.currency, deps.locale);
      if (!ctx.loans.length) {
        return { summary: t("assistant.backend.tools.noLoans"), data: [] };
      }
      const lines = ctx.loans
        .map((l) =>
          t("assistant.backend.tools.loanLine", {
            name: l.name,
            principal: m(l.principal),
            apr: l.apr,
            months: l.termMonths,
          }),
        )
        .join("; ");
      return { summary: lines, data: ctx.loans };
    }

    default:
      return { summary: t("assistant.backend.tools.unknownTool"), data: null };
  }
}
