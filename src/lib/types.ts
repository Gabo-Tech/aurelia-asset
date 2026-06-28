export type AssetType = "crypto" | "stock" | "etf" | "metal" | "other";

export type CustomPricePoint = { t: number; p: number };

export type HoldingHorizon = "long" | "short";

export type Holding = {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  quantity: number;
  manualPrice?: number;
  currentPrice: number;
  priceCurrency?: string;
  color: string;
  coinGeckoId?: string;
  lastPriceAt?: number;
  customHistory?: CustomPricePoint[];
  notes?: string;
  openingQuantity?: number;
  /** Investment horizon. Defaults to "long". Short-term holdings are
   *  treated as cash-like accounts (lending platforms, savings, broker cash). */
  horizon?: HoldingHorizon;
};

export type RecurrenceFrequency = "weekly" | "monthly" | "yearly";

export type Recurrence = {
  frequency: RecurrenceFrequency;
  /** Optional inclusive end date (ISO). When omitted, recurs until "today". */
  until?: string;
};

export type CashflowEntry = {
  id: string;
  kind: "income" | "expense";
  source: string;
  category: string;
  amount: number;
  /** Currency of `amount`. Defaults to "USD" for legacy entries. */
  currency?: string;
  date: string; // ISO (first occurrence for recurring entries)
  /** When set, this entry repeats on the given cadence starting from `date`. */
  recurrence?: Recurrence;
  /** "fixed" (default) treats `amount` as a money value; "percent" treats
   *  `amount` as a percentage of the base selected via `percentOf`. */
  amountKind?: "fixed" | "percent";
  /** For percent entries: what the percentage is taken from.
   *  - "all-income" (default) - % of total fixed income in scope
   *  - "all-expense" - % of total fixed expenses in scope
   *  - any other string - id of another (fixed) entry to subscribe to */
  percentOf?: "all-income" | "all-expense" | string;
  /** Optional short description / note (max 200 chars). */
  description?: string;
};

/**
 * Categories classify cashflow entries. `kind` controls the cashflow direction
 * (money in vs out), `group` controls coloring and intent (regular expense vs
 * savings vs investment). Both income and expense entries pick a category of
 * their kind.
 */
export type CategoryGroup = "income" | "expense" | "savings" | "investment";

export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  group: CategoryGroup;
  color: string;
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
  transactions: HoldingTransaction[];
  categories: Category[];
  settings: Settings;
};

/** Buy/sell transaction attached to a Holding. When at least one transaction
 *  exists for a holding, the holding's `quantity` is derived as
 *  `sum(buys.quantity) - sum(sells.quantity)`. */
export type HoldingTransaction = {
  id: string;
  holdingId: string;
  kind: "buy" | "sell";
  date: string; // ISO
  quantity: number;
  pricePerUnit: number;
  /** Currency of pricePerUnit and fees. Defaults to the holding's price currency. */
  currency?: string;
  fees?: number;
  notes?: string;
};

/** Default palette per category group. */
export const GROUP_COLORS: Record<CategoryGroup, string> = {
  income: "#22c55e",
  expense: "#ef4444",
  savings: "#0ea5e9",
  investment: "#10b981",
};

export const DEFAULT_CATEGORIES: Category[] = [
  // Income
  { id: "cat-salary", name: "Salary", kind: "income", group: "income", color: "#22c55e" },
  { id: "cat-freelance", name: "Freelance", kind: "income", group: "income", color: "#34d399" },
  { id: "cat-dividends", name: "Dividends", kind: "income", group: "income", color: "#4ade80" },
  { id: "cat-other-income", name: "Other Income", kind: "income", group: "income", color: "#86efac" },
  // Expenses
  { id: "cat-rent", name: "Rent", kind: "expense", group: "expense", color: "#ef4444" },
  { id: "cat-food", name: "Food", kind: "expense", group: "expense", color: "#f97316" },
  { id: "cat-transport", name: "Transport", kind: "expense", group: "expense", color: "#fb7185" },
  { id: "cat-entertainment", name: "Entertainment", kind: "expense", group: "expense", color: "#f59e0b" },
  // Savings / Investments (still outflows from the cash pool)
  { id: "cat-savings", name: "Savings", kind: "expense", group: "savings", color: "#0ea5e9" },
  { id: "cat-investments", name: "Investments", kind: "expense", group: "investment", color: "#10b981" },
];

export const DEFAULT_STATE: AppState = {
  holdings: [],
  cashflows: [],
  transactions: [],
  categories: DEFAULT_CATEGORIES,
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
