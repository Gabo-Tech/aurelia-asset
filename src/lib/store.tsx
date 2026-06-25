import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, DEFAULT_STATE, DEFAULT_CATEGORIES, Holding, CashflowEntry, Category, Settings, HoldingTransaction } from "./types";
import { getFxRates, convert, type FxRates } from "./finance/fx";
import { formatMoney, maskMoney, MASK } from "./format";
import { secureGet, secureSet } from "./secure-storage";

const STORAGE_KEY = "ept_state_v1";

async function loadState(): Promise<AppState> {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = await secureGet(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      categories:
        Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : DEFAULT_CATEGORIES,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
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
  addCategory: (c: Omit<Category, "id">) => Category;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  removeCategory: (id: string) => void;
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

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStateRaw(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
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
        setState((s) => ({ ...s, cashflows: [...s.cashflows, { ...c, id: uid() }] })),
      updateCashflow: (id, patch) =>
        setState((s) => ({
          ...s,
          cashflows: s.cashflows.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeCashflow: (id) =>
        setState((s) => ({ ...s, cashflows: s.cashflows.filter((c) => c.id !== id) })),
      addTransaction: (t) =>
        setState((s) => {
          const holdings = s.holdings.map((h) => {
            if (h.id !== t.holdingId) return h;
            if (h.openingQuantity != null) return h;
            const hasExisting = s.transactions.some((x) => x.holdingId === h.id);
            // First tx for this holding — capture its current quantity as the baseline
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
    (amount: number, from?: string) => convert(amount, from || "USD", displayCurrency, rates),
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

