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

/** Reference to an account participating in a transfer.
 *  - "liquidity" : the implicit cash pool
 *  - "holding:<id>" : a specific holding (typically short-term / cash-like)
 *  - "credit:<id>" : a credit card */
export type AccountRef = "liquidity" | `holding:${string}` | `credit:${string}`;

/** How a one-off purchase is split. The expense entry stays in the list but
 *  is rendered as N scheduled charges; each occurrence is generated at expand
 *  time, similar to recurrences. */
export type InstallmentPlan = {
  total: number;
  count: number;
  frequency: "weekly" | "monthly";
  firstDueDate: string; // ISO
};

export type CashflowEntry = {
  id: string;
  /** "transfer" moves money between accounts and is excluded from income /
   *  expense totals. */
  kind: "income" | "expense" | "transfer";
  source: string;
  category: string;
  amount: number;
  currency?: string;
  date: string;
  recurrence?: Recurrence;
  amountKind?: "fixed" | "percent";
  percentOf?: "all-income" | "all-expense" | string;
  description?: string;
  /** Expenses only. Defaults to "liquidity". When set to a card, the charge
   *  does not reduce liquidity; it increases the card's balance owed. */
  paymentMethod?: AccountRef;
  /** Transfers only. */
  fromAccount?: AccountRef;
  toAccount?: AccountRef;
  /** Expenses only. When set, the entry expands into N scheduled charges. */
  installmentPlan?: InstallmentPlan;
  /** Transfers only: id(s) of HoldingTransaction(s) auto-created by the
   *  store for this transfer. Used to keep them in sync. */
  linkedTransactionId?: string;
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

export type CreditCard = {
  id: string;
  name: string;
  color: string;
  currency: string;
  /** Day of the month the statement closes (1-31), optional. */
  statementDay?: number;
  /** Day of the month payment is due (1-31), optional. */
  dueDay?: number;
  creditLimit?: number;
};

export type AppState = {
  holdings: Holding[];
  cashflows: CashflowEntry[];
  transactions: HoldingTransaction[];
  categories: Category[];
  creditCards: CreditCard[];
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
  creditCards: [],
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
