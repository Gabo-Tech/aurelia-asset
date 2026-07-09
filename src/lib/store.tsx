import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, DEFAULT_STATE, DEFAULT_CATEGORIES, Holding, CashflowEntry, Category, Settings, HoldingTransaction, CreditCard, Budget, BudgetPlan, BudgetItem, ForecastScenario, SavingsGoal, Loan } from "./types";
import { getFxRates, convert, type FxRates } from "./finance/fx";
import { formatMoney, maskMoney, MASK } from "./format";
import { secureGet, secureSet } from "./secure-storage";
import { setSettingsSnapshot } from "./finance/client";


const STORAGE_KEY = "ept_state_v1";

function migrateBudgets(parsed: any, defCcy: string): { plans: BudgetPlan[]; mainId?: string } {
  const rawPlans = Array.isArray(parsed?.budgetPlans) ? parsed.budgetPlans : [];
  const plans: BudgetPlan[] = rawPlans.map((p: any) => ({
    id: String(p.id),
    name: String(p.name ?? "Plan"),
    items: (Array.isArray(p.items) ? p.items : []).map((it: any) => ({
      id: String(it.id),
      label: String(it.label ?? ""),
      amount: Number(it.amount) || 0,
      currency: it.currency || defCcy,
      categoryId: it.categoryId || undefined,
    })),
  }));
  let mainId: string | undefined = parsed?.mainBudgetPlanId;
  if (plans.length === 0 && Array.isArray(parsed?.budgets) && parsed.budgets.length > 0) {
    // Wrap legacy flat budgets into a "Default" plan.
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
  }));
  let mainId: string | undefined = parsed?.mainForecastScenarioId;
  if (scenarios.length === 0) {
    scenarios.push({ id: "scn-default", name: "Baseline", months: 6 });
    mainId = "scn-default";
  }
  if (!mainId) mainId = scenarios[0].id;
  return { scenarios, mainId };
}

async function loadState(): Promise<AppState> {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = await secureGet(STORAGE_KEY);
    if (!raw) {
      // Fresh install: seed a default forecast scenario so the UI has something to show.
      const { scenarios, mainId } = migrateScenarios({});
      return { ...DEFAULT_STATE, forecastScenarios: scenarios, mainForecastScenarioId: mainId };
    }
    const parsed = JSON.parse(raw);
    const settings = { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) };
    const defCcy = (settings.displayCurrency || "USD").toUpperCase();
    const withCcy = <T extends { currency?: string }>(x: T): T =>
      x && (!x.currency || !String(x.currency).trim()) ? { ...x, currency: defCcy } : x;
    const { plans, mainId: mainBudgetPlanId } = migrateBudgets(parsed, defCcy);
    const { scenarios, mainId: mainForecastScenarioId } = migrateScenarios(parsed);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      cashflows: Array.isArray(parsed.cashflows) ? parsed.cashflows.map(withCcy) : [],
      holdings: Array.isArray(parsed.holdings) ? parsed.holdings.map(withCcy) : [],
      transactions: (Array.isArray(parsed.transactions) ? parsed.transactions : []).map(withCcy),
      creditCards: (Array.isArray(parsed.creditCards) ? parsed.creditCards : []).map(withCcy),
      budgets: (Array.isArray(parsed.budgets) ? parsed.budgets : []).map(withCcy),
      budgetPlans: plans,
      mainBudgetPlanId,
      forecastScenarios: scenarios,
      mainForecastScenarioId,
      goals: (Array.isArray(parsed.goals) ? parsed.goals : []).map(withCcy),
      loans: (Array.isArray(parsed.loans) ? parsed.loans : []).map(withCcy),
      categories:
        Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : DEFAULT_CATEGORIES,
      settings,
    };
  } catch {
    return DEFAULT_STATE;
  }
}


type Ctx = {
  state: AppState;
  hydrated: boolean;
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

/** Recompute holdings.quantity from transactions for any holding that has at
 *  least one transaction. Holdings without transactions keep their manual quantity. */
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

/** When a cashflow transfer involves a holding, automatically create the
 *  corresponding HoldingTransaction (buy on the receiving side, sell on the
 *  sending side) and link it back via `linkedTransactionId`. Transfers between
 *  liquidity and credit cards do not need a holding tx. */
function applyCashflowTransferLinks(
  state: AppState,
  entry: CashflowEntry,
  uid: () => string,
): AppState {
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
  if (!targetId) {
    return { ...state, cashflows: [...state.cashflows, entry] };
  }
  const holding = state.holdings.find((h) => h.id === targetId);
  if (!holding) {
    return { ...state, cashflows: [...state.cashflows, entry] };
  }
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
  // Capture openingQuantity baseline if first tx for this holding.
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

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      setStateRaw(s);
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setSettingsSnapshot(state.settings);
    if (!hydrated) return;
    void secureSet(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);



  const value = useMemo<Ctx>(() => {
    const setState = (updater: (s: AppState) => AppState) =>
      setStateRaw((prev) => updater(prev));
    const uid = () =>
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    return {
      state,
      hydrated,
      setState,
      addHolding: (h) =>
        setState((s) => ({ ...s, holdings: [...s.holdings, { ...h, id: uid() }] })),
      updateHolding: (id, patch) =>
        setState((s) => ({
          ...s,
          holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)),
        })),
      removeHolding: (id) =>
        setState((s) => ({
          ...s,
          holdings: s.holdings.filter((h) => h.id !== id),
          transactions: s.transactions.filter((t) => t.holdingId !== id),
        })),
      addCashflow: (c) =>
        setState((s) => applyCashflowTransferLinks(s, { ...c, id: uid() }, uid)),
      updateCashflow: (id, patch) =>
        setState((s) => {
          const existing = s.cashflows.find((c) => c.id === id);
          if (!existing) return s;
          // Remove any previously linked transaction; re-link after applying the patch.
          let next: AppState = { ...s };
          if (existing.linkedTransactionId) {
            next = {
              ...next,
              transactions: next.transactions.filter(
                (t) => t.id !== existing.linkedTransactionId,
              ),
            };
          }
          const merged: CashflowEntry = { ...existing, ...patch, linkedTransactionId: undefined };
          // Apply link for transfers
          next = {
            ...next,
            cashflows: next.cashflows.map((c) => (c.id === id ? merged : c)),
          };
          if (merged.kind === "transfer") {
            next = applyCashflowTransferLinks(
              { ...next, cashflows: next.cashflows.filter((c) => c.id !== id) },
              merged,
              uid,
            );
          } else {
            next = syncQuantities(next);
          }
          return next;
        }),
      removeCashflow: (id) =>
        setState((s) => {
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
        setState((s) => {
          const holdings = s.holdings.map((h) => {
            if (h.id !== t.holdingId) return h;
            if (h.openingQuantity != null) return h;
            const hasExisting = s.transactions.some((x) => x.holdingId === h.id);
            // First tx for this holding - capture its current quantity as the baseline
            return { ...h, openingQuantity: hasExisting ? 0 : (Number(h.quantity) || 0) };
          });
          return syncQuantities({
            ...s,
            holdings,
            transactions: [...s.transactions, { ...t, id: uid() }],
          });
        }),
      updateTransaction: (id, patch) =>
        setState((s) =>
          syncQuantities({
            ...s,
            transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          }),
        ),
      removeTransaction: (id) =>
        setState((s) =>
          syncQuantities({
            ...s,
            transactions: s.transactions.filter((t) => t.id !== id),
          }),
        ),
      addCreditCard: (c) => {
        const created: CreditCard = { ...c, id: uid() };
        setState((s) => ({ ...s, creditCards: [...(s.creditCards ?? []), created] }));
        return created;
      },
      updateCreditCard: (id, patch) =>
        setState((s) => ({
          ...s,
          creditCards: (s.creditCards ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeCreditCard: (id) =>
        setState((s) => ({
          ...s,
          creditCards: (s.creditCards ?? []).filter((c) => c.id !== id),
        })),
      addCategory: (c) => {
        const created: Category = { ...c, id: uid() };
        setState((s) => ({ ...s, categories: [...s.categories, created] }));
        return created;
      },
      updateCategory: (id, patch) =>
        setState((s) => ({
          ...s,
          categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeCategory: (id) =>
        setState((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) })),
      addBudget: (b) => {
        const created: Budget = { ...b, id: uid() };
        setState((s) => ({ ...s, budgets: [...(s.budgets ?? []), created] }));
        return created;
      },
      updateBudget: (id, patch) =>
        setState((s) => ({
          ...s,
          budgets: (s.budgets ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),
      removeBudget: (id) =>
        setState((s) => ({ ...s, budgets: (s.budgets ?? []).filter((b) => b.id !== id) })),
      addBudgetPlan: (name) => {
        const created: BudgetPlan = { id: uid(), name: name || "New plan", items: [] };
        setState((s) => {
          const plans = [...(s.budgetPlans ?? []), created];
          return {
            ...s,
            budgetPlans: plans,
            mainBudgetPlanId: s.mainBudgetPlanId ?? created.id,
          };
        });
        return created;
      },
      updateBudgetPlan: (id, patch) =>
        setState((s) => ({
          ...s,
          budgetPlans: (s.budgetPlans ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removeBudgetPlan: (id) =>
        setState((s) => {
          const plans = (s.budgetPlans ?? []).filter((p) => p.id !== id);
          return {
            ...s,
            budgetPlans: plans,
            mainBudgetPlanId:
              s.mainBudgetPlanId === id ? plans[0]?.id : s.mainBudgetPlanId,
          };
        }),
      setMainBudgetPlan: (id) =>
        setState((s) => ({ ...s, mainBudgetPlanId: id })),
      addBudgetItem: (planId, item) =>
        setState((s) => ({
          ...s,
          budgetPlans: (s.budgetPlans ?? []).map((p) =>
            p.id === planId ? { ...p, items: [...p.items, { ...item, id: uid() }] } : p,
          ),
        })),
      updateBudgetItem: (planId, itemId, patch) =>
        setState((s) => ({
          ...s,
          budgetPlans: (s.budgetPlans ?? []).map((p) =>
            p.id === planId
              ? { ...p, items: p.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
              : p,
          ),
        })),
      removeBudgetItem: (planId, itemId) =>
        setState((s) => ({
          ...s,
          budgetPlans: (s.budgetPlans ?? []).map((p) =>
            p.id === planId ? { ...p, items: p.items.filter((it) => it.id !== itemId) } : p,
          ),
        })),
      addForecastScenario: (sc) => {
        const created: ForecastScenario = { ...sc, id: uid() };
        setState((s) => {
          const scenarios = [...(s.forecastScenarios ?? []), created];
          return {
            ...s,
            forecastScenarios: scenarios,
            mainForecastScenarioId: s.mainForecastScenarioId ?? created.id,
          };
        });
        return created;
      },
      updateForecastScenario: (id, patch) =>
        setState((s) => ({
          ...s,
          forecastScenarios: (s.forecastScenarios ?? []).map((sc) =>
            sc.id === id ? { ...sc, ...patch } : sc,
          ),
        })),
      removeForecastScenario: (id) =>
        setState((s) => {
          const scenarios = (s.forecastScenarios ?? []).filter((sc) => sc.id !== id);
          return {
            ...s,
            forecastScenarios: scenarios,
            mainForecastScenarioId:
              s.mainForecastScenarioId === id ? scenarios[0]?.id : s.mainForecastScenarioId,
          };
        }),
      setMainForecastScenario: (id) =>
        setState((s) => ({ ...s, mainForecastScenarioId: id })),
      addGoal: (g) => {
        const created: SavingsGoal = { ...g, id: uid() };
        setState((s) => ({ ...s, goals: [...(s.goals ?? []), created] }));
        return created;
      },
      updateGoal: (id, patch) =>
        setState((s) => ({
          ...s,
          goals: (s.goals ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      removeGoal: (id) =>
        setState((s) => ({ ...s, goals: (s.goals ?? []).filter((g) => g.id !== id) })),
      addLoan: (l) => {
        const created: Loan = { ...l, id: uid() };
        setState((s) => ({ ...s, loans: [...(s.loans ?? []), created] }));
        return created;
      },
      updateLoan: (id, patch) =>
        setState((s) => ({
          ...s,
          loans: (s.loans ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      removeLoan: (id) =>
        setState((s) => ({ ...s, loans: (s.loans ?? []).filter((l) => l.id !== id) })),
      updateSettings: (patch) =>
        setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
      importState: (data) =>
        setState(() =>
          syncQuantities({
            ...DEFAULT_STATE,
            ...data,
            transactions: Array.isArray((data as AppState).transactions) ? (data as AppState).transactions : [],
            settings: { ...DEFAULT_STATE.settings, ...(data.settings ?? {}) },
          }),
        ),
      reset: () => setState(() => DEFAULT_STATE),
    };
  }, [state, hydrated]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/** Convenience hook: privacy flag + toggle. */
export function usePrivacy() {
  const { state, updateSettings } = useStore();
  const privacy = !!state.settings.privacyMode;
  return {
    privacy,
    toggle: () => updateSettings({ privacyMode: !privacy }),
    setPrivacy: (v: boolean) => updateSettings({ privacyMode: v }),
  };
}

// ===== FX rates (USD-based) =====

const FxContext = createContext<FxRates | null>(null);

export function FxProvider({ children }: { children: ReactNode }) {
  const [rates, setRates] = useState<FxRates | null>(null);
  useEffect(() => {
    let alive = true;
    getFxRates().then((r) => {
      if (alive) setRates(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  return <FxContext.Provider value={rates}>{children}</FxContext.Provider>;
}

export function useFxRates(): FxRates {
  return useContext(FxContext) ?? { USD: 1 };
}

export function useFxReady(): boolean {
  return useContext(FxContext) !== null;
}

/**
 * Display-aware money helpers. Converts any input from its source currency
 * (default USD) to the user's display currency, and honors privacy mode.
 */
export function useMoney() {
  const { state } = useStore();
  const { privacy } = usePrivacy();
  const rates = useFxRates();
  const displayCurrency = (state.settings.displayCurrency || "USD").toUpperCase();

  const toDisplay = useCallback(
    (amount: number, from?: string) => convert(amount, (from && from.trim()) || displayCurrency, displayCurrency, rates),
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

