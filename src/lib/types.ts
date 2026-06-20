export type AssetType = "crypto" | "stock" | "etf" | "metal" | "other";

export type CustomPricePoint = { t: number; p: number };

export type Holding = {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  quantity: number;
  manualPrice?: number;
  currentPrice: number;
  /** Currency of currentPrice / manualPrice / customHistory. Defaults to "USD". */
  priceCurrency?: string;
  color: string;
  coinGeckoId?: string;
  lastPriceAt?: number;
  /** Custom asset (not on any market) — user-managed history (sorted ascending by t) */
  customHistory?: CustomPricePoint[];
  /** Free-form notes for custom holdings */
  notes?: string;
};

export type CashflowEntry = {
  id: string;
  kind: "income" | "expense";
  source: string;
  category: string;
  amount: number;
  /** Currency of `amount`. Defaults to "USD" for legacy entries. */
  currency?: string;
  date: string; // ISO
};

export type Settings = {
  useCorsProxy: boolean;
  corsProxy: string;
  finnhubKey?: string;
  privacyMode?: boolean;
  /** Currency the UI renders all values in. Default "USD". */
  displayCurrency?: string;
};

export type AppState = {
  holdings: Holding[];
  cashflows: CashflowEntry[];
  settings: Settings;
};

export const DEFAULT_STATE: AppState = {
  holdings: [],
  cashflows: [],
  settings: {
    useCorsProxy: true,
    corsProxy: "https://corsproxy.io/?",
    privacyMode: false,
    displayCurrency: "USD",
  },
};

export type SearchResult = {
  symbol: string;
  name: string;
  type: AssetType;
  coinGeckoId?: string;
};

export type PricePoint = { date: Date; price: number };

export const PALETTE = [
  "#5eead4",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#fb7185",
  "#34d399",
  "#22d3ee",
  "#c084fc",
  "#fdba74",
];
