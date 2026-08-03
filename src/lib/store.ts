import { create } from "zustand";
import {
  AppState,
  DEFAULT_STATE,
  DEFAULT_CATEGORIES,
  Holding,
  CashflowEntry,
  Category,
  Settings,
  HoldingTransaction,
  CreditCard,
  Budget,
  BudgetPlan,
  BudgetItem,
  ForecastScenario,
  SavingsGoal,
  Loan,
} from "./types";
import { getFxRates, convert, type FxRates } from "./finance/fx";
import { formatMoney, maskMoney, MASK } from "./format";
import { secureGet, secureSet } from "./secure-storage";
import { setSettingsSnapshot } from "./finance/client";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ept_state_v1";

function uid() {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function migrateBudgets(parsed: any, defCcy: string): { plans: BudgetPlan[]; mainId?: string } {
  const rawPlans = Array.isArray(parsed?.budgetPlans) ? parsed.budgetPlans : [];
  const plans: BudgetPlan[] = rawPlans.map((p: any) => ({
    id: String(p.id),
    name: String(p.name ?? "Plan"),
    description: p.description || undefined,
    color: p.color || undefined,
    periodType: p.periodType || undefined,
    periodDays: Number.isFinite(Number(p.periodDays)) ? Number(p.periodDays) : undefined,
    items: (Array.isArray(p.items) ? p.items : []).map((it: any) => ({
      id: String(it.id),
      label: String(it.label ?? ""),
      amount: Number(it.amount) || 0,
      currency: it.currency || defCcy,
      categoryId: it.categoryId || undefined,
      color: it.color || undefined,
    })),
  }));
  let mainId: string | undefined = parsed?.mainBudgetPlanId;
  if (plans.length === 0 && Array.isArray(parsed?.budgets) && parsed.budgets.length > 0) {
    const id = "plan-default";
    plans.push({
      id,
      name: "Default",
      items: parsed.budgets.map((b: any, i: number) => ({
        id: `bi-${b.id ?? i}`,
        label: "",
        amount: Number(b.amount) || 0,
        currency: b.currency || defCcy,
        categoryId: b.categoryId,
      })),
    });
    mainId = mainId ?? id;
  }
  if (!mainId && plans[0]) mainId = plans[0].id;
  return { plans, mainId };
}

function migrateScenarios(parsed: any): { scenarios: ForecastScenario[]; mainId?: string } {
  const raw = Array.isArray(parsed?.forecastScenarios) ? parsed.forecastScenarios : [];
  const scenarios: ForecastScenario[] = raw.map((s: any) => ({
    id: String(s.id),
    name: String(s.name ?? "Scenario"),
    months: Math.max(1, Math.min(60, Number(s.months) || 6)),
    monthlyIncomeAdjust: Number(s.monthlyIncomeAdjust) || 0,
    monthlyExpenseAdjust: Number(s.monthlyExpenseAdjust) || 0,
    currency: s.currency,
    notes: s.notes,
    description: s.description || undefined,
    color: s.color || undefined,
    sliceColors:
      s.sliceColors && typeof s.sliceColors === "object" ? { ...s.sliceColors } : undefined,
  }));
  let mainId: string | undefined = parsed?.mainForecastScenarioId;
  if (scenarios.length === 0) {
    scenarios.push({ id: "scn-default", name: "Baseline", months: 6 });
    mainId = "scn-default";
  }
  if (!mainId) mainId = scenarios[0].id;
  return { scenarios, mainId };
}

/** Normalize raw JSON (persisted or imported) into a complete AppState. */
export function normalizeAppState(parsed: Record<string, unknown> | AppState): AppState {
  const p = parsed as any;
  const settings = { ...DEFAULT_STATE.settings, ...(p.settings ?? {}) };
  const defCcy = (settings.displayCurrency || "USD").toUpperCase();
  const withCcy = <T extends { currency?: string }>(x: T): T =>
    x && (!x.currency || !String(x.currency).trim()) ? { ...x, currency: defCcy } : x;
  const { plans, mainId: mainBudgetPlanId } = migrateBudgets(p, defCcy);
  const { scenarios, mainId: mainForecastScenarioId } = migrateScenarios(p);
  return syncQuantities({
    ...DEFAULT_STATE,
    ...p,
    cashflows: Array.isArray(p.cashflows) ? p.cashflows.map(withCcy) : [],
    holdings: Array.isArray(p.holdings) ? p.holdings.map(withCcy) : [],
    transactions: (Array.isArray(p.transactions) ? p.transactions : []).map(withCcy),
    creditCards: (Array.isArray(p.creditCards) ? p.creditCards : []).map(withCcy),
    budgets: (Array.isArray(p.budgets) ? p.budgets : []).map(withCcy),
    budgetPlans: plans,
    mainBudgetPlanId,
    forecastScenarios: scenarios,
    mainForecastScenarioId,
    goals: (Array.isArray(p.goals) ? p.goals : []).map(withCcy),
    loans: (Array.isArray(p.loans) ? p.loans : []).map(withCcy),
    categories:
      Array.isArray(p.categories) && p.categories.length > 0 ? p.categories : DEFAULT_CATEGORIES,
    settings,
  });
}

async function loadState(): Promise<AppState> {
  try {
    const raw = await secureGet(STORAGE_KEY);
    if (!raw) {
      const { scenarios, mainId } = migrateScenarios({});
      return { ...DEFAULT_STATE, forecastScenarios: scenarios, mainForecastScenarioId: mainId };
    }
    return normalizeAppState(JSON.parse(raw));
  } catch {
    return DEFAULT_STATE;
  }
}

function syncQuantities(state: AppState): AppState {
  const byHolding = new Map<string, { qty: number; hasTx: boolean }>();
  for (const t of state.transactions) {
    const cur = byHolding.get(t.holdingId) ?? { qty: 0, hasTx: true };
    cur.hasTx = true;
    cur.qty += (t.kind === "buy" ? 1 : -1) * (Number(t.quantity) || 0);
    byHolding.set(t.holdingId, cur);
  }
  let changed = false;
  const holdings = state.holdings.map((h) => {
    const agg = byHolding.get(h.id);
    if (!agg?.hasTx) return h;
    const opening = h.openingQuantity ?? 0;
    const qty = Math.max(0, opening + agg.qty);
    if (qty === h.quantity) return h;
    changed = true;
    return { ...h, quantity: qty };
  });
  return changed ? { ...state, holdings } : state;
}

function applyCashflowTransferLinks(state: AppState, entry: CashflowEntry): AppState {
  if (entry.kind !== "transfer") {
    return { ...state, cashflows: [...state.cashflows, entry] };
  }
  const findHoldingRef = (ref?: string): string | null => {
    if (!ref) return null;
    if (ref.startsWith("holding:")) return ref.slice("holding:".length);
    return null;
  };
  const buyHoldingId = findHoldingRef(entry.toAccount);
  const sellHoldingId = findHoldingRef(entry.fromAccount);
  const targetId = buyHoldingId ?? sellHoldingId;
  if (!targetId) return { ...state, cashflows: [...state.cashflows, entry] };
  const holding = state.holdings.find((h) => h.id === targetId);
  if (!holding) return { ...state, cashflows: [...state.cashflows, entry] };
  const price = holding.currentPrice > 0 ? holding.currentPrice : 1;
  const qty = Math.abs(Number(entry.amount) || 0) / price;
  const tx: HoldingTransaction = {
    id: uid(),
    holdingId: targetId,
    kind: buyHoldingId ? "buy" : "sell",
    date: entry.date,
    quantity: qty,
    pricePerUnit: price,
    currency: entry.currency || holding.priceCurrency || "USD",
    notes: `Transfer: ${entry.description || ""}`.trim(),
  };
  const linked: CashflowEntry = { ...entry, linkedTransactionId: tx.id };
  const holdings = state.holdings.map((h) => {
    if (h.id !== targetId) return h;
    if (h.openingQuantity != null) return h;
    const hasExisting = state.transactions.some((x) => x.holdingId === h.id);
    return { ...h, openingQuantity: hasExisting ? 0 : Number(h.quantity) || 0 };
  });
  return syncQuantities({
    ...state,
    holdings,
    cashflows: [...state.cashflows, linked],
    transactions: [...state.transactions, tx],
  });
}

type Store = {
  state: AppState;
  hydrated: boolean;
  fxRates: FxRates;
  hydrate: () => Promise<void>;
  setState: (updater: (s: AppState) => AppState) => void;
  addHolding: (h: Omit<Holding, "id">) => void;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  removeHolding: (id: string) => void;
  addCashflow: (c: Omit<CashflowEntry, "id">) => void;
  updateCashflow: (id: string, patch: Partial<CashflowEntry>) => void;
  removeCashflow: (id: string) => void;
  addTransaction: (t: Omit<HoldingTransaction, "id">) => void;
  updateTransaction: (id: string, patch: Partial<HoldingTransaction>) => void;
  removeTransaction: (id: string) => void;
  addCreditCard: (c: Omit<CreditCard, "id">) => CreditCard;
  updateCreditCard: (id: string, patch: Partial<CreditCard>) => void;
  removeCreditCard: (id: string) => void;
  addCategory: (c: Omit<Category, "id">) => Category;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  removeCategory: (id: string) => void;
  addBudget: (b: Omit<Budget, "id">) => Budget;
  updateBudget: (id: string, patch: Partial<Budget>) => void;
  removeBudget: (id: string) => void;
  addBudgetPlan: (name: string) => BudgetPlan;
  updateBudgetPlan: (id: string, patch: Partial<Omit<BudgetPlan, "id" | "items">>) => void;
  removeBudgetPlan: (id: string) => void;
  setMainBudgetPlan: (id: string | undefined) => void;
  duplicateBudgetPlan: (id: string) => BudgetPlan | undefined;
  addBudgetItem: (planId: string, item: Omit<BudgetItem, "id">) => void;
  updateBudgetItem: (planId: string, itemId: string, patch: Partial<BudgetItem>) => void;
  removeBudgetItem: (planId: string, itemId: string) => void;
  addForecastScenario: (s: Omit<ForecastScenario, "id">) => ForecastScenario;
  updateForecastScenario: (id: string, patch: Partial<ForecastScenario>) => void;
  removeForecastScenario: (id: string) => void;
  setMainForecastScenario: (id: string | undefined) => void;
  duplicateForecastScenario: (id: string) => ForecastScenario | undefined;
  addGoal: (g: Omit<SavingsGoal, "id">) => SavingsGoal;
  updateGoal: (id: string, patch: Partial<SavingsGoal>) => void;
  removeGoal: (id: string) => void;
  addLoan: (l: Omit<Loan, "id">) => Loan;
  updateLoan: (id: string, patch: Partial<Loan>) => void;
  removeLoan: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  importState: (data: AppState) => void;
  reset: () => void;
};

function persist(state: AppState) {
  setSettingsSnapshot(state.settings);
  void secureSet(STORAGE_KEY, JSON.stringify(state));
}

export const useAppStore = create<Store>((set, get) => {
  const patch = (updater: (s: AppState) => AppState) => {
    set((prev) => {
      const next = updater(prev.state);
      persist(next);
      return { state: next };
    });
  };

  return {
    state: DEFAULT_STATE,
    hydrated: false,
    fxRates: { USD: 1 },
    hydrate: async () => {
      const [s, rates] = await Promise.all([loadState(), getFxRates().catch(() => ({ USD: 1 }))]);
      setSettingsSnapshot(s.settings);
      set({ state: s, hydrated: true, fxRates: rates });
    },
    setState: patch,
    addHolding: (h) => patch((s) => ({ ...s, holdings: [...s.holdings, { ...h, id: uid() }] })),
    updateHolding: (id, p) =>
      patch((s) => ({ ...s, holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...p } : h)) })),
    removeHolding: (id) =>
      patch((s) => ({
        ...s,
        holdings: s.holdings.filter((h) => h.id !== id),
        transactions: s.transactions.filter((t) => t.holdingId !== id),
      })),
    addCashflow: (c) => patch((s) => applyCashflowTransferLinks(s, { ...c, id: uid() })),
    updateCashflow: (id, p) =>
      patch((s) => {
        const existing = s.cashflows.find((c) => c.id === id);
        if (!existing) return s;
        let next: AppState = { ...s };
        if (existing.linkedTransactionId) {
          next = {
            ...next,
            transactions: next.transactions.filter((t) => t.id !== existing.linkedTransactionId),
          };
        }
        const merged: CashflowEntry = { ...existing, ...p, linkedTransactionId: undefined };
        next = { ...next, cashflows: next.cashflows.map((c) => (c.id === id ? merged : c)) };
        if (merged.kind === "transfer") {
          next = applyCashflowTransferLinks(
            { ...next, cashflows: next.cashflows.filter((c) => c.id !== id) },
            merged,
          );
        } else {
          next = syncQuantities(next);
        }
        return next;
      }),
    removeCashflow: (id) =>
      patch((s) => {
        const existing = s.cashflows.find((c) => c.id === id);
        let next: AppState = { ...s, cashflows: s.cashflows.filter((c) => c.id !== id) };
        if (existing?.linkedTransactionId) {
          next = {
            ...next,
            transactions: next.transactions.filter((t) => t.id !== existing.linkedTransactionId),
          };
          next = syncQuantities(next);
        }
        return next;
      }),
    addTransaction: (t) =>
      patch((s) => {
        const holdings = s.holdings.map((h) => {
          if (h.id !== t.holdingId) return h;
          if (h.openingQuantity != null) return h;
          const hasExisting = s.transactions.some((x) => x.holdingId === h.id);
          return { ...h, openingQuantity: hasExisting ? 0 : Number(h.quantity) || 0 };
        });
        return syncQuantities({
          ...s,
          holdings,
          transactions: [...s.transactions, { ...t, id: uid() }],
        });
      }),
    updateTransaction: (id, p) =>
      patch((s) =>
        syncQuantities({
          ...s,
          transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...p } : t)),
        }),
      ),
    removeTransaction: (id) =>
      patch((s) =>
        syncQuantities({ ...s, transactions: s.transactions.filter((t) => t.id !== id) }),
      ),
    addCreditCard: (c) => {
      const created: CreditCard = { ...c, id: uid() };
      patch((s) => ({ ...s, creditCards: [...(s.creditCards ?? []), created] }));
      return created;
    },
    updateCreditCard: (id, p) =>
      patch((s) => ({
        ...s,
        creditCards: (s.creditCards ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)),
      })),
    removeCreditCard: (id) =>
      patch((s) => ({ ...s, creditCards: (s.creditCards ?? []).filter((c) => c.id !== id) })),
    addCategory: (c) => {
      const created: Category = { ...c, id: uid() };
      patch((s) => ({ ...s, categories: [...s.categories, created] }));
      return created;
    },
    updateCategory: (id, p) =>
      patch((s) => ({
        ...s,
        categories: s.categories.map((c) => (c.id === id ? { ...c, ...p } : c)),
      })),
    removeCategory: (id) =>
      patch((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) })),
    addBudget: (b) => {
      const created: Budget = { ...b, id: uid() };
      patch((s) => ({ ...s, budgets: [...(s.budgets ?? []), created] }));
      return created;
    },
    updateBudget: (id, p) =>
      patch((s) => ({
        ...s,
        budgets: (s.budgets ?? []).map((b) => (b.id === id ? { ...b, ...p } : b)),
      })),
    removeBudget: (id) =>
      patch((s) => ({ ...s, budgets: (s.budgets ?? []).filter((b) => b.id !== id) })),
    addBudgetPlan: (name) => {
      const created: BudgetPlan = { id: uid(), name: name || "New plan", items: [] };
      patch((s) => {
        const plans = [...(s.budgetPlans ?? []), created];
        return { ...s, budgetPlans: plans, mainBudgetPlanId: s.mainBudgetPlanId ?? created.id };
      });
      return created;
    },
    updateBudgetPlan: (id, p) =>
      patch((s) => ({
        ...s,
        budgetPlans: (s.budgetPlans ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)),
      })),
    removeBudgetPlan: (id) =>
      patch((s) => {
        const plans = (s.budgetPlans ?? []).filter((p) => p.id !== id);
        return {
          ...s,
          budgetPlans: plans,
          mainBudgetPlanId: s.mainBudgetPlanId === id ? plans[0]?.id : s.mainBudgetPlanId,
        };
      }),
    setMainBudgetPlan: (id) => patch((s) => ({ ...s, mainBudgetPlanId: id })),
    duplicateBudgetPlan: (id) => {
      let created: BudgetPlan | undefined;
      patch((s) => {
        const src = (s.budgetPlans ?? []).find((p) => p.id === id);
        if (!src) return s;
        created = {
          ...src,
          id: uid(),
          name: `${src.name} (copy)`,
          items: src.items.map((it) => ({ ...it, id: uid() })),
        };
        return { ...s, budgetPlans: [...(s.budgetPlans ?? []), created!] };
      });
      return created;
    },
    addBudgetItem: (planId, item) =>
      patch((s) => ({
        ...s,
        budgetPlans: (s.budgetPlans ?? []).map((p) =>
          p.id === planId ? { ...p, items: [...p.items, { ...item, id: uid() }] } : p,
        ),
      })),
    updateBudgetItem: (planId, itemId, p) =>
      patch((s) => ({
        ...s,
        budgetPlans: (s.budgetPlans ?? []).map((plan) =>
          plan.id === planId
            ? {
                ...plan,
                items: plan.items.map((it) => (it.id === itemId ? { ...it, ...p } : it)),
              }
            : plan,
        ),
      })),
    removeBudgetItem: (planId, itemId) =>
      patch((s) => ({
        ...s,
        budgetPlans: (s.budgetPlans ?? []).map((p) =>
          p.id === planId ? { ...p, items: p.items.filter((it) => it.id !== itemId) } : p,
        ),
      })),
    addForecastScenario: (sc) => {
      const created: ForecastScenario = { ...sc, id: uid() };
      patch((s) => {
        const scenarios = [...(s.forecastScenarios ?? []), created];
        return {
          ...s,
          forecastScenarios: scenarios,
          mainForecastScenarioId: s.mainForecastScenarioId ?? created.id,
        };
      });
      return created;
    },
    updateForecastScenario: (id, p) =>
      patch((s) => ({
        ...s,
        forecastScenarios: (s.forecastScenarios ?? []).map((sc) =>
          sc.id === id ? { ...sc, ...p } : sc,
        ),
      })),
    removeForecastScenario: (id) =>
      patch((s) => {
        const scenarios = (s.forecastScenarios ?? []).filter((sc) => sc.id !== id);
        return {
          ...s,
          forecastScenarios: scenarios,
          mainForecastScenarioId:
            s.mainForecastScenarioId === id ? scenarios[0]?.id : s.mainForecastScenarioId,
        };
      }),
    setMainForecastScenario: (id) => patch((s) => ({ ...s, mainForecastScenarioId: id })),
    duplicateForecastScenario: (id) => {
      let created: ForecastScenario | undefined;
      patch((s) => {
        const src = (s.forecastScenarios ?? []).find((sc) => sc.id === id);
        if (!src) return s;
        created = { ...src, id: uid(), name: `${src.name} (copy)` };
        return { ...s, forecastScenarios: [...(s.forecastScenarios ?? []), created!] };
      });
      return created;
    },
    addGoal: (g) => {
      const created: SavingsGoal = { ...g, id: uid() };
      patch((s) => ({ ...s, goals: [...(s.goals ?? []), created] }));
      return created;
    },
    updateGoal: (id, p) =>
      patch((s) => ({
        ...s,
        goals: (s.goals ?? []).map((g) => (g.id === id ? { ...g, ...p } : g)),
      })),
    removeGoal: (id) =>
      patch((s) => ({ ...s, goals: (s.goals ?? []).filter((g) => g.id !== id) })),
    addLoan: (l) => {
      const created: Loan = { ...l, id: uid() };
      patch((s) => ({ ...s, loans: [...(s.loans ?? []), created] }));
      return created;
    },
    updateLoan: (id, p) =>
      patch((s) => ({
        ...s,
        loans: (s.loans ?? []).map((l) => (l.id === id ? { ...l, ...p } : l)),
      })),
    removeLoan: (id) =>
      patch((s) => ({ ...s, loans: (s.loans ?? []).filter((l) => l.id !== id) })),
    updateSettings: (p) => patch((s) => ({ ...s, settings: { ...s.settings, ...p } })),
    importState: (data) => patch(() => normalizeAppState(data as AppState)),
    reset: () => patch(() => DEFAULT_STATE),
  };
});

/** Compatibility hook matching the previous Context API shape. */
export function useStore() {
  const store = useAppStore();
  return store;
}

export function usePrivacy() {
  const privacy = useAppStore((s) => !!s.state.settings.privacyMode);
  const updateSettings = useAppStore((s) => s.updateSettings);
  return {
    privacy,
    toggle: () => updateSettings({ privacyMode: !privacy }),
    setPrivacy: (v: boolean) => updateSettings({ privacyMode: v }),
  };
}

export function useFxRates(): FxRates {
  return useAppStore((s) => s.fxRates);
}

export function useMoney() {
  const state = useAppStore((s) => s.state);
  const rates = useAppStore((s) => s.fxRates);
  const { privacy } = usePrivacy();
  const displayCurrency = (state.settings.displayCurrency || "USD").toUpperCase();

  const toDisplay = useCallback(
    (amount: number, from?: string) =>
      convert(amount, (from && from.trim()) || displayCurrency, displayCurrency, rates),
    [displayCurrency, rates],
  );

  const fmt = useCallback(
    (amount: number, from?: string, opts?: { compact?: boolean }) =>
      formatMoney(toDisplay(amount, from), displayCurrency, opts),
    [toDisplay, displayCurrency],
  );

  const mask = useCallback(
    (amount: number, from?: string, opts?: { compact?: boolean }) =>
      maskMoney(toDisplay(amount, from), displayCurrency, privacy, opts),
    [toDisplay, displayCurrency, privacy],
  );

  return { currency: displayCurrency, rates, toDisplay, fmt, mask, privacy, MASK };
}

export function useHydrateStore() {
  const hydrate = useAppStore((s) => s.hydrate);
  const hydrated = useAppStore((s) => s.hydrated);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return hydrated;
}
