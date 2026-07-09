import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SankeyChart } from "@/components/sankey-chart";
import { useStore, useMoney } from "@/lib/store";
import { secureGet, secureSet } from "@/lib/secure-storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader } from "@/components/app-shell";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { ChartFrame } from "@/components/chart-frame";
import { CURRENCIES } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, Plus, Palette, RotateCcw, Settings as SettingsIcon, Pencil, Download, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CategoryPieCard, type PieEntry } from "@/components/category-pie-card";
import { toast } from "sonner";
import { format, startOfWeek, startOfMonth, startOfYear, endOfWeek, endOfMonth, endOfYear, isWithinInterval, parseISO, eachDayOfInterval, addWeeks, addMonths, addYears, subMonths } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/cashflow")({
  head: () => {
    const title = i18n.t("cashflow.metaTitle");
    const desc = i18n.t("cashflow.metaDesc");
    const url = "https://financetracker.putopulse.org/cashflow";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CashflowPage,
});

import { GROUP_COLORS, type Category, type CategoryGroup, type CashflowEntry, type RecurrenceFrequency } from "@/lib/types";
import { CreditCardsManager } from "@/components/credit-cards-manager";

/** Expand recurring cashflow entries into individual occurrences up to `until`.
 *  Each occurrence keeps the original id (with a date suffix) and a `parentId`
 *  pointing to the source entry so the UI can edit/remove the rule. */
export function expandCashflows(entries: CashflowEntry[], until: Date = new Date()): (CashflowEntry & { parentId: string; isOccurrence: boolean })[] {
  const out: (CashflowEntry & { parentId: string; isOccurrence: boolean })[] = [];
  for (const e of entries) {
    // Installment plans expand into N scheduled child charges.
    if (e.installmentPlan && e.kind === "expense") {
      const plan = e.installmentPlan;
      const perCharge = plan.total / Math.max(1, plan.count);
      const start = new Date(plan.firstDueDate);
      for (let i = 0; i < plan.count; i++) {
        const occ = plan.frequency === "weekly" ? addWeeks(start, i) : addMonths(start, i);
        if (occ > until) break;
        out.push({
          ...e,
          id: `${e.id}__inst${i}`,
          amount: perCharge,
          amountKind: "fixed",
          date: occ.toISOString(),
          installmentPlan: undefined,
          parentId: e.id,
          isOccurrence: i > 0,
        });
      }
      continue;
    }
    if (!e.recurrence) {
      out.push({ ...e, parentId: e.id, isOccurrence: false });
      continue;
    }
    const start = new Date(e.date);
    const stop = e.recurrence.until ? new Date(e.recurrence.until) : until;
    const last = stop < until ? stop : until;
    const step =
      e.recurrence.frequency === "weekly"
        ? (d: Date, i: number) => addWeeks(d, i)
        : e.recurrence.frequency === "monthly"
          ? (d: Date, i: number) => addMonths(d, i)
          : (d: Date, i: number) => addYears(d, i);
    let i = 0;
    while (i < 600) {
      const occ = step(start, i);
      if (occ > last) break;
      out.push({
        ...e,
        id: `${e.id}__${occ.toISOString().slice(0, 10)}`,
        date: occ.toISOString(),
        parentId: e.id,
        isOccurrence: i > 0,
      });
      i++;
    }
  }
  return out;
}

/** Signed change to liquidity caused by an expanded cashflow entry, in the
 *  entry's source currency. Use with `toDisplay` to convert. */
export function liquidityImpact(entry: CashflowEntry, valueInDisplay: number): number {
  if (entry.kind === "income") return valueInDisplay;
  if (entry.kind === "expense") {
    const pm = entry.paymentMethod;
    if (pm && pm.startsWith("credit:")) return 0;
    return -valueInDisplay;
  }
  // transfer
  const from = entry.fromAccount;
  const to = entry.toAccount;
  let delta = 0;
  if (from === "liquidity") delta -= valueInDisplay;
  if (to === "liquidity") delta += valueInDisplay;
  return delta;
}

/** Signed change to a specific card's balance owed. */
export function cardDebtImpact(entry: CashflowEntry, cardId: string, valueInDisplay: number): number {
  const ref = `credit:${cardId}` as const;
  if (entry.kind === "expense" && entry.paymentMethod === ref) return valueInDisplay;
  if (entry.kind === "transfer") {
    if (entry.toAccount === ref) return -valueInDisplay; // paying card down
    if (entry.fromAccount === ref) return valueInDisplay; // refund / new debt
  }
  return 0;
}

/** Resolve each entry to its display-currency value.
 *  Percent entries are evaluated against `percentOf`:
 *  - "all-income"  → % of total fixed income in `entries`
 *  - "all-expense" → % of total fixed expense in `entries`
 *  - entry id      → % of that fixed entry's resolved value (0 if missing) */
export function valuesByEntry(
  entries: CashflowEntry[],
  toDisplay: (amount: number, from?: string) => number,
): Map<string, number> {
  // Group entries by month bucket so percent entries resolve against the
  // income/expense of the SAME month, not the entire expansion window
  // (otherwise a 12-month expansion inflates percents 12x).
  const bucketKey = (e: CashflowEntry) => {
    const d = e.date ? new Date(e.date) : null;
    if (!d || Number.isNaN(d.getTime())) return "_";
    return `${d.getFullYear()}-${d.getMonth()}`;
  };
  const fixed = new Map<string, number>();
  const baseIncomeByBucket = new Map<string, number>();
  const baseExpenseByBucket = new Map<string, number>();
  const fixedByParentByBucket = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if ((e.amountKind ?? "fixed") !== "fixed") continue;
    const v = toDisplay(e.amount, e.currency);
    fixed.set(e.id, v);
    const bk = bucketKey(e);
    if (e.kind === "income") baseIncomeByBucket.set(bk, (baseIncomeByBucket.get(bk) ?? 0) + v);
    else if (e.kind === "expense") baseExpenseByBucket.set(bk, (baseExpenseByBucket.get(bk) ?? 0) + v);
    const parentId = (e as CashflowEntry & { parentId?: string }).parentId ?? e.id;
    let bm = fixedByParentByBucket.get(bk);
    if (!bm) { bm = new Map(); fixedByParentByBucket.set(bk, bm); }
    bm.set(parentId, (bm.get(parentId) ?? 0) + v);
  }
  const out = new Map<string, number>();
  for (const e of entries) {
    if ((e.amountKind ?? "fixed") === "percent") {
      const pct = Number(e.amount) / 100;
      const target = e.percentOf ?? "all-income";
      const bk = bucketKey(e);
      let base = 0;
      if (target === "all-income") base = baseIncomeByBucket.get(bk) ?? 0;
      else if (target === "all-expense") base = baseExpenseByBucket.get(bk) ?? 0;
      else {
        const bm = fixedByParentByBucket.get(bk);
        base = bm?.get(target) ?? fixed.get(target) ?? 0;
      }
      out.set(e.id, pct * base);
    } else {
      out.set(e.id, fixed.get(e.id) ?? toDisplay(e.amount, e.currency));
    }
  }
  return out;
}

/** Build a human label for what a percent entry is subscribed to. */
function describePercentOf(
  entry: CashflowEntry,
  cashflows: CashflowEntry[],
): string {
  const target = entry.percentOf ?? "all-income";
  if (target === "all-income") return "all income";
  if (target === "all-expense") return "all expenses";
  const ref = cashflows.find((c) => c.id === target);
  if (!ref) return "(deleted)";
  return ref.kind === "income" ? ref.source || "income" : ref.category || "expense";
}

const POOL_COLOR = "#64748b";
const SAVED_COLOR = "#0ea5e9";

type LabelMode = "always" | "hover" | "off";
const PREF_KEY = "ept_cashflow_sankey_prefs_v1";

type Prefs = {
  labelMode: LabelMode;
  nodeColors: Record<string, string>;
  incomeOrder: string[];
  expenseOrder: string[];
};

const DEFAULT_PREFS: Prefs = {
  labelMode: "always",
  nodeColors: {},
  incomeOrder: [],
  expenseOrder: [],
};

async function loadPrefs(): Promise<Prefs> {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = await secureGet(PREF_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw);
    return {
      labelMode: p.labelMode ?? "always",
      nodeColors: p.nodeColors ?? {},
      incomeOrder: Array.isArray(p.incomeOrder) ? p.incomeOrder : [],
      expenseOrder: Array.isArray(p.expenseOrder) ? p.expenseOrder : [],
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}


function CashflowPage() {
  const { state, addCashflow, updateCashflow, removeCashflow, addCategory, updateCategory, removeCategory } = useStore();
  const { mask, toDisplay, currency, privacy, MASK } = useMoney();
  const { cashflows, categories } = state;
  const { t } = useTranslation();

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    loadPrefs().then((p) => {
      setPrefs(p);
      setPrefsLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    void secureSet(PREF_KEY, JSON.stringify(prefs));
  }, [prefs, prefsLoaded]);


  // Resolve the color/group for a given category name.
  const catByName = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.name, c);
    return m;
  }, [categories]);

  const colorFor = (name: string, fallbackGroup: CategoryGroup) =>
    prefs.nodeColors[name] ?? catByName.get(name)?.color ?? GROUP_COLORS[fallbackGroup];

  // Period selector for the flow diagram. Default to current month so the
  // diagram naturally resets at the start of every month.
  type SankeyPeriod = "week" | "month" | "year" | "all" | "custom";
  const [sankeyPeriod, setSankeyPeriod] = useState<SankeyPeriod>("month");
  const [sankeyFrom, setSankeyFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [sankeyTo, setSankeyTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const sankeyInterval = useMemo(() => {
    const now = new Date();
    switch (sankeyPeriod) {
      case "week":
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "year":
        return { start: startOfYear(now), end: endOfYear(now) };
      case "custom":
        return { start: parseISO(sankeyFrom), end: parseISO(sankeyTo) };
      case "all":
      default:
        return null;
    }
  }, [sankeyPeriod, sankeyFrom, sankeyTo]);

  const sankeyPeriodLabel = useMemo(() => {
    if (!sankeyInterval) return t("more.entriesAllTime");
    return `${format(sankeyInterval.start, "MMM d, yyyy")} – ${format(sankeyInterval.end, "MMM d, yyyy")}`;
  }, [sankeyInterval, t]);

  // Expand recurring entries within the active interval (or up to today for "all").
  const expandedToToday = useMemo(() => {
    const horizon = sankeyInterval
      ? (sankeyInterval.end > new Date() ? sankeyInterval.end : new Date())
      : new Date();
    const all = expandCashflows(cashflows, horizon);
    if (!sankeyInterval) return all;
    return all.filter((c) => isWithinInterval(new Date(c.date), sankeyInterval));
  }, [cashflows, sankeyInterval]);

  const valuesTop = useMemo(() => valuesByEntry(expandedToToday, toDisplay), [expandedToToday, toDisplay]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const c of expandedToToday) {
      const v = valuesTop.get(c.id) ?? 0;
      if (c.kind === "income") income += v;
      else expense += v;
    }
    return { income, expense, net: income - expense };
  }, [expandedToToday, valuesTop]);

  const sankey = useMemo(() => {
    if (!expandedToToday.length) return null;
    const incomes = expandedToToday.filter((c) => c.kind === "income");
    const expenses = expandedToToday.filter((c) => c.kind === "expense");
    const transfers = expandedToToday.filter((c) => c.kind === "transfer");

    const applyOrder = (items: string[], saved: string[]) => {
      const set = new Set(items);
      const ordered = saved.filter((n) => set.has(n));
      const remaining = items.filter((n) => !ordered.includes(n));
      return [...ordered, ...remaining];
    };
    const sources = applyOrder(
      Array.from(new Set(incomes.map((i) => i.source || "Other"))),
      prefs.incomeOrder,
    );
    const cats = applyOrder(
      Array.from(new Set(expenses.map((e) => e.category || "Other"))),
      prefs.expenseOrder,
    );
    const POOL = "Cash Pool";
    const SAVED = "Saved";

    // Resolve account refs to display labels + colors.
    const cardById = new Map(state.creditCards.map((c) => [c.id, c]));
    const holdById = new Map(state.holdings.map((h) => [h.id, h]));
    const baseLabelOf = (ref: string) => {
      if (ref === "liquidity") return POOL;
      if (ref.startsWith("credit:")) {
        const c = cardById.get(ref.slice(7));
        return c ? `💳 ${c.name}` : POOL;
      }
      if (ref.startsWith("holding:")) {
        const h = holdById.get(ref.slice(8));
        return h ? `📈 ${h.symbol || h.name}` : POOL;
      }
      return POOL;
    };
    const colorOf = (ref: string): string => {
      if (ref === "liquidity") return prefs.nodeColors[POOL] ?? POOL_COLOR;
      if (ref.startsWith("credit:"))
        return cardById.get(ref.slice(7))?.color ?? "#f97316";
      if (ref.startsWith("holding:"))
        return holdById.get(ref.slice(8))?.color ?? "#a855f7";
      return POOL_COLOR;
    };

    // Determine if a non-liquidity account is used on both sides (cycle risk).
    const usedAsSource = new Set<string>();
    const usedAsTarget = new Set<string>();
    for (const t of transfers) {
      if (t.fromAccount && t.fromAccount !== "liquidity") usedAsSource.add(t.fromAccount);
      if (t.toAccount && t.toAccount !== "liquidity") usedAsTarget.add(t.toAccount);
    }
    for (const e of expenses) {
      if (e.paymentMethod && e.paymentMethod !== "liquidity") usedAsSource.add(e.paymentMethod);
    }
    const needsSplit = (ref: string) =>
      ref !== "liquidity" && usedAsSource.has(ref) && usedAsTarget.has(ref);
    const nameFor = (ref: string, role: "source" | "target") => {
      if (ref === "liquidity") return POOL;
      const base = baseLabelOf(ref);
      if (!needsSplit(ref)) return base;
      return role === "source" ? `${base} →` : `← ${base}`;
    };

    type NodeMeta = {
      name: string;
      kind: "income" | "pool" | "expense" | "saved" | "account";
      fill: string;
    };
    const nodes: NodeMeta[] = [];
    const pushNode = (n: NodeMeta) => {
      if (!nodes.find((x) => x.name === n.name)) nodes.push(n);
    };

    sources.forEach((s) =>
      pushNode({ name: s, kind: "income", fill: colorFor(s, "income") }),
    );
    pushNode({ name: POOL, kind: "pool", fill: prefs.nodeColors[POOL] ?? POOL_COLOR });

    // Account intermediary nodes (cards / holdings)
    const accountNodes = new Set<string>();
    const registerAccount = (ref: string, role: "source" | "target") => {
      if (ref === "liquidity") return;
      const name = nameFor(ref, role);
      const fill = prefs.nodeColors[name] ?? colorOf(ref);
      pushNode({ name, kind: "account", fill });
      accountNodes.add(name);
    };
    for (const t of transfers) {
      if (t.fromAccount) registerAccount(t.fromAccount, "source");
      if (t.toAccount) registerAccount(t.toAccount, "target");
    }
    for (const e of expenses) {
      if (e.paymentMethod && e.paymentMethod !== "liquidity") {
        registerAccount(e.paymentMethod, "source");
      }
    }

    cats.forEach((c) => {
      const meta = catByName.get(c);
      const group: CategoryGroup = meta?.group ?? "expense";
      pushNode({ name: c, kind: "expense", fill: colorFor(c, group) });
    });

    const idx = (name: string) => nodes.findIndex((n) => n.name === name);
    const links: { source: number; target: number; value: number }[] = [];
    const addLink = (a: string, b: string, v: number) => {
      if (!(v > 0)) return;
      const si = idx(a);
      const ti = idx(b);
      if (si < 0 || ti < 0 || si === ti) return;
      const existing = links.find((l) => l.source === si && l.target === ti);
      if (existing) existing.value += v;
      else links.push({ source: si, target: ti, value: v });
    };

    // Income → pool
    for (const s of sources) {
      const sum = incomes
        .filter((i) => (i.source || "Other") === s)
        .reduce((a, b) => a + (valuesTop.get(b.id) ?? 0), 0);
      addLink(s, POOL, sum);
    }
    // Expenses: pool→cat or card→cat
    for (const e of expenses) {
      const v = valuesTop.get(e.id) ?? 0;
      const cat = e.category || "Other";
      const from =
        e.paymentMethod && e.paymentMethod !== "liquidity"
          ? nameFor(e.paymentMethod, "source")
          : POOL;
      addLink(from, cat, v);
    }
    // Transfers
    for (const t of transfers) {
      const v = valuesTop.get(t.id) ?? 0;
      if (!t.fromAccount || !t.toAccount) continue;
      const from = nameFor(t.fromAccount, "source");
      const to = nameFor(t.toAccount, "target");
      addLink(from, to, v);
    }

    // Saved residue = leftover liquidity after pool outflows.
    const totalIntoPool = incomes.reduce((s, c) => s + (valuesTop.get(c.id) ?? 0), 0)
      + transfers
        .filter((t) => t.toAccount === "liquidity")
        .reduce((s, t) => s + (valuesTop.get(t.id) ?? 0), 0);
    const totalOutOfPool = expenses
      .filter((e) => !e.paymentMethod || e.paymentMethod === "liquidity")
      .reduce((s, c) => s + (valuesTop.get(c.id) ?? 0), 0)
      + transfers
        .filter((t) => t.fromAccount === "liquidity")
        .reduce((s, t) => s + (valuesTop.get(t.id) ?? 0), 0);
    const saved = Math.max(0, totalIntoPool - totalOutOfPool);
    if (saved > 0) {
      pushNode({ name: SAVED, kind: "saved", fill: prefs.nodeColors[SAVED] ?? SAVED_COLOR });
      addLink(POOL, SAVED, saved);
    }

    if (!links.length) return null;
    return { nodes, links };
  }, [expandedToToday, valuesTop, prefs.nodeColors, prefs.incomeOrder, prefs.expenseOrder, catByName, state.creditCards, state.holdings]);



  // Unique node names for the color customizer.
  const colorableNodes = useMemo(() => {
    if (!sankey) return [];
    return sankey.nodes.map((n) => ({ name: n.name, fill: n.fill, kind: n.kind }));
  }, [sankey]);

  function resetColors() {
    setPrefs((p) => ({ ...p, nodeColors: {} }));
  }

  // Options users can subscribe a percent entry to: every fixed (non-percent)
  // cashflow entry, labeled by its source/category.
  const subscribeOptions = useMemo(
    () =>
      cashflows
        .filter((c) => (c.amountKind ?? "fixed") === "fixed" && c.kind !== "transfer")
        .map((c) => ({
          id: c.id,
          kind: c.kind as "income" | "expense",
          label: (c.kind === "income" ? c.source : c.category) || "(unnamed)",
        })),
    [cashflows],
  );

  // Pie breakdown datasets (share the sankey period filter)
  const pieFormat = (v: number) => (privacy ? MASK : formatMoney(v, currency));
  const breakdownData = useMemo(() => {
    const incomes: PieEntry[] = [];
    const expenses: PieEntry[] = [];
    const investments: PieEntry[] = [];
    for (const c of expandedToToday) {
      const v = valuesTop.get(c.id) ?? 0;
      if (v <= 0) continue;
      const cat = catByName.get(c.category);
      const catName = c.category || t("cashflow.unnamed", { defaultValue: "(unnamed)" });
      const entry: PieEntry = {
        id: c.id,
        label: c.description || c.source || catName,
        category: catName,
        amount: v,
        color: cat?.color,
      };
      if (c.kind === "income") {
        incomes.push({ ...entry, category: c.source || catName });
      } else if (c.kind === "expense") {
        const group = cat?.group ?? "expense";
        if (group === "investment" || group === "savings") investments.push(entry);
        else expenses.push(entry);
      }
    }
    return { incomes, expenses, investments };
  }, [expandedToToday, valuesTop, catByName, t]);
  const [breakdownOpen, setBreakdownOpen] = useState(false);


  return (
    <>
      <PageHeader title={t("cashflow.title")} description={t("cashflow.description")} />

      <div className="grid grid-cols-3 gap-2 sm:gap-5">
        <StatCard label={t("cashflow.income")} value={privacy ? MASK : formatMoney(totals.income, currency)} tone="success" />
        <StatCard label={t("cashflow.expenses")} value={privacy ? MASK : formatMoney(totals.expense, currency)} tone="destructive" />
        <StatCard
          label={t("cashflow.net")}
          value={privacy ? MASK : `${totals.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(totals.net), currency)}`}
          tone={totals.net >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
          <AddForm
            defaultCurrency={currency}
            categories={categories}
            subscribeOptions={subscribeOptions}
            onAddCategory={addCategory}
            onUpdateCategory={updateCategory}
            onRemoveCategory={removeCategory}
            onAdd={(e) => {
              addCashflow(e as unknown as Omit<CashflowEntry, "id">);
              toast.success(
                e.kind === "income"
                  ? t("cashflow.incomeAdded")
                  : e.kind === "expense"
                    ? t("cashflow.expenseAdded")
                    : t("cashflow.transferAdded"),
              );
            }}
          />
          </div>
          <div data-tour="cf-cards"><CreditCardsManager /></div>
        </div>


        <Card className="border-border/60 min-w-0">
          <CardHeader className="px-3 sm:px-6 flex flex-row items-start justify-between gap-3 space-y-0" data-tour="cf-sankey">
            <div className="min-w-0">
              <CardTitle>{t("cashflow.flow")}</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground truncate">{sankeyPeriodLabel}</div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Select value={sankeyPeriod} onValueChange={(v) => setSankeyPeriod(v as SankeyPeriod)}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">{t("more.entriesThisWeek")}</SelectItem>
                  <SelectItem value="month">{t("more.entriesThisMonth")}</SelectItem>
                  <SelectItem value="year">{t("more.entriesThisYear")}</SelectItem>
                  <SelectItem value="all">{t("more.entriesAllTime")}</SelectItem>
                  <SelectItem value="custom">{t("more.entriesCustomRange")}</SelectItem>
                </SelectContent>
              </Select>
              {sankeyPeriod === "custom" && (
                <div className="flex gap-1">
                  <Input type="date" className="h-8 w-[130px] text-xs" value={sankeyFrom} onChange={(e) => setSankeyFrom(e.target.value)} />
                  <Input type="date" className="h-8 w-[130px] text-xs" value={sankeyTo} onChange={(e) => setSankeyTo(e.target.value)} />
                </div>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("cashflow.resetLastMonth", { defaultValue: "Reset last month" })}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("cashflow.resetLastMonthTitle", { defaultValue: "Delete last month's entries?" })}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("cashflow.resetLastMonthDesc", {
                        defaultValue: "This permanently removes every cashflow entry dated in {{range}}. Recurring rules are kept.",
                        range: `${format(startOfMonth(subMonths(new Date(), 1)), "MMM d, yyyy")} – ${format(endOfMonth(subMonths(new Date(), 1)), "MMM d, yyyy")}`,
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        const lastMonthStart = startOfMonth(subMonths(new Date(), 1));
                        const lastMonthEnd = endOfMonth(subMonths(new Date(), 1));
                        const ids = cashflows
                          .filter((c) => {
                            const d = new Date(c.date);
                            return isWithinInterval(d, { start: lastMonthStart, end: lastMonthEnd });
                          })
                          .map((c) => c.id);
                        ids.forEach((id) => removeCashflow(id));
                        toast.success(
                          t("cashflow.resetLastMonthDone", {
                            defaultValue: "Removed {{count}} entries",
                            count: ids.length,
                          }),
                        );
                      }}
                    >
                      {t("common.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ChartFrame
              filename="cashflow"
              title={t("cashflow.title")}
              extras={
                <SankeyControls
                  prefs={prefs}
                  setPrefs={setPrefs}
                  nodes={colorableNodes}
                  resetColors={resetColors}
                />
              }
            >
              <div className="min-h-80 sm:min-h-96 w-full overflow-hidden">
                {sankey ? (
                  <SankeyChart
                    data={sankey}
                    labelMode={prefs.labelMode}
                    format={(v: number) => (privacy ? MASK : formatMoney(v, currency))}
                    onReorder={(kind, names) =>
                      setPrefs((p) => ({
                        ...p,
                        ...(kind === "income"
                          ? { incomeOrder: names }
                          : { expenseOrder: names }),
                      }))
                    }
                  />
                ) : (
                  <div className="grid h-80 place-items-center text-sm text-muted-foreground">
                    {t("cashflow.emptyFlow")}
                  </div>
                )}
              </div>

            </ChartFrame>
          </CardContent>
        </Card>
      </div>

      <Collapsible open={breakdownOpen} onOpenChange={setBreakdownOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span>{t("cashflow.breakdown.title", { defaultValue: "Breakdown by category" })}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${breakdownOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="grid gap-3 md:grid-cols-3">
            <CategoryPieCard
              title={t("cashflow.breakdown.incomes", { defaultValue: "Incomes" })}
              entries={breakdownData.incomes}
              format={pieFormat}
            />
            <CategoryPieCard
              title={t("cashflow.breakdown.expenses", { defaultValue: "Expenses" })}
              entries={breakdownData.expenses}
              format={pieFormat}
            />
            <CategoryPieCard
              title={t("cashflow.breakdown.investments", { defaultValue: "Investments & Savings" })}
              entries={breakdownData.investments}
              format={pieFormat}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div>

      <EntriesPanel
        cashflows={cashflows}
        categories={categories}
        subscribeOptions={subscribeOptions}
        currency={currency}
        privacy={privacy}
        MASK={MASK}
        mask={mask}
        toDisplay={toDisplay}
        onRemove={removeCashflow}
        onUpdate={updateCashflow}
      />
      </div>
    </>
  );
}

/* ---------- Entries panel: filters, chart, table, PDF export ---------- */

type PeriodKey = "all" | "week" | "month" | "year" | "custom";

function EntriesPanel({
  cashflows,
  categories,
  subscribeOptions,
  currency,
  privacy,
  MASK,
  mask,
  toDisplay,
  onRemove,
  onUpdate,
}: {
  cashflows: import("@/lib/types").CashflowEntry[];
  categories: Category[];
  subscribeOptions: { id: string; kind: "income" | "expense"; label: string }[];
  currency: string;
  privacy: boolean;
  MASK: string;
  mask: (amount: number, from?: string) => string;
  toDisplay: (amount: number, from?: string) => number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<import("@/lib/types").CashflowEntry>) => void;
}) {
  const { t } = useTranslation();
  const { state: storeState2 } = useStore();
  const holdings = storeState2.holdings;
  const creditCards = storeState2.creditCards ?? [];
  const labelAccount = (ref?: string): string => {
    if (!ref) return "?";
    if (ref === "liquidity") return "Liquidity";
    if (ref.startsWith("holding:")) {
      const id = ref.slice("holding:".length);
      const h = holdings.find((x) => x.id === id);
      return h ? `${h.symbol || h.name}` : "Holding";
    }
    if (ref.startsWith("credit:")) {
      const id = ref.slice("credit:".length);
      const c = creditCards.find((x) => x.id === id);
      return c ? c.name : "Card";
    }
    return ref;
  };
  const [editing, setEditing] = useState<import("@/lib/types").CashflowEntry | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "income" | "expense">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const interval = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "week":
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "year":
        return { start: startOfYear(now), end: endOfYear(now) };
      case "custom":
        return { start: parseISO(customFrom), end: parseISO(customTo) };
      case "all":
      default:
        return null;
    }
  }, [period, customFrom, customTo]);

  const periodLabel = useMemo(() => {
    if (!interval) return "All time";
    return `${format(interval.start, "MMM d, yyyy")} – ${format(interval.end, "MMM d, yyyy")}`;
  }, [interval]);

  // Expand recurring entries up to the end of the active interval (or today).
  const expanded = useMemo(() => {
    const horizon = interval ? (interval.end > new Date() ? interval.end : new Date()) : new Date();
    return expandCashflows(cashflows, horizon);
  }, [cashflows, interval]);

  const filtered = useMemo(() => {
    return expanded.filter((c) => {
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      const name = c.kind === "income" ? c.source : c.category;
      if (categoryFilter !== "all" && name !== categoryFilter) return false;
      if (interval) {
        const d = new Date(c.date);
        if (!isWithinInterval(d, interval)) return false;
      }
      return true;
    });
  }, [expanded, kindFilter, categoryFilter, interval]);

  // Available categories for current kind filter
  const availableCategories = useMemo(() => {
    const list = kindFilter === "all" ? categories : categories.filter((c) => c.kind === kindFilter);
    return list;
  }, [categories, kindFilter]);

  useEffect(() => {
    if (categoryFilter !== "all" && !availableCategories.find((c) => c.name === categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [availableCategories, categoryFilter]);

  // Resolve display values for entries in scope (percent entries use scope income as base).
  const values = useMemo(() => valuesByEntry(filtered, toDisplay), [filtered, toDisplay]);

  // Chart series: cumulative net balance, varying with income (+) and expenses (-).
  // Each point keeps the day's entries so the tooltip can show sources/categories.
  const chartData = useMemo(() => {
    if (!filtered.length) return [];
    const start = interval?.start ?? new Date(Math.min(...filtered.map((c) => +new Date(c.date))));
    const end = interval?.end ?? new Date(Math.max(...filtered.map((c) => +new Date(c.date))));
    const days = eachDayOfInterval({ start, end });
    type Entry = { name: string; kind: "income" | "expense"; value: number };
    const byDay = new Map<string, { income: number; expense: number; entries: Entry[] }>();
    for (const d of days) byDay.set(format(d, "yyyy-MM-dd"), { income: 0, expense: 0, entries: [] });
    for (const c of filtered) {
      if (c.kind === "transfer") continue;
      const key = format(new Date(c.date), "yyyy-MM-dd");
      const bucket = byDay.get(key) ?? { income: 0, expense: 0, entries: [] };
      const v = values.get(c.id) ?? 0;
      if (c.kind === "income") bucket.income += v;
      else bucket.expense += v;
      bucket.entries.push({
        name: (c.kind === "income" ? c.source : c.category) || "Other",
        kind: c.kind as "income" | "expense",
        value: +v.toFixed(2),
      });
      byDay.set(key, bucket);
    }
    let cum = 0;
    return Array.from(byDay.entries()).map(([date, v]) => {
      const delta = v.income - v.expense;
      cum += delta;
      return {
        date,
        label: format(parseISO(date), "MMM d"),
        balance: +cum.toFixed(2),
        income: +v.income.toFixed(2),
        expense: +v.expense.toFixed(2),
        delta: +delta.toFixed(2),
        entries: v.entries,
      };
    });
  }, [filtered, interval, values]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const c of filtered) {
      const v = values.get(c.id) ?? 0;
      if (c.kind === "income") income += v;
      else expense += v;
    }
    return { income, expense, net: income - expense };
  }, [filtered, values]);

  function exportPdf() {
    if (!filtered.length) {
      toast.error("No entries in selected range");
      return;
    }
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;

    // Header
    doc.setFontSize(18);
    doc.text("Cashflow Report", margin, 50);
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`Period: ${periodLabel}`, margin, 68);
    const filterDesc = `Type: ${kindFilter} · Category: ${categoryFilter} · Currency: ${currency}`;
    doc.text(filterDesc, margin, 82);

    // Summary
    doc.setTextColor(0);
    doc.setFontSize(11);
    const sumY = 110;
    doc.text(`Income: ${formatMoney(totals.income, currency)}`, margin, sumY);
    doc.text(`Expenses: ${formatMoney(totals.expense, currency)}`, margin + 180, sumY);
    doc.text(
      `Net: ${totals.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(totals.net), currency)}`,
      margin + 360,
      sumY,
    );

    // Line chart (manual draw)
    const chartTop = 135;
    const chartH = 200;
    const chartW = pageW - margin * 2;
    const chartLeft = margin;
    const chartBottom = chartTop + chartH;

    // axes
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(chartLeft, chartBottom, chartLeft + chartW, chartBottom);
    doc.line(chartLeft, chartTop, chartLeft, chartBottom);

    if (chartData.length > 0) {
      const minBal = Math.min(0, ...chartData.map((d) => d.balance));
      const maxBal = Math.max(0, ...chartData.map((d) => d.balance));
      const range = Math.max(1, maxBal - minBal);
      const xStep = chartData.length > 1 ? chartW / (chartData.length - 1) : 0;
      const yFor = (v: number) => chartBottom - ((v - minBal) / range) * (chartH - 10);

      // Y-axis ticks
      doc.setFontSize(8);
      doc.setTextColor(140);
      for (let i = 0; i <= 4; i++) {
        const v = minBal + (range / 4) * i;
        const y = yFor(v);
        doc.setDrawColor(235);
        doc.line(chartLeft, y, chartLeft + chartW, y);
        doc.text(formatMoney(v, currency, { compact: true }), chartLeft - 4, y + 3, { align: "right" });
      }

      // Balance line - green when >= 0, red when < 0 (split at zero crossings)
      const GREEN: [number, number, number] = [34, 197, 94];
      const RED: [number, number, number] = [239, 68, 68];
      doc.setLineWidth(1.4);
      for (let i = 0; i < chartData.length - 1; i++) {
        const x1 = chartLeft + i * xStep;
        const x2 = chartLeft + (i + 1) * xStep;
        const v1 = chartData[i].balance;
        const v2 = chartData[i + 1].balance;
        const y1 = yFor(v1);
        const y2 = yFor(v2);
        if ((v1 >= 0 && v2 >= 0) || (v1 < 0 && v2 < 0)) {
          const c = v1 >= 0 ? GREEN : RED;
          doc.setDrawColor(c[0], c[1], c[2]);
          doc.line(x1, y1, x2, y2);
        } else {
          const t = Math.abs(v1) / (Math.abs(v1) + Math.abs(v2));
          const xm = x1 + (x2 - x1) * t;
          const ym = yFor(0);
          const c1 = v1 >= 0 ? GREEN : RED;
          const c2 = v2 >= 0 ? GREEN : RED;
          doc.setDrawColor(c1[0], c1[1], c1[2]);
          doc.line(x1, y1, xm, ym);
          doc.setDrawColor(c2[0], c2[1], c2[2]);
          doc.line(xm, ym, x2, y2);
        }
      }

      // X-axis labels (sparse)
      const step = Math.max(1, Math.ceil(chartData.length / 6));
      doc.setTextColor(140);
      for (let i = 0; i < chartData.length; i += step) {
        const x = chartLeft + i * xStep;
        doc.text(chartData[i].label, x, chartBottom + 12, { align: "center" });
      }

      // Legend
      doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
      doc.rect(chartLeft, chartTop - 14, 8, 8, "F");
      doc.setTextColor(80);
      doc.text("Balance \u2265 0", chartLeft + 12, chartTop - 8);
      doc.setFillColor(RED[0], RED[1], RED[2]);
      doc.rect(chartLeft + 90, chartTop - 14, 8, 8, "F");
      doc.text("Balance < 0", chartLeft + 102, chartTop - 8);
    }

    // Table
    const rows = [...filtered]
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))
      .map((c) => {
        const isPct = (c.amountKind ?? "fixed") === "percent";
        const amountText = isPct
          ? `${c.amount}% of ${describePercentOf(c, cashflows)}`
          : formatMoney(c.amount, (c.currency || currency).toUpperCase());
        return [
          format(new Date(c.date), "yyyy-MM-dd"),
          c.kind,
          c.kind === "income" ? c.source : c.category,
          amountText,
          formatMoney(values.get(c.id) ?? 0, currency),
        ];
      });

    autoTable(doc, {
      startY: chartBottom + 40,
      head: [["Date", "Type", "Source / Category", "Amount", `In ${currency}`]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const type = String((data.row.raw as unknown as unknown[])?.[1] ?? "");
        if (type === "income") {
          data.cell.styles.textColor = [22, 163, 74];
        } else if (type === "expense") {
          data.cell.styles.textColor = [220, 38, 38];
        }
      },
      margin: { left: margin, right: margin },
    });

    const fname = `cashflow_${period}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`;
    doc.save(fname);
    toast.success(t("more.entriesPdfExported"));
  }

  return (
    <Card className="border-border/60 mt-5">
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-2 flex-wrap" data-tour="cf-entries">
        <CardTitle>{t("cashflow.entries")}</CardTitle>
        <Button size="sm" variant="outline" onClick={exportPdf} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> {t("cashflow.exportPdf")}
        </Button>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <div>
            <Label className="text-xs">{t("more.entriesFiltersType")}</Label>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
              <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("more.entriesAll")}</SelectItem>
                <SelectItem value="income">{t("more.entriesIncome")}</SelectItem>
                <SelectItem value="expense">{t("more.entriesExpense")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("more.entriesFiltersCategory")}</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("more.entriesAllCategories")}</SelectItem>
                {availableCategories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("more.entriesFiltersPeriod")}</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">{t("more.entriesThisWeek")}</SelectItem>
                <SelectItem value="month">{t("more.entriesThisMonth")}</SelectItem>
                <SelectItem value="year">{t("more.entriesThisYear")}</SelectItem>
                <SelectItem value="all">{t("more.entriesAllTime")}</SelectItem>
                <SelectItem value="custom">{t("more.entriesCustomRange")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t("more.entriesFiltersFrom")}</Label>
                <Input type="date" className="h-9 mt-1.5" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t("more.entriesFiltersTo")}</Label>
                <Input type="date" className="h-9 mt-1.5" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </div>
          )}
        </div>


        {/* Summary chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
          <span className="rounded-md bg-muted/50 px-2 py-1">{periodLabel}</span>
          <span className="rounded-md bg-success/15 text-success px-2 py-1">
            {t("more.entriesIncomeLabel")}: {privacy ? MASK : formatMoney(totals.income, currency)}
          </span>
          <span className="rounded-md bg-destructive/15 text-destructive px-2 py-1">
            {t("more.entriesExpensesLabel")}: {privacy ? MASK : formatMoney(totals.expense, currency)}
          </span>
          <span className={`rounded-md px-2 py-1 ${totals.net >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
            {t("more.entriesNetLabel")}: {privacy ? MASK : `${totals.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(totals.net), currency)}`}
          </span>
          <span className="ml-auto">{t("more.entriesCount", { count: filtered.length })}</span>
        </div>


        {/* Evolution chart */}
        {chartData.length > 0 ? (
          <div className="h-56 w-full mb-4">
            <ResponsiveContainer width="100%" height="100%">
              {(() => {
                const values = chartData.map((d) => d.balance);
                const min = Math.min(0, ...values);
                const max = Math.max(0, ...values);
                // Offset in 0..1 where y=0 crosses (top=0, bottom=1).
                const zeroOffset = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);
                const gradId = "balanceGrad";
                return (
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#22c55e" />
                        <stop offset={zeroOffset} stopColor="#22c55e" />
                        <stop offset={zeroOffset} stopColor="#ef4444" />
                        <stop offset="1" stopColor="#ef4444" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#e5e7eb" }} stroke="#e5e7eb" strokeOpacity={0.5} minTickGap={20} />
                    <YAxis tick={{ fontSize: 11, fill: "#e5e7eb" }} stroke="#e5e7eb" strokeOpacity={0.5} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} width={70} />
                    <ReferenceLine y={0} stroke="#e5e7eb" strokeOpacity={0.4} strokeDasharray="2 2" />
                    <RTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload as (typeof chartData)[number];
                        return (
                          <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                            <div className="font-medium text-foreground">{d.label}</div>
                            <div className="mt-1 text-muted-foreground">
                              {t("more.entriesBalance")}:{" "}
                              <span className={`font-medium tabular-nums ${d.balance >= 0 ? "text-success" : "text-destructive"}`}>
                                {privacy ? MASK : formatMoney(d.balance, currency)}
                              </span>
                            </div>
                            {d.entries.length > 0 ? (
                              <div className="mt-1.5 space-y-0.5">
                                {d.entries.map((e, i) => (
                                  <div key={i} className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-1.5">
                                      <span
                                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                                          e.kind === "income"
                                            ? "bg-success"
                                            : e.kind === "expense"
                                              ? "bg-destructive"
                                              : "bg-muted-foreground"
                                        }`}
                                      />
                                      <span className="text-foreground">{e.name}</span>
                                    </span>
                                    <span
                                      className={`tabular-nums ${
                                        e.kind === "income"
                                          ? "text-success"
                                          : e.kind === "expense"
                                            ? "text-destructive"
                                            : "text-muted-foreground"
                                      }`}
                                    >
                                      {e.kind === "income" ? "+" : e.kind === "expense" ? "−" : "↔"}
                                      {privacy ? MASK : formatMoney(e.value, currency)}
                                    </span>

                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-1 text-muted-foreground italic">{t("more.entriesNoActivity")}</div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      stroke={`url(#${gradId})`}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      name={t("more.entriesBalance")}
                    />
                  </LineChart>
                );
              })()}
            </ResponsiveContainer>
          </div>

        ) : (
          <div className="h-32 grid place-items-center text-sm text-muted-foreground border border-dashed border-border/50 rounded-md mb-4">
            {t("more.entriesNoChart")}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{t("more.entriesEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground [&>th]:px-3 [&>th]:py-2">
                  <th>{t("more.entriesDate")}</th>
                  <th>{t("more.entriesType")}</th>
                  <th>{t("more.entriesSourceCategory")}</th>
                  <th className="text-right">{t("more.entriesAmount")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 [&>tr>td]:px-3">
                {[...filtered]
                  .sort((a, b) => +new Date(b.date) - +new Date(a.date))
                  .map((c) => {
                    const parent = cashflows.find((p) => p.id === c.parentId) ?? null;
                    const recurring = !!parent?.recurrence;
                    return (
                      <tr key={c.id}>
                        <td className="py-2.5 text-muted-foreground">
                          {format(new Date(c.date), "MMM d, yyyy")}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                c.kind === "income"
                                  ? "bg-success/15 text-success"
                                  : c.kind === "expense"
                                    ? "bg-destructive/15 text-destructive"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {c.kind === "income" ? t("more.entriesIncome") : c.kind === "expense" ? t("more.entriesExpense") : c.kind}
                            </span>
                            {c.kind === "expense" && c.paymentMethod?.startsWith("credit:") && (
                              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-500">
                                💳
                              </span>
                            )}
                            {c.installmentPlan && (
                              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-500">
                                {c.installmentPlan.count}× {c.installmentPlan.frequency}
                              </span>
                            )}
                            {recurring && (
                              <span
                                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                title={`Recurs ${parent?.recurrence?.frequency}`}
                              >
                                ↻ {parent?.recurrence?.frequency}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div>
                            {c.kind === "transfer"
                              ? `${labelAccount(c.fromAccount)} → ${labelAccount(c.toAccount)}`
                              : c.kind === "income"
                                ? c.source
                                : c.category}
                          </div>
                          {c.description && (
                            <div className="text-[11px] text-muted-foreground truncate max-w-[28ch]" title={c.description}>
                              {c.description}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 text-right tabular-nums font-medium">
                          {(() => {
                            const isPct = (c.amountKind ?? "fixed") === "percent";
                            const computed = values.get(c.id) ?? 0;
                            if (privacy) return MASK;
                            if (isPct) {
                              return (
                                <>
                                  {c.amount}%
                                  <span className="ml-1 text-[10px] text-muted-foreground normal-case">
                                    of {describePercentOf(c, cashflows)}
                                  </span>
                                  <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                                    ≈ {formatMoney(computed, currency)}
                                  </span>
                                </>
                              );
                            }
                            return (
                              <>
                                {formatMoney(c.amount, (c.currency || currency).toUpperCase())}
                                {c.currency && c.currency.toUpperCase() !== currency && (
                                  <span
                                    className="ml-1.5 text-[10px] uppercase text-muted-foreground"
                                    title={`≈ ${mask(c.amount, c.currency)} in ${currency}`}
                                  >
                                    ≈ {mask(c.amount, c.currency)}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => parent && setEditing(parent)}
                              aria-label={t("more.entriesEditAria")}
                              disabled={!parent}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                if (!parent) return;
                                if (
                                  parent.recurrence &&
                                  !confirm(t("more.entriesDeleteRecurringConfirm"))
                                )
                                  return;
                                onRemove(parent.id);
                              }}
                              aria-label={t("more.entriesDeleteAria")}
                              disabled={!parent}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <EditEntryDialog
        entry={editing}
        categories={categories}
        subscribeOptions={subscribeOptions}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (editing) onUpdate(editing.id, patch);
          setEditing(null);
          toast.success(t("more.entriesUpdated"));
        }}
      />
    </Card>
  );
}

function EditEntryDialog({
  entry,
  categories,
  subscribeOptions,
  onClose,
  onSave,
}: {
  entry: import("@/lib/types").CashflowEntry | null;
  categories: Category[];
  subscribeOptions: { id: string; kind: "income" | "expense"; label: string }[];
  onClose: () => void;
  onSave: (patch: Partial<import("@/lib/types").CashflowEntry>) => void;
}) {
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [entryCurrency, setEntryCurrency] = useState("USD");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [until, setUntil] = useState("");
  const [isPercent, setIsPercent] = useState(false);
  const [percentOf, setPercentOf] = useState<string>("all-income");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!entry) return;
    if (entry.kind === "transfer") return;
    setKind(entry.kind);
    setName(entry.kind === "income" ? entry.source : entry.category);
    setAmount(String(entry.amount));
    setEntryCurrency(entry.currency || "USD");
    setDate(format(new Date(entry.date), "yyyy-MM-dd"));
    setRecurring(!!entry.recurrence);
    setFrequency(entry.recurrence?.frequency ?? "monthly");
    setUntil(entry.recurrence?.until ? format(new Date(entry.recurrence.until), "yyyy-MM-dd") : "");
    setIsPercent((entry.amountKind ?? "fixed") === "percent");
    setPercentOf(entry.percentOf ?? "all-income");
    setDescription(entry.description ?? "");
  }, [entry]);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  );

  function submit() {
    const a = parseFloat(amount);
    if (!isFinite(a) || a <= 0) return toast.error("Amount must be > 0");
    if (isPercent && a > 1000) return toast.error("Percentage looks too high");
    if (!name.trim()) return toast.error("Pick a category");
    onSave({
      kind,
      source: kind === "income" ? name : "",
      category: kind === "expense" ? name : "",
      amount: a,
      currency: entryCurrency,
      date: new Date(date).toISOString(),
      recurrence: recurring
        ? { frequency, ...(until ? { until: new Date(until).toISOString() } : {}) }
        : undefined,
      amountKind: isPercent ? "percent" : "fixed",
      percentOf: isPercent ? percentOf : undefined,
      description: description.trim().slice(0, 200) || undefined,
    });
  }

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit entry</DialogTitle>
          <DialogDescription>Update the details for this cashflow entry.</DialogDescription>
        </DialogHeader>
        <Tabs value={kind} onValueChange={(v) => setKind(v as "income" | "expense")}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="expense">Expense</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{kind === "income" ? "Source" : "Category"}</Label>
            <Select value={name} onValueChange={setName}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {visibleCategories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
                {name && !visibleCategories.find((c) => c.name === name) && (
                  <SelectItem value={name}>{name}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPercent}
              onChange={(e) => setIsPercent(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Use a percentage of another entry (e.g. taxes)</span>
          </label>
          {isPercent && (
            <div>
              <Label className="text-xs">Percent of</Label>
              <PercentTargetPicker
                value={percentOf}
                onChange={setPercentOf}
                options={subscribeOptions}
                excludeId={entry?.id}
                className="mt-1.5"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{isPercent ? "Percent" : "Amount"}</Label>
              <div className="relative mt-1.5">
                <Input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={isPercent ? "pr-8" : ""}
                />
                {isPercent && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                )}
              </div>
            </div>
            {!isPercent && (
              <div>
                <Label className="text-xs">Currency</Label>
                <Select value={entryCurrency} onValueChange={setEntryCurrency}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">{recurring ? "Start date" : "Date"}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input
              type="text"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note"
              className="mt-1.5"
            />
          </div>
          <div className="rounded-md border border-border/60 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4"
              />
              <span>Repeats</span>
            </label>
            {recurring && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Until (optional)</Label>
                  <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1.5" />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SankeyControls({
  prefs,
  setPrefs,
  nodes,
  resetColors,
}: {
  prefs: Prefs;
  setPrefs: (updater: (p: Prefs) => Prefs) => void;
  nodes: { name: string; fill: string; kind: string }[];
  resetColors: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={prefs.labelMode}
        onValueChange={(v) => setPrefs((p) => ({ ...p, labelMode: v as LabelMode }))}
      >
        <SelectTrigger className="h-8 w-[96px] sm:w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="always">{t("more.skLabelsAlways")}</SelectItem>
          <SelectItem value="hover">{t("more.skLabelsHover")}</SelectItem>
          <SelectItem value="off">{t("more.skLabelsOff")}</SelectItem>
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            title={t("more.skCustomizeColors")}
            aria-label={t("more.skCustomizeColors")}
            disabled={nodes.length === 0}
          >
            <Palette className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">{t("more.skNodeColors")}</div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={resetColors}
            >
              <RotateCcw className="h-3 w-3" /> {t("more.skReset")}
            </Button>
          </div>
          <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {nodes.map((n) => (
              <label
                key={n.name}
                className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5"
              >
                <span className="truncate text-xs">{n.name}</span>
                <input
                  type="color"
                  value={n.fill}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      nodeColors: { ...p.nodeColors, [n.name]: e.target.value },
                    }))
                  }
                  className="h-6 w-8 cursor-pointer rounded border border-border/60 bg-transparent p-0"
                />
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "destructive";
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-3 sm:p-5">
        <div className="text-[10px] sm:text-xs uppercase tracking-wider sm:normal-case sm:tracking-normal text-muted-foreground">{label}</div>
        <div
          className={`mt-1 sm:mt-2 text-base sm:text-2xl font-semibold tracking-tight truncate ${
            tone === "success" ? "text-success" : "text-destructive"
          }`}
          title={value}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

type FormVals = {
  kind: "income" | "expense" | "transfer";
  source: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  recurrence?: { frequency: RecurrenceFrequency; until?: string };
  amountKind?: "fixed" | "percent";
  percentOf?: "all-income" | "all-expense" | string;
  description?: string;
  paymentMethod?: string;
  fromAccount?: string;
  toAccount?: string;
  installmentPlan?: { total: number; count: number; frequency: "weekly" | "monthly"; firstDueDate: string };
};

function AddForm({
  onAdd,
  defaultCurrency,
  categories,
  subscribeOptions,
  onAddCategory,
  onUpdateCategory,
  onRemoveCategory,
}: {
  onAdd: (e: FormVals) => void;
  defaultCurrency: string;
  categories: Category[];
  subscribeOptions: { id: string; kind: "income" | "expense"; label: string }[];
  onAddCategory: (c: Omit<Category, "id">) => Category;
  onUpdateCategory: (id: string, patch: Partial<Category>) => void;
  onRemoveCategory: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { state: storeState } = useStore();
  const holdings = storeState.holdings;
  const creditCards = storeState.creditCards ?? [];
  const accountOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "liquidity", label: t("cashflow.liquidityCash") }];
    for (const h of holdings) opts.push({ value: `holding:${h.id}`, label: `${t("cashflow.holdingPrefix")} · ${h.symbol || h.name}` });
    for (const c of creditCards) opts.push({ value: `credit:${c.id}`, label: `${t("cashflow.cardPrefix")} · ${c.name}` });
    return opts;
  }, [holdings, creditCards, t]);

  const [kind, setKind] = useState<"income" | "expense" | "transfer">("income");
  const [categoryName, setCategoryName] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [entryCurrency, setEntryCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [until, setUntil] = useState("");
  const [isPercent, setIsPercent] = useState(false);
  const [percentOf, setPercentOf] = useState<string>("all-income");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("liquidity");
  const [useInstallments, setUseInstallments] = useState(false);
  const [instCount, setInstCount] = useState("4");
  const [instFreq, setInstFreq] = useState<"weekly" | "monthly">("monthly");
  const [instStart, setInstStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [fromAccount, setFromAccount] = useState<string>("liquidity");
  const [toAccount, setToAccount] = useState<string>(accountOptions[1]?.value ?? "liquidity");

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === (kind === "transfer" ? "expense" : kind)),
    [categories, kind],
  );

  useEffect(() => {
    if (kind === "transfer") return;
    if (!visibleCategories.find((c) => c.name === categoryName)) {
      setCategoryName(visibleCategories[0]?.name ?? "");
    }
  }, [visibleCategories, categoryName, kind]);

  function submit() {
    const a = parseFloat(amount);
    if (!isFinite(a) || a <= 0) return toast.error(t("cashflow.amountGtZero"));
    if (isPercent && a > 1000) return toast.error(t("cashflow.percentTooHigh"));
    const desc = description.trim().slice(0, 200);

    if (kind === "transfer") {
      if (!fromAccount || !toAccount) return toast.error(t("cashflow.pickBothAccounts"));
      if (fromAccount === toAccount) return toast.error(t("cashflow.accountsMustDiffer"));
      onAdd({
        kind: "transfer",
        source: "",
        category: "Transfer",
        amount: a,
        currency: entryCurrency,
        date: new Date(date).toISOString(),
        fromAccount,
        toAccount,
        description: desc || undefined,
      });
      setAmount("");
      setDescription("");
      return;
    }

    if (!categoryName.trim()) return toast.error(t("cashflow.pickCategory"));
    const installmentPlan =
      kind === "expense" && useInstallments && !isPercent
        ? {
            total: a,
            count: Math.max(1, Math.min(120, parseInt(instCount) || 1)),
            frequency: instFreq,
            firstDueDate: new Date(instStart).toISOString(),
          }
        : undefined;
    onAdd({
      kind,
      source: kind === "income" ? categoryName : "",
      category: kind === "expense" ? categoryName : "",
      amount: a,
      currency: entryCurrency,
      date: new Date(date).toISOString(),
      recurrence: recurring && !installmentPlan
        ? { frequency, ...(until ? { until: new Date(until).toISOString() } : {}) }
        : undefined,
      amountKind: isPercent ? "percent" : "fixed",
      percentOf: isPercent ? percentOf : undefined,
      description: desc || undefined,
      paymentMethod: kind === "expense" ? paymentMethod : undefined,
      installmentPlan,
    });
    setAmount("");
    setDescription("");
  }

  const submitLabel =
    kind === "transfer"
      ? t("cashflow.addTransferBtn")
      : kind === "income"
        ? recurring && !useInstallments
          ? t("cashflow.addRecurringIncome")
          : t("cashflow.addIncomeBtn")
        : useInstallments
          ? t("cashflow.addFinancedExpense")
          : recurring
            ? t("cashflow.addRecurringExpense")
            : t("cashflow.addExpenseBtn");

  return (
    <Card className="border-border/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-2 flex-wrap" data-tour="cf-add">
        <CardTitle>{t("cashflow.addEntry")}</CardTitle>
        <CategoriesManager
          categories={categories}
          onAdd={onAddCategory}
          onUpdate={onUpdateCategory}
          onRemove={onRemoveCategory}
        />
      </CardHeader>
      <CardContent>
        <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="income">{t("cashflow.income")}</TabsTrigger>
            <TabsTrigger value="expense">{t("cashflow.expense")}</TabsTrigger>
            <TabsTrigger value="transfer">{t("cashflow.transferTab")}</TabsTrigger>
          </TabsList>
          {kind !== "transfer" ? (
            <TabsContent value={kind} className="mt-4 space-y-3">
              <Field label={kind === "income" ? t("cashflow.source") : t("common.category")}>
                <CategoryPicker
                  kind={kind}
                  value={categoryName}
                  onChange={setCategoryName}
                  categories={visibleCategories}
                  onCreate={(c) => {
                    const created = onAddCategory(c);
                    setCategoryName(created.name);
                  }}
                />
              </Field>
              {sharedFields()}
              <Field label={t("cashflow.descriptionLabel")}>
                <Input
                  type="text"
                  maxLength={200}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("cashflow.descriptionPlaceholder")}
                />
              </Field>
              {kind === "expense" && (
                <Field label={t("cashflow.paidWith")}>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accountOptions
                        .filter((o) => o.value === "liquidity" || o.value.startsWith("credit:"))
                        .map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {kind === "expense" && !isPercent && (
                <div className="rounded-md border border-border/60 p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useInstallments}
                      onChange={(e) => setUseInstallments(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span>{t("cashflow.splitInstallments")}</span>
                  </label>
                  {useInstallments && (
                    <div className="grid grid-cols-3 gap-3">
                      <Field label={t("cashflow.payments")}>
                        <Input type="number" min={1} max={120} value={instCount} onChange={(e) => setInstCount(e.target.value)} />
                      </Field>
                      <Field label={t("cashflow.every")}>
                        <Select value={instFreq} onValueChange={(v) => setInstFreq(v as "weekly" | "monthly")}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">{t("cashflow.weekOpt")}</SelectItem>
                            <SelectItem value="monthly">{t("cashflow.monthOpt")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={t("cashflow.firstDue")}>
                        <Input type="date" value={instStart} onChange={(e) => setInstStart(e.target.value)} />
                      </Field>
                    </div>
                  )}
                </div>
              )}
              {!useInstallments && (
                <div className="rounded-md border border-border/60 p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={recurring}
                      onChange={(e) => setRecurring(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span>{t("cashflow.repeats")}</span>
                  </label>
                  {recurring && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("cashflow.frequency")}>
                        <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">{t("cashflow.weekly")}</SelectItem>
                            <SelectItem value="monthly">{t("cashflow.monthly")}</SelectItem>
                            <SelectItem value="yearly">{t("cashflow.yearly")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={t("cashflow.untilOptional")}>
                        <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                      </Field>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          ) : (
            <TabsContent value="transfer" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("cashflow.transferIntro")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("cashflow.from")}>
                  <Select value={fromAccount} onValueChange={setFromAccount}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("cashflow.to")}>
                  <Select value={toAccount} onValueChange={setToAccount}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label={t("common.amount")}>
                  <Input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                </Field>
                <Field label={t("common.currency")}>
                  <Select value={entryCurrency} onValueChange={setEntryCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("common.date")}>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>
              <Field label={t("cashflow.descriptionLabel")}>
                <Input type="text" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("cashflow.transferDescPlaceholder")} />
              </Field>
            </TabsContent>
          )}
        </Tabs>
        <Button className="mt-4 w-full" onClick={submit}>
          <Plus className="mr-2 h-4 w-4" /> {submitLabel}
        </Button>
      </CardContent>
    </Card>
  );

  function sharedFields() {
    return (
      <>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPercent}
            onChange={(e) => setIsPercent(e.target.checked)}
            className="h-4 w-4"
          />
          <span>{t("cashflow.percentToggle")}</span>
        </label>
        {isPercent && (
          <Field label={t("cashflow.percentOfShort")}>
            <PercentTargetPicker
              value={percentOf}
              onChange={setPercentOf}
              options={subscribeOptions}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label={isPercent ? t("cashflow.percent") : t("common.amount")}>
            <div className="relative">
              <Input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={isPercent ? "20" : "0.00"}
                className={isPercent ? "pr-8" : ""}
              />
              {isPercent && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              )}
            </div>
          </Field>
          {!isPercent && (
            <Field label={t("common.currency")}>
              <Select value={entryCurrency} onValueChange={setEntryCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <div className={isPercent ? "col-span-1" : "col-span-2 sm:col-span-1"}>
            <Field label={t("common.date")}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        </div>
      </>
    );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* ---------- Percent target picker (subscribe a % entry to a base) ---------- */

function PercentTargetPicker({
  value,
  onChange,
  options,
  excludeId,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; kind: "income" | "expense"; label: string }[];
  excludeId?: string;
  className?: string;
}) {
  const incomes = options.filter((o) => o.kind === "income" && o.id !== excludeId);
  const expenses = options.filter((o) => o.kind === "expense" && o.id !== excludeId);
  // If current value points to a missing/excluded entry, keep it selectable so the
  // user sees it; render it with a "(deleted)" hint at the bottom.
  const known = new Set([
    "all-income",
    "all-expense",
    ...incomes.map((o) => o.id),
    ...expenses.map((o) => o.id),
  ]);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="all-income">All income (total)</SelectItem>
        <SelectItem value="all-expense">All expenses (total)</SelectItem>
        {incomes.length > 0 && (
          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Income entries
          </div>
        )}
        {incomes.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
        ))}
        {expenses.length > 0 && (
          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Expense entries
          </div>
        )}
        {expenses.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
        ))}
        {!known.has(value) && (
          <SelectItem value={value}>(deleted entry)</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}



/* ---------- Category picker (select + inline "new") ---------- */

const NEW_CATEGORY_VALUE = "__new__";

function CategoryPicker({
  kind,
  value,
  onChange,
  categories,
  onCreate,
}: {
  kind: "income" | "expense";
  value: string;
  onChange: (v: string) => void;
  categories: Category[];
  onCreate: (c: Omit<Category, "id">) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<CategoryGroup>(kind === "income" ? "income" : "expense");
  const [color, setColor] = useState<string>(GROUP_COLORS[kind === "income" ? "income" : "expense"]);

  useEffect(() => {
    setGroup(kind === "income" ? "income" : "expense");
    setColor(GROUP_COLORS[kind === "income" ? "income" : "expense"]);
  }, [kind]);

  // Update default color when group changes.
  useEffect(() => {
    setColor(GROUP_COLORS[group]);
  }, [group]);

  const groupOptions: CategoryGroup[] =
    kind === "income" ? ["income"] : ["expense", "savings", "investment"];

  function commit() {
    const n = name.trim();
    if (!n) return toast.error("Name required");
    onCreate({ name: n, kind, group, color });
    setName("");
    setCreating(false);
  }

  return (
    <div className="space-y-2">
      <Select
        value={creating ? NEW_CATEGORY_VALUE : value}
        onValueChange={(v) => {
          if (v === NEW_CATEGORY_VALUE) {
            setCreating(true);
          } else {
            setCreating(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.name}>
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: c.color }}
                  aria-hidden
                />
                {c.name}
                <span className="text-[10px] uppercase text-muted-foreground">{c.group}</span>
              </span>
            </SelectItem>
          ))}
          <SelectItem value={NEW_CATEGORY_VALUE}>
            <span className="inline-flex items-center gap-2 text-primary">
              <Plus className="h-3.5 w-3.5" /> New {kind === "income" ? "source" : "category"}…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      {creating && (
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <div className="grid grid-cols-[1fr,auto] gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "income" ? "e.g. Bonuses" : "e.g. Subscriptions"}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
              }}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-border/60 bg-transparent p-0"
              title="Color"
            />
          </div>
          <div className="grid grid-cols-[1fr,auto,auto] gap-2">
            <Select value={group} onValueChange={(v) => setGroup(v as CategoryGroup)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g[0].toUpperCase() + g.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={commit}>
              Create
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Manage categories dialog ---------- */

function CategoriesManager({
  categories,
  onAdd,
  onUpdate,
  onRemove,
}: {
  categories: Category[];
  onAdd: (c: Omit<Category, "id">) => Category;
  onUpdate: (id: string, patch: Partial<Category>) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"income" | "expense">("expense");
  const [newGroup, setNewGroup] = useState<CategoryGroup>("expense");
  const [newColor, setNewColor] = useState<string>(GROUP_COLORS.expense);

  useEffect(() => {
    setNewGroup(newKind === "income" ? "income" : "expense");
  }, [newKind]);
  useEffect(() => {
    setNewColor(GROUP_COLORS[newGroup]);
  }, [newGroup]);

  const grouped = useMemo(() => {
    const inc = categories.filter((c) => c.kind === "income");
    const exp = categories.filter((c) => c.kind === "expense");
    return { inc, exp };
  }, [categories]);

  function create() {
    const n = newName.trim();
    if (!n) return toast.error(t("more.mcNameRequired"));
    onAdd({ name: n, kind: newKind, group: newGroup, color: newColor });
    setNewName("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          title={t("more.mcTitle")}
        >
          <SettingsIcon className="h-3.5 w-3.5" /> {t("more.mcTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("more.mcTitle")}</DialogTitle>
          <DialogDescription>
            {t("more.mcDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs font-medium mb-2">{t("more.mcAddNew")}</div>
            <div className="grid grid-cols-[1fr,auto] gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("more.mcNamePlaceholder")}
              />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-border/60 bg-transparent p-0"
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Select value={newKind} onValueChange={(v) => setNewKind(v as "income" | "expense")}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">{t("more.mcIncome")}</SelectItem>
                  <SelectItem value="expense">{t("more.mcExpense")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newGroup} onValueChange={(v) => setNewGroup(v as CategoryGroup)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(newKind === "income"
                    ? (["income"] as CategoryGroup[])
                    : (["expense", "savings", "investment"] as CategoryGroup[])
                  ).map((g) => (
                    <SelectItem key={g} value={g}>
                      {t(`more.mc${g[0].toUpperCase() + g.slice(1)}` as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={create}>
                <Plus className="mr-1 h-3.5 w-3.5" /> {t("more.mcAdd")}
              </Button>
            </div>
          </div>

          <CategoryList
            title={t("more.mcIncomeHeader")}
            list={grouped.inc}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
          <CategoryList
            title={t("more.mcExpensesHeader")}
            list={grouped.exp}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryList({
  title,
  list,
  onUpdate,
  onRemove,
}: {
  title: string;
  list: Category[];
  onUpdate: (id: string, patch: Partial<Category>) => void;
  onRemove: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  if (!list.length) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
        {title}
      </div>
      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {list.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5"
          >
            <input
              type="color"
              value={c.color}
              onChange={(e) => onUpdate(c.id, { color: e.target.value })}
              className="h-6 w-7 cursor-pointer rounded border border-border/60 bg-transparent p-0"
            />
            {editingId === c.id ? (
              <Input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => {
                  if (draftName.trim() && draftName !== c.name) {
                    onUpdate(c.id, { name: draftName.trim() });
                  }
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="h-7 text-sm"
              />
            ) : (
              <span className="flex-1 truncate text-sm">{c.name}</span>
            )}
            <Select
              value={c.group}
              onValueChange={(v) => onUpdate(c.id, { group: v as CategoryGroup })}
            >
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(c.kind === "income"
                  ? (["income"] as CategoryGroup[])
                  : (["expense", "savings", "investment"] as CategoryGroup[])
                ).map((g) => (
                  <SelectItem key={g} value={g}>
                    {g[0].toUpperCase() + g.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Rename category ${c.name}`}
              onClick={() => {
                setEditingId(c.id);
                setDraftName(c.name);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Delete category ${c.name}`}
              onClick={() => onRemove(c.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}


