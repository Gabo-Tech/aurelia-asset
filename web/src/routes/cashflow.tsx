import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SankeyChart, type LabelMode } from "@/components/sankey-chart";
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
import { PageStack } from "@/components/design/page-stack";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { ChartFrame } from "@/components/chart-frame";
import { saveExportFile } from "@/lib/export";
import { CURRENCIES } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import {
  Trash2,
  Plus,
  Palette,
  RotateCcw,
  Settings as SettingsIcon,
  Pencil,
  Download,
  ChevronDown,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CategoryPieCard, type PieEntry } from "@/components/category-pie-card";
import { toast } from "sonner";
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfYear,
  endOfWeek,
  endOfMonth,
  endOfYear,
  isWithinInterval,
  parseISO,
  eachDayOfInterval,
  addWeeks,
  addMonths,
  addYears,
  subMonths,
} from "date-fns";
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
import { SITE_URL } from "@/lib/site-config";
import { useIsMobile } from "@/hooks/use-mobile";
import { Fab } from "@/components/design/fab";
import { ResponsiveDialog } from "@/components/design/responsive-dialog";

export const Route = createFileRoute("/cashflow")({
  validateSearch: (search: Record<string, unknown>): { add?: string } => {
    const raw = search.add;
    if (raw === "1" || raw === 1 || raw === true) return { add: "1" };
    return {};
  },
  head: () => {
    const title = i18n.t("cashflow.metaTitle");
    const desc = i18n.t("cashflow.metaDesc");
    const url = `${SITE_URL}/cashflow`;
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

import {
  GROUP_COLORS,
  type Category,
  type CategoryGroup,
  type CashflowEntry,
  type RecurrenceFrequency,
} from "@/lib/types";
import {
  buildClassicSankey,
  buildStagedSankey,
  type SankeyLayoutMode,
  type SankeyStages,
} from "@/lib/sankey-build";
import { CreditCardsManager } from "@/components/credit-cards-manager";
import { CashAccountsManager } from "@/components/cash-accounts-manager";
import { CashflowCsvImportButton } from "@/components/cashflow-csv-import";
import { BillCalendar } from "@/components/bill-calendar";
import { UpcomingPanel, UpcomingPreviewCard } from "@/components/cashflow-upcoming";
import { expandCashflows, valuesByEntry } from "@/lib/cashflow-math";

export {
  expandCashflows,
  liquidityImpact,
  cardDebtImpact,
  valuesByEntry,
} from "@/lib/cashflow-math";

/** Build a human label for what a percent entry is subscribed to. */
function describePercentOf(entry: CashflowEntry, cashflows: CashflowEntry[]): string {
  const target = entry.percentOf ?? "all-income";
  if (target === "all-income") return "all income";
  if (target === "all-expense") return "all expenses";
  const ref = cashflows.find((c) => c.id === target);
  if (!ref) return "(deleted)";
  return ref.kind === "income" ? ref.source || "income" : ref.category || "expense";
}

const PREF_KEY = "ept_cashflow_sankey_prefs_v1";

type Prefs = {
  labelMode: LabelMode;
  layoutMode: SankeyLayoutMode;
  stages: SankeyStages;
  nodeColors: Record<string, string>;
  incomeOrder: string[];
  expenseOrder: string[];
  accountOrder: string[];
};

const DEFAULT_STAGES: SankeyStages = {
  categories: true,
  descriptions: true,
};

const DEFAULT_PREFS: Prefs = {
  labelMode: "always",
  layoutMode: "staged",
  stages: { ...DEFAULT_STAGES },
  nodeColors: {},
  incomeOrder: [],
  expenseOrder: [],
  accountOrder: [],
};

async function loadPrefs(): Promise<Prefs> {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = await secureGet(PREF_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw);
    return {
      labelMode: p.labelMode ?? "always",
      layoutMode: p.layoutMode === "classic" ? "classic" : "staged",
      stages: {
        categories: p.stages?.categories ?? DEFAULT_STAGES.categories,
        descriptions: p.stages?.descriptions ?? DEFAULT_STAGES.descriptions,
      },
      nodeColors: p.nodeColors ?? {},
      incomeOrder: Array.isArray(p.incomeOrder) ? p.incomeOrder : [],
      expenseOrder: Array.isArray(p.expenseOrder) ? p.expenseOrder : [],
      accountOrder: Array.isArray(p.accountOrder) ? p.accountOrder : [],
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function CashflowPage() {
  const { add } = Route.useSearch();
  const isMobile = useIsMobile();
  const {
    state,
    addCashflow,
    updateCashflow,
    removeCashflow,
    addCategory,
    updateCategory,
    removeCategory,
  } = useStore();
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
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        };
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
      ? sankeyInterval.end > new Date()
        ? sankeyInterval.end
        : new Date()
      : new Date();
    const all = expandCashflows(cashflows, horizon);
    if (!sankeyInterval) return all;
    return all.filter((c) => isWithinInterval(new Date(c.date), sankeyInterval));
  }, [cashflows, sankeyInterval]);

  const valuesTop = useMemo(
    () => valuesByEntry(expandedToToday, toDisplay),
    [expandedToToday, toDisplay],
  );

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

  const sankeyLabels = useMemo(
    () => ({
      totalIncome: t("cashflow.sankey.totalIncome", { defaultValue: "Total Income" }),
      totalExpenses: t("cashflow.sankey.totalExpenses", { defaultValue: "Total Expenses" }),
      totalSavings: t("cashflow.sankey.totalSavings", { defaultValue: "Total Savings" }),
      totalInvestments: t("cashflow.sankey.totalInvestments", {
        defaultValue: "Total Investments",
      }),
      saved: t("cashflow.sankey.saved", { defaultValue: "Saved" }),
      deficit: t("cashflow.sankey.deficit", { defaultValue: "Deficit" }),
      other: t("cashflow.other", { defaultValue: "Other" }),
      cashPool: t("cashflow.cashPool", { defaultValue: "Cash Pool" }),
      general: t("cashflow.sankey.general", { defaultValue: "General" }),
    }),
    [t],
  );

  const sankey = useMemo(() => {
    if (!expandedToToday.length) return null;
    const buildPrefs = {
      nodeColors: prefs.nodeColors,
      incomeOrder: prefs.incomeOrder,
      expenseOrder: prefs.expenseOrder,
      accountOrder: prefs.accountOrder,
      stages: prefs.stages,
    };
    const ctx = {
      entries: expandedToToday,
      valuesTop,
      catByName,
      colorFor,
      prefs: buildPrefs,
      labels: sankeyLabels,
    };

    if (prefs.layoutMode === "staged") {
      return buildStagedSankey(ctx);
    }
    return buildClassicSankey({
      ...ctx,
      creditCards: state.creditCards,
      holdings: state.holdings,
    });
  }, [
    expandedToToday,
    valuesTop,
    prefs.nodeColors,
    prefs.incomeOrder,
    prefs.expenseOrder,
    prefs.accountOrder,
    prefs.layoutMode,
    prefs.stages,
    catByName,
    colorFor,
    sankeyLabels,
    state.creditCards,
    state.holdings,
  ]);

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
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [pageTab, setPageTab] = useState<"overview" | "upcoming">("overview");
  const [upcomingEditEntry, setUpcomingEditEntry] = useState<CashflowEntry | null>(null);

  useEffect(() => {
    if (isMobile) setBreakdownOpen(true);
  }, [isMobile]);

  useEffect(() => {
    if (add === "1") setAddModalOpen(true);
  }, [add]);

  const openUpcomingEdit = (parentId: string) => {
    const entry = cashflows.find((c) => c.id === parentId);
    if (!entry) return;
    setAddModalOpen(false);
    setUpcomingEditEntry(entry);
  };

  const openAddModal = () => {
    setPageTab("overview");
    setUpcomingEditEntry(null);
    setAddModalOpen(true);
  };

  const openManageCategories = () => setCategoriesOpen(true);
  const formDialogOpen = addModalOpen || !!upcomingEditEntry;

  return (
    <>
      <PageHeader
        title={t("cashflow.title")}
        description={t("cashflow.description")}
        actions={
          <>
            <CashflowCsvImportButton />
            <Button variant="outline" onClick={openManageCategories} className="gap-1.5">
              <SettingsIcon className="h-4 w-4" />
              {t("cashflow.categories")}
            </Button>
            <Button onClick={openAddModal} data-tour="cf-add-trigger" className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("cashflow.addData", { defaultValue: "Add data" })}
            </Button>
          </>
        }
      />

      <PageStack>
        <Tabs
          value={pageTab}
          onValueChange={(v) => setPageTab(v as typeof pageTab)}
          className="pb-[calc(var(--app-fab-offset))] lg:pb-0"
        >
          <TabsList>
            <TabsTrigger value="overview">{t("cashflow.upcoming.tabOverview")}</TabsTrigger>
            <TabsTrigger value="upcoming">{t("cashflow.upcoming.tabUpcoming")}</TabsTrigger>
          </TabsList>

          <TabsContent
            value="overview"
            className="flex flex-col gap-[var(--stack-page)] sm:gap-[var(--stack-section)]"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-5" data-tour="cf-summary">
              <StatCard
                label={t("cashflow.income")}
                value={privacy ? MASK : formatMoney(totals.income, currency)}
                tone="success"
              />
              <StatCard
                label={t("cashflow.expenses")}
                value={privacy ? MASK : formatMoney(totals.expense, currency)}
                tone="destructive"
              />
              <StatCard
                label={t("cashflow.net")}
                value={
                  privacy
                    ? MASK
                    : `${totals.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(totals.net), currency)}`
                }
                tone={totals.net >= 0 ? "success" : "destructive"}
              />
            </div>

            <div>
              <UpcomingPreviewCard
                cashflows={cashflows}
                currency={currency}
                privacy={privacy}
                mask={MASK}
                toDisplay={toDisplay}
                onViewAll={() => setPageTab("upcoming")}
                onEdit={openUpcomingEdit}
              />
            </div>

            <Collapsible open={breakdownOpen} onOpenChange={setBreakdownOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  data-tour="cf-breakdown-trigger"
                >
                  <span>
                    {t("cashflow.breakdown.title", { defaultValue: "Breakdown by category" })}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${breakdownOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3" data-tour="cf-breakdown">
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
                    title={t("cashflow.breakdown.investments", {
                      defaultValue: "Investments & Savings",
                    })}
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
                onManageCategories={openManageCategories}
              />
            </div>

            <Card className="border-border/60 min-w-0">
              <CardHeader
                className="px-3 sm:px-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 space-y-0"
                data-tour="cf-sankey"
              >
                <div className="min-w-0">
                  <CardTitle>{t("cashflow.flow")}</CardTitle>
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {sankeyPeriodLabel}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:shrink-0">
                  <Select
                    value={sankeyPeriod}
                    onValueChange={(v) => setSankeyPeriod(v as SankeyPeriod)}
                  >
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
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
                      <Input
                        type="date"
                        className="h-8 w-[130px] text-xs"
                        value={sankeyFrom}
                        onChange={(e) => setSankeyFrom(e.target.value)}
                      />
                      <Input
                        type="date"
                        className="h-8 w-[130px] text-xs"
                        value={sankeyTo}
                        onChange={(e) => setSankeyTo(e.target.value)}
                      />
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
                        <AlertDialogTitle>
                          {t("cashflow.resetLastMonthTitle", {
                            defaultValue: "Delete last month's entries?",
                          })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("cashflow.resetLastMonthDesc", {
                            defaultValue:
                              "This permanently removes every cashflow entry dated in {{range}}. Recurring rules are kept.",
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
                                return isWithinInterval(d, {
                                  start: lastMonthStart,
                                  end: lastMonthEnd,
                                });
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
                  <div className="w-full min-w-0">
                    {sankey ? (
                      <SankeyChart
                        data={sankey}
                        align={prefs.layoutMode === "staged" ? "left" : "justify"}
                        labelMode={prefs.labelMode}
                        format={(v: number) => (privacy ? MASK : formatMoney(v, currency))}
                        onReorder={(side, names) =>
                          setPrefs((p) => {
                            const key =
                              side === "income"
                                ? "incomeOrder"
                                : side === "account"
                                  ? "accountOrder"
                                  : "expenseOrder";
                            const prev = p[key];
                            // Merge so reordering one set doesn't wipe another (e.g. cats vs leaves).
                            const set = new Set(names);
                            const queue = [...names];
                            const merged =
                              prev.length === 0
                                ? names
                                : [...prev.map((n) => (set.has(n) ? queue.shift()! : n)), ...queue];
                            return { ...p, [key]: merged };
                          })
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

            <div className="flex flex-col gap-[var(--stack-section)]">
              <BillCalendar
                onEdit={(parentId) => {
                  const parent = cashflows.find((c) => c.id === parentId);
                  if (parent) setUpcomingEditEntry(parent);
                }}
              />
              <CashAccountsManager />
              <CreditCardsManager />
            </div>
          </TabsContent>

          <TabsContent value="upcoming" className="mt-4">
            <UpcomingPanel
              cashflows={cashflows}
              currency={currency}
              privacy={privacy}
              mask={MASK}
              toDisplay={toDisplay}
              onEdit={openUpcomingEdit}
            />
          </TabsContent>
        </Tabs>
      </PageStack>

      <Fab
        label={t("cashflow.addData", { defaultValue: "Add data" })}
        icon={<Plus className="h-6 w-6" />}
        onClick={openAddModal}
      />

      <ResponsiveDialog
        open={formDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAddModalOpen(false);
            setUpcomingEditEntry(null);
          }
        }}
        title={upcomingEditEntry ? t("cashflow.editEntry") : t("cashflow.addEntry")}
        description={
          upcomingEditEntry
            ? t("cashflow.editEntryHint", {
                defaultValue: "Update the details for this cashflow entry.",
              })
            : t("cashflow.addDataHint", {
                defaultValue: "Log income, spending, or a transfer",
              })
        }
        className="max-h-[92dvh] w-full max-w-2xl lg:max-w-3xl"
        showClose
      >
        <AddForm
          key={upcomingEditEntry?.id ?? "new"}
          embedded
          editing={upcomingEditEntry}
          defaultCurrency={currency}
          categories={categories}
          subscribeOptions={subscribeOptions}
          onAddCategory={addCategory}
          onManageCategories={openManageCategories}
          onAdd={(e) => {
            if (upcomingEditEntry) {
              updateCashflow(upcomingEditEntry.id, e as unknown as Partial<CashflowEntry>);
              toast.success(t("more.entriesUpdated"));
              setUpcomingEditEntry(null);
              return;
            }
            addCashflow(e as unknown as Omit<CashflowEntry, "id">);
            toast.success(
              e.kind === "income"
                ? t("cashflow.incomeAdded")
                : e.kind === "expense"
                  ? t("cashflow.expenseAdded")
                  : t("cashflow.transferAdded"),
            );
            setAddModalOpen(false);
          }}
        />
      </ResponsiveDialog>

      <CategoriesManager
        categories={categories}
        onAdd={addCategory}
        onUpdate={updateCategory}
        onRemove={removeCategory}
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        showTrigger={false}
      />
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
  onManageCategories,
}: {
  cashflows: CashflowEntry[];
  categories: Category[];
  subscribeOptions: { id: string; kind: "income" | "expense"; label: string }[];
  currency: string;
  privacy: boolean;
  MASK: string;
  mask: (amount: number, from?: string) => string;
  toDisplay: (amount: number, from?: string) => number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CashflowEntry>) => void;
  onManageCategories?: () => void;
}) {
  const { t } = useTranslation();
  const { state: storeState2, addCategory } = useStore();
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
  const [editing, setEditing] = useState<CashflowEntry | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "income" | "expense">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const interval = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "week":
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        };
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
    const list =
      kindFilter === "all" ? categories : categories.filter((c) => c.kind === kindFilter);
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
    for (const d of days)
      byDay.set(format(d, "yyyy-MM-dd"), { income: 0, expense: 0, entries: [] });
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

  async function exportPdf() {
    if (!filtered.length) {
      toast.error(t("more.entriesNoneInRange"));
      return;
    }
    const toastId = toast.loading(t("cashflow.exportingPdf"));
    try {
      await new Promise((r) => setTimeout(r, 0));
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;

      doc.setFontSize(18);
      doc.text(t("cashflow.pdfReportTitle"), margin, 50);
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text(`${t("cashflow.pdfPeriod")}: ${periodLabel}`, margin, 68);
      const filterDesc = t("cashflow.pdfFilters", {
        type: kindFilter,
        category: categoryFilter,
        currency,
      });
      doc.text(filterDesc, margin, 82);

      doc.setTextColor(0);
      doc.setFontSize(11);
      const sumY = 110;
      doc.text(`${t("cashflow.pdfIncome")}: ${formatMoney(totals.income, currency)}`, margin, sumY);
      doc.text(
        `${t("cashflow.pdfExpenses")}: ${formatMoney(totals.expense, currency)}`,
        margin + 180,
        sumY,
      );
      doc.text(
        `${t("cashflow.pdfNet")}: ${totals.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(totals.net), currency)}`,
        margin + 360,
        sumY,
      );

      const chartTop = 135;
      const chartH = 200;
      const chartW = pageW - margin * 2;
      const chartLeft = margin;
      const chartBottom = chartTop + chartH;

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

        doc.setFontSize(8);
        doc.setTextColor(140);
        for (let i = 0; i <= 4; i++) {
          const v = minBal + (range / 4) * i;
          const y = yFor(v);
          doc.setDrawColor(235);
          doc.line(chartLeft, y, chartLeft + chartW, y);
          doc.text(formatMoney(v, currency, { compact: true }), chartLeft - 4, y + 3, {
            align: "right",
          });
        }

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
            const tZero = Math.abs(v1) / (Math.abs(v1) + Math.abs(v2));
            const xm = x1 + (x2 - x1) * tZero;
            const ym = yFor(0);
            const c1 = v1 >= 0 ? GREEN : RED;
            const c2 = v2 >= 0 ? GREEN : RED;
            doc.setDrawColor(c1[0], c1[1], c1[2]);
            doc.line(x1, y1, xm, ym);
            doc.setDrawColor(c2[0], c2[1], c2[2]);
            doc.line(xm, ym, x2, y2);
          }
        }

        const step = Math.max(1, Math.ceil(chartData.length / 6));
        doc.setTextColor(140);
        for (let i = 0; i < chartData.length; i += step) {
          const x = chartLeft + i * xStep;
          doc.text(chartData[i].label, x, chartBottom + 12, { align: "center" });
        }

        doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
        doc.rect(chartLeft, chartTop - 14, 8, 8, "F");
        doc.setTextColor(80);
        doc.text(t("cashflow.pdfBalancePositive"), chartLeft + 12, chartTop - 8);
        doc.setFillColor(RED[0], RED[1], RED[2]);
        doc.rect(chartLeft + 90, chartTop - 14, 8, 8, "F");
        doc.text(t("cashflow.pdfBalanceNegative"), chartLeft + 102, chartTop - 8);
      }

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
        head: [
          [
            t("cashflow.pdfDate"),
            t("cashflow.pdfType"),
            t("cashflow.pdfSourceCategory"),
            t("cashflow.pdfAmount"),
            t("cashflow.pdfInCurrency", { currency }),
          ],
        ],
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
      const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
      const method = await saveExportFile(fname, { bytes: pdfBytes });
      if (method === "cancelled") {
        toast.dismiss(toastId);
        return;
      }
      toast.success(t("more.entriesPdfExported"), { id: toastId });
    } catch (e) {
      toast.error(
        `${t("settings.data.exportFailed", { defaultValue: "Export failed" })}: ${(e as Error).message}`,
        { id: toastId },
      );
    }
  }

  const sortedEntries = useMemo(
    () => [...filtered].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [filtered],
  );

  const kindLabel = (kind: CashflowEntry["kind"]) =>
    kind === "income"
      ? t("more.entriesIncome")
      : kind === "expense"
        ? t("more.entriesExpense")
        : t("cashflow.transfer", { defaultValue: "Transfer" });

  const entryLabel = (c: CashflowEntry) =>
    c.kind === "transfer"
      ? `${labelAccount(c.fromAccount)} → ${labelAccount(c.toAccount)}`
      : c.kind === "income"
        ? c.source
        : c.category;

  const amountDisplay = (c: CashflowEntry) => {
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
  };

  const entryActions = (parent: CashflowEntry | null) => (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        onClick={() => parent && setEditing(parent)}
        aria-label={t("more.entriesEditAria")}
        disabled={!parent}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        onClick={() => {
          if (!parent) return;
          if (parent.recurrence && !confirm(t("more.entriesDeleteRecurringConfirm"))) return;
          onRemove(parent.id);
        }}
        aria-label={t("more.entriesDeleteAria")}
        disabled={!parent}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <Card className="border-border/60 mt-5">
      <CardHeader
        className="flex-row items-center justify-between space-y-0 gap-2 flex-wrap"
        data-tour="cf-entries"
      >
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
              <SelectTrigger className="h-9 mt-1.5">
                <SelectValue />
              </SelectTrigger>
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
              <SelectTrigger className="h-9 mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("more.entriesAllCategories")}</SelectItem>
                {availableCategories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("more.entriesFiltersPeriod")}</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="h-9 mt-1.5">
                <SelectValue />
              </SelectTrigger>
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
                <Input
                  type="date"
                  className="h-9 mt-1.5"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">{t("more.entriesFiltersTo")}</Label>
                <Input
                  type="date"
                  className="h-9 mt-1.5"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
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
            {t("more.entriesExpensesLabel")}:{" "}
            {privacy ? MASK : formatMoney(totals.expense, currency)}
          </span>
          <span
            className={`rounded-md px-2 py-1 ${totals.net >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
          >
            {t("more.entriesNetLabel")}:{" "}
            {privacy
              ? MASK
              : `${totals.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(totals.net), currency)}`}
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
                        <stop offset="0" stopColor="var(--success)" />
                        <stop offset={zeroOffset} stopColor="var(--success)" />
                        <stop offset={zeroOffset} stopColor="var(--destructive)" />
                        <stop offset="1" stopColor="var(--destructive)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.5} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      stroke="var(--border)"
                      strokeOpacity={0.8}
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      stroke="var(--border)"
                      strokeOpacity={0.8}
                      tickFormatter={(v) => formatMoney(v, currency, { compact: true })}
                      width={70}
                    />
                    <ReferenceLine
                      y={0}
                      stroke="var(--muted-foreground)"
                      strokeOpacity={0.35}
                      strokeDasharray="2 2"
                    />
                    <RTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload as (typeof chartData)[number];
                        return (
                          <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-md">
                            <div className="font-medium text-foreground">{d.label}</div>
                            <div className="mt-1 text-muted-foreground">
                              {t("more.entriesBalance")}:{" "}
                              <span
                                className={`font-medium tabular-nums ${d.balance >= 0 ? "text-success" : "text-destructive"}`}
                              >
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
                              <div className="mt-1 text-muted-foreground italic">
                                {t("more.entriesNoActivity")}
                              </div>
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
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t("more.entriesEmpty")}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
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
                  {sortedEntries.map((c) => {
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
                              {kindLabel(c.kind)}
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
                          <div>{entryLabel(c)}</div>
                          {c.description && (
                            <div
                              className="text-[11px] text-muted-foreground truncate max-w-[28ch]"
                              title={c.description}
                            >
                              {c.description}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-medium">
                          {amountDisplay(c)}
                        </td>
                        <td className="py-2.5 text-right">{entryActions(parent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-2">
              {sortedEntries.map((c) => {
                const parent = cashflows.find((p) => p.id === c.parentId) ?? null;
                return (
                  <div key={c.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(c.date), "MMM d, yyyy")}
                        </div>
                        <span
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            c.kind === "income"
                              ? "bg-success/15 text-success"
                              : c.kind === "expense"
                                ? "bg-destructive/15 text-destructive"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {kindLabel(c.kind)}
                        </span>
                        <div className="font-medium truncate">{entryLabel(c)}</div>
                      </div>
                      <div className="text-right tabular-nums font-medium shrink-0">
                        {amountDisplay(c)}
                      </div>
                    </div>
                    {entryActions(parent)}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
      <ResponsiveDialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={t("cashflow.editEntry")}
        description={t("cashflow.editEntryHint", {
          defaultValue: "Update the details for this cashflow entry.",
        })}
        className="max-h-[92dvh] w-full max-w-2xl lg:max-w-3xl"
        showClose
      >
        {editing && (
          <AddForm
            key={editing.id}
            embedded
            editing={editing}
            defaultCurrency={currency}
            categories={categories}
            subscribeOptions={subscribeOptions}
            onAddCategory={addCategory}
            onManageCategories={onManageCategories}
            onAdd={(e) => {
              onUpdate(editing.id, e as unknown as Partial<CashflowEntry>);
              setEditing(null);
              toast.success(t("more.entriesUpdated"));
            }}
          />
        )}
      </ResponsiveDialog>
    </Card>
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
  nodes: { name: string; fill: string; kind?: string }[];
  resetColors: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Select
        value={prefs.layoutMode}
        onValueChange={(v) => setPrefs((p) => ({ ...p, layoutMode: v as SankeyLayoutMode }))}
      >
        <SelectTrigger className="h-8 w-[96px] sm:w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="staged">
            {t("cashflow.sankey.layoutStaged", { defaultValue: "Grouped" })}
          </SelectItem>
          <SelectItem value="classic">
            {t("cashflow.sankey.layoutClassic", { defaultValue: "Accounts" })}
          </SelectItem>
        </SelectContent>
      </Select>
      {prefs.layoutMode === "staged" && (
        <>
          <label className="flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2 text-xs">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={prefs.stages.categories}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  stages: { ...p.stages, categories: e.target.checked },
                }))
              }
            />
            {t("cashflow.sankey.stageCategories", { defaultValue: "Categories" })}
          </label>
          <label className="flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2 text-xs">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={prefs.stages.descriptions}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  stages: { ...p.stages, descriptions: e.target.checked },
                }))
              }
            />
            {t("cashflow.sankey.stageDescriptions", { defaultValue: "Descriptions" })}
          </label>
        </>
      )}
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
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={resetColors}>
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
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-3 sm:p-5">
        <div className="text-[10px] sm:text-xs uppercase tracking-wider sm:normal-case sm:tracking-normal text-muted-foreground font-medium">
          {label}
        </div>
        <div
          className={`mt-1 sm:mt-2 text-lg sm:text-2xl font-semibold tracking-tight break-words tabular-nums leading-snug ${
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
  installmentPlan?: {
    total: number;
    count: number;
    frequency: "weekly" | "monthly";
    firstDueDate: string;
  };
};

function AddForm({
  onAdd,
  defaultCurrency,
  categories,
  subscribeOptions,
  onAddCategory,
  embedded = false,
  editing = null,
  onManageCategories,
}: {
  onAdd: (e: FormVals) => void;
  defaultCurrency: string;
  categories: Category[];
  subscribeOptions: { id: string; kind: "income" | "expense"; label: string }[];
  onAddCategory: (c: Omit<Category, "id">) => Category;
  embedded?: boolean;
  editing?: CashflowEntry | null;
  onManageCategories?: () => void;
}) {
  const { t } = useTranslation();
  const { state: storeState } = useStore();
  const holdings = storeState.holdings;
  const creditCards = storeState.creditCards ?? [];
  const accountOptions = useMemo(() => {
    const cashAccounts = storeState.cashAccounts?.length
      ? storeState.cashAccounts
      : [{ id: "cash-default", name: t("cashflow.liquidityCash"), isDefault: true }];
    const opts: { value: string; label: string }[] = cashAccounts.map((a) => ({
      value: a.isDefault ? "liquidity" : `cash:${a.id}`,
      label: a.isDefault
        ? `${a.name} (${t("cashflow.accounts.default", { defaultValue: "default" })})`
        : a.name,
    }));
    // Ensure legacy liquidity always present
    if (!opts.some((o) => o.value === "liquidity")) {
      opts.unshift({ value: "liquidity", label: t("cashflow.liquidityCash") });
    }
    for (const h of holdings)
      opts.push({
        value: `holding:${h.id}`,
        label: `${t("cashflow.holdingPrefix")} · ${h.symbol || h.name}`,
      });
    for (const c of creditCards)
      opts.push({ value: `credit:${c.id}`, label: `${t("cashflow.cardPrefix")} · ${c.name}` });
    return opts;
  }, [holdings, creditCards, storeState.cashAccounts, t]);

  const [kind, setKind] = useState<"income" | "expense" | "transfer">("income");
  const [categoryName, setCategoryName] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [entryCurrency, setEntryCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [whenMode, setWhenMode] = useState<"one-time" | "recurring" | "installments">("one-time");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [until, setUntil] = useState("");
  const [isPercent, setIsPercent] = useState(false);
  const [percentOf, setPercentOf] = useState<string>("all-income");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("liquidity");
  const [instCount, setInstCount] = useState("4");
  const [instFreq, setInstFreq] = useState<"weekly" | "monthly">("monthly");
  const [instStart, setInstStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [fromAccount, setFromAccount] = useState<string>("liquidity");
  const [toAccount, setToAccount] = useState<string>(accountOptions[1]?.value ?? "liquidity");
  const [formError, setFormError] = useState<{ field: string; message: string } | null>(null);

  const recurrencePreview = useMemo(() => {
    if (whenMode !== "recurring") return "";
    const day = format(new Date(date), "d");
    const freqLabel =
      frequency === "weekly"
        ? t("cashflow.weekly")
        : frequency === "monthly"
          ? t("cashflow.monthly")
          : t("cashflow.yearly");
    const base = t("cashflow.upcoming.previewRecurring", {
      frequency: freqLabel,
      day,
      defaultValue: `Every ${freqLabel.toLowerCase()} on day ${day}`,
    });
    if (until) {
      return `${base} · ${t("cashflow.until")} ${format(new Date(until), "MMM d, yyyy")}`;
    }
    return base;
  }, [whenMode, date, frequency, until, t]);

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

  useEffect(() => {
    if (!editing) return;
    setKind(editing.kind);
    setCategoryName(
      editing.kind === "income"
        ? editing.source
        : editing.kind === "expense"
          ? editing.category
          : "",
    );
    setAmount(String(editing.amount));
    setEntryCurrency(editing.currency || defaultCurrency);
    setDate(format(new Date(editing.date), "yyyy-MM-dd"));
    if (editing.installmentPlan) {
      setWhenMode("installments");
      setInstCount(String(editing.installmentPlan.count));
      setInstFreq(editing.installmentPlan.frequency);
      setInstStart(format(new Date(editing.installmentPlan.firstDueDate), "yyyy-MM-dd"));
    } else if (editing.recurrence) {
      setWhenMode("recurring");
      setFrequency(editing.recurrence.frequency);
      setUntil(
        editing.recurrence.until ? format(new Date(editing.recurrence.until), "yyyy-MM-dd") : "",
      );
    } else {
      setWhenMode("one-time");
      setUntil("");
    }
    setIsPercent((editing.amountKind ?? "fixed") === "percent");
    setPercentOf(editing.percentOf ?? "all-income");
    setDescription(editing.description ?? "");
    setPaymentMethod(editing.paymentMethod ?? "liquidity");
    setFromAccount(editing.fromAccount ?? "liquidity");
    setToAccount(editing.toAccount ?? "liquidity");
  }, [editing, defaultCurrency]);

  function submit() {
    const a = parseFloat(amount);
    if (!isFinite(a) || a <= 0) {
      setFormError({ field: "amount", message: t("cashflow.amountGtZero") });
      return;
    }
    if (isPercent && a > 1000) {
      setFormError({ field: "amount", message: t("cashflow.percentTooHigh") });
      return;
    }
    const desc = description.trim().slice(0, 200);

    if (kind === "transfer") {
      if (!fromAccount || !toAccount) {
        setFormError({ field: "accounts", message: t("cashflow.pickBothAccounts") });
        return;
      }
      if (fromAccount === toAccount) {
        setFormError({ field: "accounts", message: t("cashflow.accountsMustDiffer") });
        return;
      }
      setFormError(null);
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
      if (!editing) {
        setAmount("");
        setDescription("");
      }
      return;
    }

    if (!categoryName.trim()) {
      setFormError({ field: "category", message: t("cashflow.pickCategory") });
      return;
    }
    const useInstallments = whenMode === "installments";
    const recurring = whenMode === "recurring";
    const installmentPlan =
      kind === "expense" && useInstallments && !isPercent
        ? {
            total: a,
            count: Math.max(1, Math.min(120, parseInt(instCount) || 1)),
            frequency: instFreq,
            firstDueDate: new Date(instStart).toISOString(),
          }
        : undefined;
    setFormError(null);
    onAdd({
      kind,
      source: kind === "income" ? categoryName : "",
      category: kind === "expense" ? categoryName : "",
      amount: a,
      currency: entryCurrency,
      date: new Date(date).toISOString(),
      recurrence:
        recurring && !installmentPlan
          ? { frequency, ...(until ? { until: new Date(until).toISOString() } : {}) }
          : undefined,
      amountKind: isPercent ? "percent" : "fixed",
      percentOf: isPercent ? percentOf : undefined,
      description: desc || undefined,
      paymentMethod: kind === "expense" ? paymentMethod : undefined,
      installmentPlan,
    });
    if (!editing) {
      setAmount("");
      setDescription("");
    }
  }

  const submitLabel = editing
    ? t("common.save", { defaultValue: "Save changes" })
    : kind === "transfer"
      ? t("cashflow.addTransferBtn")
      : kind === "income"
        ? whenMode === "recurring"
          ? t("cashflow.addRecurringIncome")
          : t("cashflow.addIncomeBtn")
        : whenMode === "installments"
          ? t("cashflow.addFinancedExpense")
          : whenMode === "recurring"
            ? t("cashflow.addRecurringExpense")
            : t("cashflow.addExpenseBtn");

  const manageCategoriesBtn = onManageCategories ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 text-xs"
      onClick={onManageCategories}
    >
      {t("cashflow.manageCategories")}
    </Button>
  ) : null;

  const formBody = (
    <>
      <Tabs
        value={kind}
        onValueChange={(v) => {
          setKind(v as typeof kind);
          setFormError(null);
        }}
      >
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
            <Field htmlFor="cf-description" label={t("cashflow.descriptionLabel")}>
              <Input
                id="cf-description"
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountOptions
                      .filter((o) => o.value === "liquidity" || o.value.startsWith("credit:"))
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {kind === "expense" && !isPercent && (
              <div className="rounded-md border border-border/60 p-3 space-y-3">
                <Field label={t("cashflow.upcoming.whenLabel")}>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ["one-time", t("cashflow.none")],
                        ["recurring", t("cashflow.recurrence")],
                        ...(kind === "expense"
                          ? [["installments", t("cashflow.splitInstallments")]]
                          : []),
                      ] as const
                    ).map(([mode, label]) => (
                      <Button
                        key={mode}
                        type="button"
                        variant={whenMode === mode ? "secondary" : "outline"}
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setWhenMode(mode as typeof whenMode)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </Field>
                {whenMode === "installments" && (
                  <div className="grid grid-cols-3 gap-3">
                    <Field htmlFor="cf-inst-count" label={t("cashflow.payments")}>
                      <Input
                        id="cf-inst-count"
                        type="number"
                        min={1}
                        max={120}
                        value={instCount}
                        onChange={(e) => setInstCount(e.target.value)}
                      />
                    </Field>
                    <Field label={t("cashflow.every")}>
                      <Select
                        value={instFreq}
                        onValueChange={(v) => setInstFreq(v as "weekly" | "monthly")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">{t("cashflow.weekOpt")}</SelectItem>
                          <SelectItem value="monthly">{t("cashflow.monthOpt")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field htmlFor="cf-inst-start" label={t("cashflow.firstDue")}>
                      <Input
                        id="cf-inst-start"
                        type="date"
                        value={instStart}
                        onChange={(e) => setInstStart(e.target.value)}
                      />
                    </Field>
                  </div>
                )}
                {whenMode === "recurring" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("cashflow.frequency")}>
                        <Select
                          value={frequency}
                          onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">{t("cashflow.weekly")}</SelectItem>
                            <SelectItem value="monthly">{t("cashflow.monthly")}</SelectItem>
                            <SelectItem value="yearly">{t("cashflow.yearly")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field htmlFor="cf-until" label={t("cashflow.untilOptional")}>
                        <Input
                          id="cf-until"
                          type="date"
                          value={until}
                          onChange={(e) => setUntil(e.target.value)}
                        />
                      </Field>
                    </div>
                    {recurrencePreview && (
                      <p className="text-xs text-muted-foreground">{recurrencePreview}</p>
                    )}
                  </>
                )}
              </div>
            )}
            {kind === "income" && !isPercent && (
              <div className="rounded-md border border-border/60 p-3 space-y-3">
                <Field label={t("cashflow.upcoming.whenLabel")}>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ["one-time", t("cashflow.none")],
                        ["recurring", t("cashflow.recurrence")],
                      ] as const
                    ).map(([mode, label]) => (
                      <Button
                        key={mode}
                        type="button"
                        variant={whenMode === mode ? "secondary" : "outline"}
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setWhenMode(mode as typeof whenMode)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </Field>
                {whenMode === "recurring" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("cashflow.frequency")}>
                        <Select
                          value={frequency}
                          onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">{t("cashflow.weekly")}</SelectItem>
                            <SelectItem value="monthly">{t("cashflow.monthly")}</SelectItem>
                            <SelectItem value="yearly">{t("cashflow.yearly")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field htmlFor="cf-until" label={t("cashflow.untilOptional")}>
                        <Input
                          id="cf-until"
                          type="date"
                          value={until}
                          onChange={(e) => setUntil(e.target.value)}
                        />
                      </Field>
                    </div>
                    {recurrencePreview && (
                      <p className="text-xs text-muted-foreground">{recurrencePreview}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </TabsContent>
        ) : (
          <TabsContent value="transfer" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">{t("cashflow.transferIntro")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("cashflow.from")}>
                <Select value={fromAccount} onValueChange={setFromAccount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("cashflow.to")}>
                <Select value={toAccount} onValueChange={setToAccount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field htmlFor="cf-transfer-amount" label={t("common.amount")}>
                <Input
                  id="cf-transfer-amount"
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (formError?.field === "amount") setFormError(null);
                  }}
                  placeholder="0.00"
                  aria-invalid={formError?.field === "amount"}
                />
              </Field>
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
              <Field htmlFor="cf-transfer-date" label={t("common.date")}>
                <Input
                  id="cf-transfer-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            </div>
            <Field htmlFor="cf-transfer-description" label={t("cashflow.descriptionLabel")}>
              <Input
                id="cf-transfer-description"
                type="text"
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("cashflow.transferDescPlaceholder")}
              />
            </Field>
          </TabsContent>
        )}
      </Tabs>
      {formError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {formError.message}
        </p>
      ) : null}
      <Button className="mt-4 w-full" onClick={submit}>
        {!editing && <Plus className="mr-2 h-4 w-4" />} {submitLabel}
      </Button>
    </>
  );

  if (embedded) {
    return (
      <div data-tour="cf-add" className="space-y-3 pb-2">
        {manageCategoriesBtn ? <div className="flex justify-end">{manageCategoriesBtn}</div> : null}
        {formBody}
      </div>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader
        className="flex-row items-center justify-between space-y-0 gap-2 flex-wrap"
        data-tour="cf-add"
      >
        <CardTitle>{t("cashflow.addEntry")}</CardTitle>
        {manageCategoriesBtn}
      </CardHeader>
      <CardContent>{formBody}</CardContent>
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
              excludeId={editing?.id}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field htmlFor="cf-amount" label={isPercent ? t("cashflow.percent") : t("common.amount")}>
            <div className="relative">
              <Input
                id="cf-amount"
                type="number"
                step="any"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (formError?.field === "amount") setFormError(null);
                }}
                placeholder={isPercent ? "20" : "0.00"}
                className={isPercent ? "pr-8" : ""}
                aria-invalid={formError?.field === "amount"}
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
            <Field
              htmlFor="cf-date"
              label={whenMode === "recurring" ? t("cashflow.upcoming.startDate") : t("common.date")}
            >
              <Input
                id="cf-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </>
    );
  }
}

function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <Label className="text-xs" htmlFor={htmlFor}>
        {label}
      </Label>
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
  const { t } = useTranslation();
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
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="all-income">
          {t("cashflow.percentTargetIncomeAll", { defaultValue: "All income (total)" })}
        </SelectItem>
        <SelectItem value="all-expense">
          {t("cashflow.percentTargetExpenseAll", { defaultValue: "All expenses (total)" })}
        </SelectItem>
        {incomes.length > 0 && (
          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("cashflow.incomeEntriesGroup", { defaultValue: "Income entries" })}
          </div>
        )}
        {incomes.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
        {expenses.length > 0 && (
          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("cashflow.expenseEntriesGroup", { defaultValue: "Expense entries" })}
          </div>
        )}
        {expenses.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
        {!known.has(value) && (
          <SelectItem value={value}>
            {t("cashflow.deletedEntry", { defaultValue: "(deleted entry)" })}
          </SelectItem>
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
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [group, setGroup] = useState<CategoryGroup>(kind === "income" ? "income" : "expense");
  const [color, setColor] = useState<string>(
    GROUP_COLORS[kind === "income" ? "income" : "expense"],
  );

  useEffect(() => {
    setGroup(kind === "income" ? "income" : "expense");
    setColor(GROUP_COLORS[kind === "income" ? "income" : "expense"]);
  }, [kind]);

  useEffect(() => {
    setColor(GROUP_COLORS[group]);
  }, [group]);

  const groupOptions: CategoryGroup[] =
    kind === "income" ? ["income"] : ["expense", "savings", "investment"];

  function commit() {
    const n = name.trim();
    if (!n) {
      setNameError(t("more.mcNameRequired"));
      return;
    }
    onCreate({ name: n, kind, group, color });
    setName("");
    setNameError(null);
    setCreating(false);
  }

  return (
    <div className="space-y-2">
      <Select
        value={creating ? NEW_CATEGORY_VALUE : value}
        onValueChange={(v) => {
          if (v === NEW_CATEGORY_VALUE) {
            setCreating(true);
            setNameError(null);
          } else {
            setCreating(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={t("cashflow.selectCategory", { defaultValue: "Select a category" })}
          />
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
                <span className="text-[10px] uppercase text-muted-foreground">
                  {t(`more.mc${c.group[0].toUpperCase() + c.group.slice(1)}` as never)}
                </span>
              </span>
            </SelectItem>
          ))}
          <SelectItem value={NEW_CATEGORY_VALUE}>
            <span className="inline-flex items-center gap-2 text-primary">
              <Plus className="h-3.5 w-3.5" />{" "}
              {kind === "income"
                ? t("cashflow.newSourceOption", { defaultValue: "New source…" })
                : t("cashflow.newCategoryOption", { defaultValue: "New category…" })}
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
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder={
                kind === "income"
                  ? t("cashflow.categoryNameIncomePlaceholder", { defaultValue: "e.g. Bonuses" })
                  : t("cashflow.categoryNameExpensePlaceholder", {
                      defaultValue: "e.g. Subscriptions",
                    })
              }
              aria-invalid={!!nameError}
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
              title={t("common.color")}
              aria-label={t("common.color")}
            />
          </div>
          {nameError ? (
            <p className="text-xs text-destructive" role="alert">
              {nameError}
            </p>
          ) : null}
          <div className="grid grid-cols-[1fr,auto,auto] gap-2">
            <Select value={group} onValueChange={(v) => setGroup(v as CategoryGroup)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((g) => (
                  <SelectItem key={g} value={g}>
                    {t(`more.mc${g[0].toUpperCase() + g.slice(1)}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={commit}>
              {t("common.create")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Manage categories dialog ---------- */

export function CategoriesManager({
  categories,
  onAdd,
  onUpdate,
  onRemove,
  open: openProp,
  onOpenChange,
  showTrigger = true,
}: {
  categories: Category[];
  onAdd: (c: Omit<Category, "id">) => Category;
  onUpdate: (id: string, patch: Partial<Category>) => void;
  onRemove: (id: string) => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  showTrigger?: boolean;
}) {
  const { t } = useTranslation();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setUncontrolledOpen(o);
    onOpenChange?.(o);
  };
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"income" | "expense">("expense");
  const [newGroup, setNewGroup] = useState<CategoryGroup>("expense");
  const [newColor, setNewColor] = useState<string>(GROUP_COLORS.expense);
  const [nameError, setNameError] = useState<string | null>(null);

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
    if (!n) {
      setNameError(t("more.mcNameRequired"));
      return;
    }
    onAdd({ name: n, kind: newKind, group: newGroup, color: newColor });
    setNewName("");
    setNameError(null);
  }

  return (
    <>
      {showTrigger && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          title={t("more.mcTitle")}
          onClick={() => setOpen(true)}
        >
          <SettingsIcon className="h-3.5 w-3.5" /> {t("more.mcTrigger")}
        </Button>
      )}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t("more.mcTitle")}
        description={t("more.mcDesc")}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs font-medium mb-2">{t("more.mcAddNew")}</div>
            <div className="grid grid-cols-[1fr,auto] gap-2">
              <Input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder={t("more.mcNamePlaceholder")}
                aria-invalid={!!nameError}
              />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-border/60 bg-transparent p-0"
                aria-label={t("common.color")}
              />
            </div>
            {nameError ? (
              <p className="mt-1.5 text-xs text-destructive" role="alert">
                {nameError}
              </p>
            ) : null}
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
      </ResponsiveDialog>
    </>
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
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  if (!list.length) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{title}</div>
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
                    {t(`more.mc${g[0].toUpperCase() + g.slice(1)}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={t("more.mcRenameAria", {
                name: c.name,
                defaultValue: `Rename category ${c.name}`,
              })}
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
              aria-label={t("more.mcDeleteAria", {
                name: c.name,
                defaultValue: `Delete category ${c.name}`,
              })}
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
