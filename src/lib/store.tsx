import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, DEFAULT_STATE, DEFAULT_CATEGORIES, Holding, CashflowEntry, Category, Settings } from "./types";
import { getFxRates, convert, type FxRates } from "./finance/fx";
import { formatMoney, maskMoney, MASK } from "./format";

const STORAGE_KEY = "ept_state_v1";

function loadState(): AppState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
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
  addCategory: (c: Omit<Category, "id">) => Category;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  removeCategory: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  importState: (data: AppState) => void;
  reset: () => void;
};

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
        setState((s) => ({ ...s, holdings: s.holdings.filter((h) => h.id !== id) })),
      addCashflow: (c) =>
        setState((s) => ({ ...s, cashflows: [...s.cashflows, { ...c, id: uid() }] })),
      updateCashflow: (id, patch) =>
        setState((s) => ({
          ...s,
          cashflows: s.cashflows.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeCashflow: (id) =>
        setState((s) => ({ ...s, cashflows: s.cashflows.filter((c) => c.id !== id) })),
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
        setState(() => ({
          ...DEFAULT_STATE,
          ...data,
          settings: { ...DEFAULT_STATE.settings, ...(data.settings ?? {}) },
        })),
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

