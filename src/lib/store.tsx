import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, DEFAULT_STATE, Holding, CashflowEntry, Settings } from "./types";

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
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

type Ctx = {
  state: AppState;
  setState: (updater: (s: AppState) => AppState) => void;
  addHolding: (h: Omit<Holding, "id">) => void;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  removeHolding: (id: string) => void;
  addCashflow: (c: Omit<CashflowEntry, "id">) => void;
  removeCashflow: (id: string) => void;
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
      removeCashflow: (id) =>
        setState((s) => ({ ...s, cashflows: s.cashflows.filter((c) => c.id !== id) })),
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
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
