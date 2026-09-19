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
  CashAccount,
  NetWorthSnapshot,
  DEFAULT_CASH_ACCOUNT,
  Budget,
  BudgetPlan,
  BudgetItem,
  ForecastScenario,
  SavingsGoal,
  Loan,
} from "./types";
import { getFxRates, convert, type FxRates } from "./finance/fx";
import { formatMoney, maskMoney, MASK } from "./format";
import { secureGet, DecryptError, createSecureWriteQueue, beginForceKeyCreate, endForceKeyCreate, verifySecureStorage } from "./secure-storage";
import { setSettingsSnapshot } from "./finance/client";
import { useCallback, useEffect, useState } from "react";
import { AppState as RnAppState } from "react-native";

const STORAGE_KEY = "ept_state_v1";
const stateWriteQueue = createSecureWriteQueue(STORAGE_KEY);

const DECRYPT_LOCK_MSG =
  "Could not decrypt saved data. Your encrypted backup may still be on device — do not edit until you Import a backup or Reset in Settings.";


function uid() {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function migrateBudgets(
  parsed: any,
  defCcy: string,
  categories?: Category[],
): { plans: BudgetPlan[]; mainId?: string } {
  const cats = Array.isArray(categories) ? categories : [];
  const catName = (id?: string) => cats.find((c) => c.id === id)?.name;
  const labelFor = (it: any) => {
    const existing = String(it.label ?? "").trim();
    if (existing) return existing;
    const fromCat = catName(it.categoryId);
    if (fromCat) return fromCat;
    const amt = Number(it.amount) || 0;
    return amt > 0 ? `Item (${amt})` : "";
  };
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
      label: labelFor(it),
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
        label: labelFor(b),
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
  const { plans, mainId: mainBudgetPlanId } = migrateBudgets(
    p,
    defCcy,
    Array.isArray(p.categories) ? p.categories : DEFAULT_CATEGORIES,
  );
  const { scenarios, mainId: mainForecastScenarioId } = migrateScenarios(p);
  return syncQuantities({
    ...DEFAULT_STATE,
    ...p,
    cashflows: Array.isArray(p.cashflows) ? p.cashflows.map(withCcy) : [],
    holdings: Array.isArray(p.holdings) ? p.holdings.map(withCcy) : [],
    transactions: (Array.isArray(p.transactions) ? p.transactions : []).map(withCcy),
    creditCards: (Array.isArray(p.creditCards) ? p.creditCards : []).map(withCcy),
    cashAccounts: (() => {
      const raw = Array.isArray(p.cashAccounts) ? p.cashAccounts : [];
      if (raw.length === 0) return [DEFAULT_CASH_ACCOUNT];
      const mapped = raw.map((a: CashAccount) => withCcy(a));
      if (!mapped.some((a: CashAccount) => a.isDefault)) mapped[0] = { ...mapped[0], isDefault: true };
      return mapped;
    })(),
    netWorthSnapshots: Array.isArray(p.netWorthSnapshots) ? p.netWorthSnapshots : [],
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

type LoadResult = { state: AppState; error?: string; locked?: boolean };

async function loadState(fallback?: AppState): Promise<LoadResult> {
  try {
    const raw = await secureGet(STORAGE_KEY);
    if (!raw) {
      const { scenarios, mainId } = migrateScenarios({});
      return {
        state: { ...DEFAULT_STATE, forecastScenarios: scenarios, mainForecastScenarioId: mainId },
      };
    }
    return { state: normalizeAppState(JSON.parse(raw)) };
  } catch (e) {
    const isDecrypt =
      e instanceof DecryptError || (e instanceof Error && e.name === "DecryptError");
    if (isDecrypt) {
      if (fallback && fallback !== DEFAULT_STATE) {
        return {
          state: fallback,
          error: "Could not decrypt saved data. Showing last session state — do not edit until you Import or Reset.",
          locked: true,
        };
      }
      return {
        state: DEFAULT_STATE,
        error: DECRYPT_LOCK_MSG,
        locked: true,
      };
    }
    console.warn("[store] loadState failed", e);
    return { state: fallback ?? DEFAULT_STATE, error: "Failed to load saved data." };
  }
}

function reportPersistFailure(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  useAppStore.setState({
    persistError: `Failed to save data locally (${msg}). Keep the app open a moment and try again.`,
  });
}

function persist(state: AppState, opts?: { force?: boolean }) {
  const { hydrated, storageLocked } = useAppStore.getState();
  if (!hydrated && !opts?.force) {
    console.warn("[store] skip persist before hydrate");
    return;
  }
  if (storageLocked && !opts?.force) {
    console.warn("[store] skip persist while storage locked");
    return;
  }
  setSettingsSnapshot(state.settings);
  void stateWriteQueue
    .enqueue(JSON.stringify(state))
    .then(() => {
      // Successful drain clears lastError; drop any prior persist banner.
      useAppStore.setState({ persistError: null });
    })
    .catch((e) => {
      console.warn("[store] persist failed", e);
      reportPersistFailure(e);
    });
}

/** Drain pending encrypted writes (call on background/inactive / resume catch-up). */
export async function flushPersist(): Promise<void> {
  try {
    await stateWriteQueue.flush();
    if (stateWriteQueue.lastError) {
      reportPersistFailure(stateWriteQueue.lastError);
    } else {
      useAppStore.setState({ persistError: null });
    }
  } catch (e) {
    console.warn("[store] flushPersist failed", e);
    reportPersistFailure(e);
  }
}

export function hasPendingPersist(): boolean {
  return stateWriteQueue.hasPending || !!stateWriteQueue.lastError;
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
  hydrateError: string | null;
  persistError: string | null;
  /** True after DecryptError — blocks disk writes until import/reset. */
  storageLocked: boolean;
  fxRates: FxRates;
  hydrate: () => Promise<void>;
  clearHydrateError: () => void;
  clearPersistError: () => void;
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
  addCashAccount: (c: Omit<CashAccount, "id">) => CashAccount;
  updateCashAccount: (id: string, patch: Partial<CashAccount>) => void;
  removeCashAccount: (id: string) => void;
  recordNetWorthSnapshot: (snap: Omit<NetWorthSnapshot, "date"> & { date?: string }) => void;
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
  importState: (data: AppState) => Promise<void>;
  reset: () => Promise<void>;
};

export const useAppStore = create<Store>((set, get) => {
  const patch = (updater: (s: AppState) => AppState, opts?: { forcePersist?: boolean }) => {
    const prev = get();
    if (!prev.hydrated && !opts?.forcePersist) {
      console.warn("[store] ignored mutation before hydrate");
      return;
    }
    const next = updater(prev.state);
    set({ state: next });
    persist(next, { force: opts?.forcePersist });
  };

  const unlockAndPersist = async (updater: (s: AppState) => AppState): Promise<void> => {
    beginForceKeyCreate();
    set({ storageLocked: false, hydrateError: null, persistError: null });
    const next = updater(get().state);
    set({ state: next, hydrated: true });
    persist(next, { force: true });
    try {
      await stateWriteQueue.flush();
      if (stateWriteQueue.lastError) {
        reportPersistFailure(stateWriteQueue.lastError);
        throw stateWriteQueue.lastError;
      }
      set({ persistError: null });
    } finally {
      endForceKeyCreate();
    }
  };

  return {
    state: DEFAULT_STATE,
    hydrated: false,
    hydrateError: null,
    persistError: null,
    storageLocked: false,
    fxRates: { USD: 1 },
    hydrate: async () => {
      const current = get().state;
      const hasSession =
        current.cashflows.length > 0 ||
        current.holdings.length > 0 ||
        current.budgetPlans.length > 0;

      // Load first so decrypt-lock is detected before any probe write.
      const [loaded, rates] = await Promise.all([
        loadState(hasSession ? current : undefined),
        getFxRates().catch(() => ({ USD: 1 })),
      ]);

      let storageCheckError: string | null = null;
      if (!loaded.locked) {
        try {
          await verifySecureStorage();
          // Confirm the real app blob (if any) still decrypts after the probe.
          const again = await secureGet(STORAGE_KEY);
          if (again) {
            normalizeAppState(JSON.parse(again));
          }
        } catch (e) {
          storageCheckError = e instanceof Error ? e.message : String(e);
          console.warn("[store] secure storage self-check failed", e);
        }
      }

      setSettingsSnapshot(loaded.state.settings);
      set({
        state: loaded.state,
        hydrated: true,
        hydrateError: loaded.error ?? null,
        persistError: storageCheckError
          ? `Failed to save data locally (${storageCheckError}). Keep the app open a moment and try again.`
          : null,
        storageLocked: !!loaded.locked,
        fxRates: rates,
      });
    },
    clearHydrateError: () => set({ hydrateError: null }),
    clearPersistError: () => set({ persistError: null }),
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
    addCashAccount: (c) => {
      const created: CashAccount = { ...c, id: uid(), isDefault: false };
      patch((s) => {
        const existing = s.cashAccounts?.length ? s.cashAccounts : [DEFAULT_CASH_ACCOUNT];
        return { ...s, cashAccounts: [...existing, created] };
      });
      return created;
    },
    updateCashAccount: (id, p) =>
      patch((s) => ({
        ...s,
        cashAccounts: (s.cashAccounts ?? [DEFAULT_CASH_ACCOUNT]).map((a) => {
          if (a.id !== id) {
            if (p.isDefault) return { ...a, isDefault: false };
            return a;
          }
          return { ...a, ...p };
        }),
      })),
    removeCashAccount: (id) =>
      patch((s) => {
        const list = s.cashAccounts ?? [DEFAULT_CASH_ACCOUNT];
        const next = list.filter((a) => a.id !== id);
        if (next.length === 0) return { ...s, cashAccounts: [DEFAULT_CASH_ACCOUNT] };
        if (!next.some((a) => a.isDefault)) next[0] = { ...next[0], isDefault: true };
        return { ...s, cashAccounts: next };
      }),
    recordNetWorthSnapshot: (snap) =>
      patch((s) => {
        const date = snap.date ?? new Date().toISOString().slice(0, 10);
        const entry: NetWorthSnapshot = {
          date,
          portfolio: snap.portfolio,
          liquidity: snap.liquidity,
          debt: snap.debt,
          netWorth: snap.netWorth,
          currency: snap.currency,
        };
        const prev = s.netWorthSnapshots ?? [];
        const without = prev.filter((x) => x.date !== date);
        return {
          ...s,
          netWorthSnapshots: [...without, entry].sort((a, b) => a.date.localeCompare(b.date)),
        };
      }),
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
    importState: (data) => unlockAndPersist(() => normalizeAppState(data as AppState)),
    reset: () => unlockAndPersist(() => DEFAULT_STATE),
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
  useEffect(() => {
    const sub = RnAppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        void Promise.all([
          flushPersist(),
          import("./ai/persistence").then((m) => m.flushChatPersist()),
        ]);
      } else if (next === "active") {
        if (hasPendingPersist() || stateWriteQueue.lastError) {
          void flushPersist();
        }
        void import("./ai/persistence").then((m) => m.flushChatPersist());
      }
    });
    return () => sub.remove();
  }, []);
  return hydrated;
}
