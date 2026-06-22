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
  const { state, addCashflow, removeCashflow, addCategory, updateCategory, removeCategory } = useStore();
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
      <CardHeader className="flex-row items-center justify-between space-y-0">
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


