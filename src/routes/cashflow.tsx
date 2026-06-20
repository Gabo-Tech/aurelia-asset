import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from "recharts";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app-shell";
import { formatUSD } from "@/lib/format";
import { Trash2, Plus } from "lucide-react";
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

const PALETTE = [
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

function CashflowPage() {
  const { state, addCashflow, removeCashflow } = useStore();
  const { cashflows } = state;

  const totals = useMemo(() => {
    const income = cashflows.filter((c) => c.kind === "income").reduce((s, c) => s + c.amount, 0);
    const expense = cashflows.filter((c) => c.kind === "expense").reduce((s, c) => s + c.amount, 0);
    return { income, expense, net: income - expense };
  }, [cashflows]);

  const sankey = useMemo(() => {
    if (!cashflows.length) return null;
    const incomes = cashflows.filter((c) => c.kind === "income");
    const expenses = cashflows.filter((c) => c.kind === "expense");

    const sources = Array.from(new Set(incomes.map((i) => `Src: ${i.source || "Other"}`)));
    const categories = Array.from(new Set(expenses.map((e) => `Cat: ${e.category || "Other"}`)));
    const pool = "Cash Pool";
    const savings = "Saved";

    const totalIn = incomes.reduce((s, c) => s + c.amount, 0);
    const totalOut = expenses.reduce((s, c) => s + c.amount, 0);
    const saved = Math.max(0, totalIn - totalOut);

    const nodeNames = [...sources, pool, ...categories, ...(saved > 0 ? [savings] : [])];
    const idxOf = (name: string) => nodeNames.indexOf(name);
    const links: { source: number; target: number; value: number }[] = [];

    // Sources -> pool
    for (const s of sources) {
      const sum = incomes
        .filter((i) => `Src: ${i.source || "Other"}` === s)
        .reduce((a, b) => a + b.amount, 0);
      if (sum > 0) links.push({ source: idxOf(s), target: idxOf(pool), value: sum });
    }
    // Pool -> categories
    for (const c of categories) {
      const sum = expenses
        .filter((e) => `Cat: ${e.category || "Other"}` === c)
        .reduce((a, b) => a + b.amount, 0);
      if (sum > 0) links.push({ source: idxOf(pool), target: idxOf(c), value: sum });
    }
    if (saved > 0) links.push({ source: idxOf(pool), target: idxOf(savings), value: saved });

    if (!links.length) return null;
    return {
      nodes: nodeNames.map((n, i) => ({ name: n, fill: PALETTE[i % PALETTE.length] })),
      links,
    };
  }, [cashflows]);

  return (
    <>
      <PageHeader title="Cashflow" description="Income and expenses, visualized." />

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard label="Income" value={formatUSD(totals.income)} tone="success" />
        <StatCard label="Expenses" value={formatUSD(totals.expense)} tone="destructive" />
        <StatCard
          label="Net"
          value={`${totals.net >= 0 ? "+" : "-"}${formatUSD(Math.abs(totals.net))}`}
          tone={totals.net >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <AddForm
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
            <div className="h-80">
              {sankey ? (
                <ResponsiveContainer width="100%" height="100%">
                  <Sankey
                    data={sankey}
                    nodePadding={20}
                    margin={{ top: 10, left: 10, right: 10, bottom: 10 }}
                    link={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.15 }}
                    node={<SankeyNode />}
                  >
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => formatUSD(value)}
                    />
                  </Sankey>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  Add some income and expenses to see the flow.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 mt-5">
        <CardHeader>
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {cashflows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No entries yet.
            </div>
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
                        <td className="py-2.5">
                          {c.kind === "income" ? c.source : c.category}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-medium">
                          {formatUSD(c.amount)}
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
  date: string;
};

function AddForm({ onAdd }: { onAdd: (e: FormVals) => void }) {
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  function submit() {
    const a = parseFloat(amount);
    if (!isFinite(a) || a <= 0) return toast.error("Amount must be > 0");
    if (kind === "income" && !source.trim()) return toast.error("Source required");
    if (kind === "expense" && !category.trim()) return toast.error("Category required");
    onAdd({ kind, source, category, amount: a, date: new Date(date).toISOString() });
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <Input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
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

// Custom Sankey node (rounded fills)
function SankeyNode(props: any) {
  const { x, y, width, height, index, payload, containerWidth } = props;
  const isOut = x + width + 6 > containerWidth;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={payload.fill} fillOpacity={0.9} />
      <text
        textAnchor={isOut ? "end" : "start"}
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        fontSize="11"
        dy="0.35em"
        fill="var(--foreground)"
      >
        {payload.name.replace(/^(Src|Cat): /, "")}
      </text>
    </Layer>
  );
}
