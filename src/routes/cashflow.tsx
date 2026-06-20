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
import { Trash2, Plus, Palette, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/cashflow")({
  head: () => ({
    meta: [
      { title: "Cashflow — Elegant Portfolio Tracker" },
      { name: "description", content: "Track income and expenses with a beautiful Sankey diagram." },
    ],
  }),
  component: CashflowPage,
});

// Defaults inspired by the Microsoft income-statement style:
// income/sources → greens, the cash pool → neutral, expenses → warm reds.
const DEFAULT_INCOME_COLORS = ["#22c55e", "#34d399", "#10b981", "#4ade80", "#86efac", "#65a30d"];
const DEFAULT_EXPENSE_COLORS = ["#ef4444", "#f97316", "#fb7185", "#f59e0b", "#e11d48", "#dc2626"];
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
  const { state, addCashflow, removeCashflow } = useStore();
  const { mask, toDisplay, currency } = useMoney();
  const { cashflows } = state;

  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  useEffect(() => {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);

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
    const categories = Array.from(new Set(expenses.map((e) => e.category || "Other")));
    const POOL = "Cash Pool";
    const SAVED = "Saved";

    const totalIn = incomes.reduce((s, c) => s + toDisplay(c.amount, c.currency), 0);
    const totalOut = expenses.reduce((s, c) => s + toDisplay(c.amount, c.currency), 0);
    const saved = Math.max(0, totalIn - totalOut);

    type NodeMeta = { name: string; kind: "income" | "pool" | "expense" | "saved"; fill: string };
    const nodes: NodeMeta[] = [];

    sources.forEach((s, i) =>
      nodes.push({
        name: s,
        kind: "income",
        fill: prefs.nodeColors[s] ?? DEFAULT_INCOME_COLORS[i % DEFAULT_INCOME_COLORS.length],
      }),
    );
    nodes.push({ name: POOL, kind: "pool", fill: prefs.nodeColors[POOL] ?? POOL_COLOR });
    categories.forEach((c, i) =>
      nodes.push({
        name: c,
        kind: "expense",
        fill: prefs.nodeColors[c] ?? DEFAULT_EXPENSE_COLORS[i % DEFAULT_EXPENSE_COLORS.length],
      }),
    );
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
    for (const c of categories) {
      const sum = expenses
        .filter((e) => (e.category || "Other") === c)
        .reduce((a, b) => a + toDisplay(b.amount, b.currency), 0);
      if (sum > 0) links.push({ source: idx(POOL), target: idx(c), value: sum });
    }
    if (saved > 0) links.push({ source: idx(POOL), target: idx(SAVED), value: saved });

    if (!links.length) return null;
    return { nodes, links };
  }, [cashflows, toDisplay, prefs.nodeColors]);

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

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard label="Income" value={mask(totals.income)} tone="success" />
        <StatCard label="Expenses" value={mask(totals.expense)} tone="destructive" />
        <StatCard
          label="Net"
          value={`${totals.net >= 0 ? "+" : "-"}${mask(Math.abs(totals.net))}`}
          tone={totals.net >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <AddForm
          defaultCurrency={currency}
          onAdd={(e) => {
            addCashflow(e);
            toast.success(`${e.kind === "income" ? "Income" : "Expense"} added`);
          }}
        />

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Flow</CardTitle>
          </CardHeader>
          <CardContent>
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
              <div className="min-h-80 sm:min-h-96">
                {sankey ? (
                  <SankeyChart
                    data={sankey}
                    height={420}
                    labelMode={prefs.labelMode}
                    format={(v: number) => mask(v)}
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

      <Card className="border-border/60 mt-5">
        <CardHeader>
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {cashflows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No entries yet.</div>
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
                  {[...cashflows]
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
                          {mask(c.amount, c.currency)}
                          {c.currency && c.currency !== currency && (
                            <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                              {c.currency}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeCashflow(c.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
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
        <SelectTrigger className="h-8 w-[120px] text-xs">
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
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`mt-2 text-2xl font-semibold tracking-tight ${
            tone === "success" ? "text-success" : "text-destructive"
          }`}
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
}: {
  onAdd: (e: FormVals) => void;
  defaultCurrency: string;
}) {
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [entryCurrency, setEntryCurrency] = useState(defaultCurrency);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  function submit() {
    const a = parseFloat(amount);
    if (!isFinite(a) || a <= 0) return toast.error("Amount must be > 0");
    if (kind === "income" && !source.trim()) return toast.error("Source required");
    if (kind === "expense" && !category.trim()) return toast.error("Category required");
    onAdd({
      kind,
      source,
      category,
      amount: a,
      currency: entryCurrency,
      date: new Date(date).toISOString(),
    });
    setSource("");
    setCategory("");
    setAmount("");
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Add entry</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={kind} onValueChange={(v) => setKind(v as "income" | "expense")}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="expense">Expense</TabsTrigger>
          </TabsList>
          <TabsContent value="income" className="mt-4 space-y-3">
            <Field label="Source">
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Salary, Dividends, Freelance…"
              />
            </Field>
            {sharedFields()}
          </TabsContent>
          <TabsContent value="expense" className="mt-4 space-y-3">
            <Field label="Category">
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Rent, Food, Travel…"
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
      <div className="grid grid-cols-3 gap-3">
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
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
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

/**
 * Custom Sankey node: rounded block with name + value label.
 * Label visibility honors the user-selected mode (always / hover / off).
 */
function SankeyNode(props: any) {
  const {
    x,
    y,
    width,
    height,
    index,
    payload,
    containerWidth,
    labelMode,
    format,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    index: number;
    payload: { name: string; value: number; fill: string };
    containerWidth: number;
    labelMode: LabelMode;
    format: (v: number) => string;
  } = props;

  const isOut = x + width + 6 > containerWidth - 20;
  const showLabel = labelMode === "always" || labelMode === "hover";
  const labelClass =
    labelMode === "hover"
      ? "opacity-0 transition-opacity duration-150 [g:hover>&]:opacity-100"
      : "";

  return (
    <Layer key={`node-${index}`} className="group">
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={payload.fill}
        fillOpacity={0.95}
        radius={[3, 3, 3, 3] as any}
      />
      {showLabel && (
        <g className={labelClass}>
          <text
            textAnchor={isOut ? "end" : "start"}
            x={isOut ? x - 8 : x + width + 8}
            y={y + height / 2 - 6}
            fontSize="12"
            fontWeight={600}
            fill="var(--foreground)"
          >
            {payload.name}
          </text>
          <text
            textAnchor={isOut ? "end" : "start"}
            x={isOut ? x - 8 : x + width + 8}
            y={y + height / 2 + 9}
            fontSize="11"
            fill="var(--muted-foreground)"
          >
            {format(payload.value)}
          </text>
        </g>
      )}
    </Layer>
  );
}

/**
 * Colored, translucent ribbon — same hue as the source node so flows
 * read like the Microsoft-style example.
 */
function SankeyLink(props: any) {
  const {
    sourceX,
    targetX,
    sourceY,
    targetY,
    sourceControlX,
    targetControlX,
    linkWidth,
    nodes,
    payload,
  } = props;

  const sourceIdx = typeof payload?.source === "object" ? payload.source.index : payload?.source;
  const fill = nodes?.[sourceIdx]?.fill ?? "var(--muted-foreground)";

  const d = `
    M${sourceX},${sourceY}
    C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
    L${targetX},${targetY + linkWidth}
    C${targetControlX},${targetY + linkWidth} ${sourceControlX},${sourceY + linkWidth} ${sourceX},${sourceY + linkWidth}
    Z
  `;

  return <path d={d} fill={fill} fillOpacity={0.28} stroke="none" />;
}
