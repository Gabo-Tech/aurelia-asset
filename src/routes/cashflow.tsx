import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SankeyChart } from "@/components/sankey-chart";
import { useStore, useMoney } from "@/lib/store";
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
import { Trash2, Plus, Palette, RotateCcw, Settings as SettingsIcon, Pencil, Download } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, startOfMonth, startOfYear, endOfWeek, endOfMonth, endOfYear, isWithinInterval, parseISO, eachDayOfInterval } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/cashflow")({
  head: () => ({
    meta: [
      { title: "Cashflow — Elegant Portfolio Tracker" },
      { name: "description", content: "Track income and expenses with a beautiful Sankey diagram." },
    ],
  }),
  component: CashflowPage,
});

import { GROUP_COLORS, type Category, type CategoryGroup } from "@/lib/types";

const POOL_COLOR = "#64748b";
const SAVED_COLOR = "#0ea5e9";

type LabelMode = "always" | "hover" | "off";
const PREF_KEY = "ept_cashflow_sankey_prefs_v1";

type Prefs = {
  labelMode: LabelMode;
  nodeColors: Record<string, string>;
};

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return { labelMode: "always", nodeColors: {} };
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (!raw) return { labelMode: "always", nodeColors: {} };
    const p = JSON.parse(raw);
    return {
      labelMode: p.labelMode ?? "always",
      nodeColors: p.nodeColors ?? {},
    };
  } catch {
    return { labelMode: "always", nodeColors: {} };
  }
}


function CashflowPage() {
  const { state, addCashflow, updateCashflow, removeCashflow, addCategory, updateCategory, removeCategory } = useStore();
  const { mask, toDisplay, currency, privacy, MASK } = useMoney();
  const { cashflows, categories } = state;

  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  useEffect(() => {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);

  // Resolve the color/group for a given category name.
  const catByName = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.name, c);
    return m;
  }, [categories]);

  const colorFor = (name: string, fallbackGroup: CategoryGroup) =>
    prefs.nodeColors[name] ?? catByName.get(name)?.color ?? GROUP_COLORS[fallbackGroup];

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const c of cashflows) {
      const v = toDisplay(c.amount, c.currency);
      if (c.kind === "income") income += v;
      else expense += v;
    }
    return { income, expense, net: income - expense };
  }, [cashflows, toDisplay]);

  const sankey = useMemo(() => {
    if (!cashflows.length) return null;
    const incomes = cashflows.filter((c) => c.kind === "income");
    const expenses = cashflows.filter((c) => c.kind === "expense");

    const sources = Array.from(new Set(incomes.map((i) => i.source || "Other")));
    const cats = Array.from(new Set(expenses.map((e) => e.category || "Other")));
    const POOL = "Cash Pool";
    const SAVED = "Saved";

    const totalIn = incomes.reduce((s, c) => s + toDisplay(c.amount, c.currency), 0);
    const totalOut = expenses.reduce((s, c) => s + toDisplay(c.amount, c.currency), 0);
    const saved = Math.max(0, totalIn - totalOut);

    type NodeMeta = { name: string; kind: "income" | "pool" | "expense" | "saved"; fill: string };
    const nodes: NodeMeta[] = [];

    sources.forEach((s) =>
      nodes.push({ name: s, kind: "income", fill: colorFor(s, "income") }),
    );
    nodes.push({ name: POOL, kind: "pool", fill: prefs.nodeColors[POOL] ?? POOL_COLOR });
    cats.forEach((c) => {
      const meta = catByName.get(c);
      const group: CategoryGroup = meta?.group ?? "expense";
      nodes.push({ name: c, kind: "expense", fill: colorFor(c, group) });
    });
    if (saved > 0) {
      nodes.push({ name: SAVED, kind: "saved", fill: prefs.nodeColors[SAVED] ?? SAVED_COLOR });
    }

    const idx = (name: string) => nodes.findIndex((n) => n.name === name);
    const links: { source: number; target: number; value: number }[] = [];

    for (const s of sources) {
      const sum = incomes
        .filter((i) => (i.source || "Other") === s)
        .reduce((a, b) => a + toDisplay(b.amount, b.currency), 0);
      if (sum > 0) links.push({ source: idx(s), target: idx(POOL), value: sum });
    }
    for (const c of cats) {
      const sum = expenses
        .filter((e) => (e.category || "Other") === c)
        .reduce((a, b) => a + toDisplay(b.amount, b.currency), 0);
      if (sum > 0) links.push({ source: idx(POOL), target: idx(c), value: sum });
    }
    if (saved > 0) links.push({ source: idx(POOL), target: idx(SAVED), value: saved });

    if (!links.length) return null;
    return { nodes, links };
  }, [cashflows, toDisplay, prefs.nodeColors, catByName]);


  // Unique node names for the color customizer.
  const colorableNodes = useMemo(() => {
    if (!sankey) return [];
    return sankey.nodes.map((n) => ({ name: n.name, fill: n.fill, kind: n.kind }));
  }, [sankey]);

  function resetColors() {
    setPrefs((p) => ({ ...p, nodeColors: {} }));
  }

  return (
    <>
      <PageHeader title="Cashflow" description="Income and expenses, visualized." />

      <div className="grid grid-cols-3 gap-2 sm:gap-5">
        <StatCard label="Income" value={privacy ? MASK : formatMoney(totals.income, currency)} tone="success" />
        <StatCard label="Expenses" value={privacy ? MASK : formatMoney(totals.expense, currency)} tone="destructive" />
        <StatCard
          label="Net"
          value={privacy ? MASK : `${totals.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(totals.net), currency)}`}
          tone={totals.net >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <AddForm
          defaultCurrency={currency}
          categories={categories}
          onAddCategory={addCategory}
          onUpdateCategory={updateCategory}
          onRemoveCategory={removeCategory}
          onAdd={(e) => {
            addCashflow(e);
            toast.success(`${e.kind === "income" ? "Income" : "Expense"} added`);
          }}
        />

        <Card className="border-border/60 min-w-0">
          <CardHeader className="px-3 sm:px-6">
            <CardTitle>Flow</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ChartFrame
              filename="cashflow"
              title="Cashflow"
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
                    height={420}
                    labelMode={prefs.labelMode}
                    format={(v: number) => (privacy ? MASK : formatMoney(v, currency))}
                  />
                ) : (
                  <div className="grid h-80 place-items-center text-sm text-muted-foreground">
                    Add some income and expenses to see the flow.
                  </div>
                )}
              </div>

            </ChartFrame>
          </CardContent>
        </Card>
      </div>

      <EntriesPanel
        cashflows={cashflows}
        categories={categories}
        currency={currency}
        privacy={privacy}
        MASK={MASK}
        mask={mask}
        toDisplay={toDisplay}
        onRemove={removeCashflow}
        onUpdate={updateCashflow}
      />
    </>
  );
}

/* ---------- Entries panel: filters, chart, table, PDF export ---------- */

type PeriodKey = "all" | "week" | "month" | "year" | "custom";

function EntriesPanel({
  cashflows,
  categories,
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
  currency: string;
  privacy: boolean;
  MASK: string;
  mask: (amount: number, from?: string) => string;
  toDisplay: (amount: number, from?: string) => number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<import("@/lib/types").CashflowEntry>) => void;
}) {
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

  const filtered = useMemo(() => {
    return cashflows.filter((c) => {
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      const name = c.kind === "income" ? c.source : c.category;
      if (categoryFilter !== "all" && name !== categoryFilter) return false;
      if (interval) {
        const d = new Date(c.date);
        if (!isWithinInterval(d, interval)) return false;
      }
      return true;
    });
  }, [cashflows, kindFilter, categoryFilter, interval]);

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

  // Chart series: per-day income & expense in display currency, over the selected interval.
  const chartData = useMemo(() => {
    if (!filtered.length) return [];
    const start = interval?.start ?? new Date(Math.min(...filtered.map((c) => +new Date(c.date))));
    const end = interval?.end ?? new Date(Math.max(...filtered.map((c) => +new Date(c.date))));
    const days = eachDayOfInterval({ start, end });
    const byDay = new Map<string, { income: number; expense: number }>();
    for (const d of days) byDay.set(format(d, "yyyy-MM-dd"), { income: 0, expense: 0 });
    for (const c of filtered) {
      const key = format(new Date(c.date), "yyyy-MM-dd");
      const bucket = byDay.get(key) ?? { income: 0, expense: 0 };
      const v = toDisplay(c.amount, c.currency);
      if (c.kind === "income") bucket.income += v;
      else bucket.expense += v;
      byDay.set(key, bucket);
    }
    return Array.from(byDay.entries()).map(([date, v]) => ({
      date,
      label: format(parseISO(date), "MMM d"),
      income: +v.income.toFixed(2),
      expense: +v.expense.toFixed(2),
      net: +(v.income - v.expense).toFixed(2),
    }));
  }, [filtered, interval, toDisplay]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const c of filtered) {
      const v = toDisplay(c.amount, c.currency);
      if (c.kind === "income") income += v;
      else expense += v;
    }
    return { income, expense, net: income - expense };
  }, [filtered, toDisplay]);

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
      const maxVal = Math.max(
        1,
        ...chartData.map((d) => Math.max(d.income, d.expense, Math.abs(d.net))),
      );
      const xStep = chartData.length > 1 ? chartW / (chartData.length - 1) : 0;
      const yFor = (v: number) => chartBottom - (v / maxVal) * (chartH - 10);

      // Y-axis ticks
      doc.setFontSize(8);
      doc.setTextColor(140);
      for (let i = 0; i <= 4; i++) {
        const v = (maxVal / 4) * i;
        const y = yFor(v);
        doc.setDrawColor(235);
        doc.line(chartLeft, y, chartLeft + chartW, y);
        doc.text(formatMoney(v, currency, { compact: true }), chartLeft - 4, y + 3, { align: "right" });
      }

      const drawSeries = (key: "income" | "expense" | "net", color: [number, number, number]) => {
        doc.setDrawColor(color[0], color[1], color[2]);
        doc.setLineWidth(1.2);
        for (let i = 0; i < chartData.length - 1; i++) {
          const x1 = chartLeft + i * xStep;
          const x2 = chartLeft + (i + 1) * xStep;
          const y1 = yFor(Math.max(0, chartData[i][key]));
          const y2 = yFor(Math.max(0, chartData[i + 1][key]));
          doc.line(x1, y1, x2, y2);
        }
      };

      if (kindFilter !== "expense") drawSeries("income", [34, 197, 94]);
      if (kindFilter !== "income") drawSeries("expense", [239, 68, 68]);
      if (kindFilter === "all") drawSeries("net", [59, 130, 246]);

      // X-axis labels (sparse)
      const step = Math.max(1, Math.ceil(chartData.length / 6));
      doc.setTextColor(140);
      for (let i = 0; i < chartData.length; i += step) {
        const x = chartLeft + i * xStep;
        doc.text(chartData[i].label, x, chartBottom + 12, { align: "center" });
      }

      // Legend
      let legendX = chartLeft;
      const legendY = chartTop - 8;
      const legendItem = (label: string, color: [number, number, number]) => {
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(legendX, legendY - 6, 8, 8, "F");
        doc.setTextColor(80);
        doc.text(label, legendX + 12, legendY);
        legendX += doc.getTextWidth(label) + 30;
      };
      if (kindFilter !== "expense") legendItem("Income", [34, 197, 94]);
      if (kindFilter !== "income") legendItem("Expenses", [239, 68, 68]);
      if (kindFilter === "all") legendItem("Net", [59, 130, 246]);
    }

    // Table
    const rows = [...filtered]
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))
      .map((c) => [
        format(new Date(c.date), "yyyy-MM-dd"),
        c.kind,
        c.kind === "income" ? c.source : c.category,
        formatMoney(c.amount, (c.currency || currency).toUpperCase()),
        formatMoney(toDisplay(c.amount, c.currency), currency),
      ]);

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
      margin: { left: margin, right: margin },
    });

    const fname = `cashflow_${period}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`;
    doc.save(fname);
    toast.success("PDF exported");
  }

  return (
    <Card className="border-border/60 mt-5">
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
        <CardTitle>Entries</CardTitle>
        <Button size="sm" variant="outline" onClick={exportPdf} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export PDF
        </Button>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
              <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {availableCategories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="year">This year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" className="h-9 mt-1.5" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" className="h-9 mt-1.5" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
          <span className="rounded-md bg-muted/50 px-2 py-1">{periodLabel}</span>
          <span className="rounded-md bg-success/15 text-success px-2 py-1">
            Income: {privacy ? MASK : formatMoney(totals.income, currency)}
          </span>
          <span className="rounded-md bg-destructive/15 text-destructive px-2 py-1">
            Expenses: {privacy ? MASK : formatMoney(totals.expense, currency)}
          </span>
          <span className={`rounded-md px-2 py-1 ${totals.net >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
            Net: {privacy ? MASK : `${totals.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(totals.net), currency)}`}
          </span>
          <span className="ml-auto">{filtered.length} entries</span>
        </div>

        {/* Evolution chart */}
        {chartData.length > 0 ? (
          <div className="h-56 w-full mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" minTickGap={20} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatMoney(v, currency, { compact: true })} width={70} />
                <RTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => (privacy ? MASK : formatMoney(v, currency))}
                />
                {kindFilter !== "expense" && (
                  <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} dot={false} name="Income" />
                )}
                {kindFilter !== "income" && (
                  <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} dot={false} name="Expenses" />
                )}
                {kindFilter === "all" && (
                  <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} dot={false} name="Net" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-32 grid place-items-center text-sm text-muted-foreground border border-dashed border-border/50 rounded-md mb-4">
            No data for the selected filters.
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No entries match the filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Date</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Source / Category</th>
                  <th className="py-2 text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {[...filtered]
                  .sort((a, b) => +new Date(b.date) - +new Date(a.date))
                  .map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 text-muted-foreground">
                        {format(new Date(c.date), "MMM d, yyyy")}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            c.kind === "income"
                              ? "bg-success/15 text-success"
                              : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {c.kind}
                        </span>
                      </td>
                      <td className="py-2.5">{c.kind === "income" ? c.source : c.category}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium">
                        {privacy
                          ? MASK
                          : formatMoney(c.amount, (c.currency || currency).toUpperCase())}
                        {c.currency && c.currency.toUpperCase() !== currency && (
                          <span
                            className="ml-1.5 text-[10px] uppercase text-muted-foreground"
                            title={`≈ ${mask(c.amount, c.currency)} in ${currency}`}
                          >
                            ≈ {mask(c.amount, c.currency)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditing(c)}
                            aria-label="Edit entry"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onRemove(c.id)}
                            aria-label="Delete entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
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
  nodes: { name: string; fill: string; kind: string }[];
  resetColors: () => void;
}) {
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
          <SelectItem value="always">Labels: always</SelectItem>
          <SelectItem value="hover">Labels: hover</SelectItem>
          <SelectItem value="off">Labels: off</SelectItem>
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            title="Customize colors"
            aria-label="Customize colors"
            disabled={nodes.length === 0}
          >
            <Palette className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">Node colors</div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={resetColors}
            >
              <RotateCcw className="h-3 w-3" /> Reset
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
  kind: "income" | "expense";
  source: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
};

function AddForm({
  onAdd,
  defaultCurrency,
  categories,
  onAddCategory,
  onUpdateCategory,
  onRemoveCategory,
}: {
  onAdd: (e: FormVals) => void;
  defaultCurrency: string;
  categories: Category[];
  onAddCategory: (c: Omit<Category, "id">) => Category;
  onUpdateCategory: (id: string, patch: Partial<Category>) => void;
  onRemoveCategory: (id: string) => void;
}) {
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [categoryName, setCategoryName] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [entryCurrency, setEntryCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  );

  // Keep the selected category valid when switching tabs.
  useEffect(() => {
    if (!visibleCategories.find((c) => c.name === categoryName)) {
      setCategoryName(visibleCategories[0]?.name ?? "");
    }
  }, [visibleCategories, categoryName]);

  function submit() {
    const a = parseFloat(amount);
    if (!isFinite(a) || a <= 0) return toast.error("Amount must be > 0");
    if (!categoryName.trim()) return toast.error("Pick a category");
    onAdd({
      kind,
      source: kind === "income" ? categoryName : "",
      category: kind === "expense" ? categoryName : "",
      amount: a,
      currency: entryCurrency,
      date: new Date(date).toISOString(),
    });
    setAmount("");
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
        <CardTitle>Add entry</CardTitle>
        <CategoriesManager
          categories={categories}
          onAdd={onAddCategory}
          onUpdate={onUpdateCategory}
          onRemove={onRemoveCategory}
        />
      </CardHeader>
      <CardContent>
        <Tabs value={kind} onValueChange={(v) => setKind(v as "income" | "expense")}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="expense">Expense</TabsTrigger>
          </TabsList>
          <TabsContent value={kind} className="mt-4 space-y-3">
            <Field label={kind === "income" ? "Source" : "Category"}>
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
          </TabsContent>
        </Tabs>
        <Button className="mt-4 w-full" onClick={submit}>
          <Plus className="mr-2 h-4 w-4" /> Add {kind}
        </Button>
      </CardContent>
    </Card>
  );

  function sharedFields() {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Amount">
          <Input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Currency">
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
        <div className="col-span-2 sm:col-span-1">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </div>
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
    if (!n) return toast.error("Name required");
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
          title="Manage categories"
        >
          <SettingsIcon className="h-3.5 w-3.5" /> Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
          <DialogDescription>
            Organize income sources and expense categories. Savings and Investments are
            expense-side categories with their own coloring.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs font-medium mb-2">Add new</div>
            <div className="grid grid-cols-[1fr,auto] gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Category name"
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
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
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
                      {g[0].toUpperCase() + g.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={create}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>

          <CategoryList
            title="Income"
            list={grouped.inc}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
          <CategoryList
            title="Expenses"
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


