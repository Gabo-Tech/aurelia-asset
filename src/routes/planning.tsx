import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addMonths, format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { useStore, useMoney } from "@/lib/store";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, Pencil } from "lucide-react";
import { expandCashflows, liquidityImpact, valuesByEntry } from "./cashflow";
import { amortize } from "@/lib/finance/amortization";
import { CURRENCIES } from "@/lib/currency";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Budget, Loan, SavingsGoal } from "@/lib/types";

export const Route = createFileRoute("/planning")({
  head: () => ({
    meta: [
      { title: "Planning · Budgets, Goals, Forecast, Loans" },
      { name: "description", content: "Plan your finances: monthly budgets, savings goals, cashflow forecasts and loan amortization." },
    ],
  }),
  component: PlanningPage,
});

function PlanningPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader
        title={t("planning.title", "Planning")}
        description={t("planning.description", "Budgets, goals, forecasts and loans - all derived from your existing cashflow.")}
      />
      <Tabs defaultValue="budgets" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="budgets">{t("planning.tabs.budgets", "Budgets")}</TabsTrigger>
          <TabsTrigger value="goals">{t("planning.tabs.goals", "Savings goals")}</TabsTrigger>
          <TabsTrigger value="forecast">{t("planning.tabs.forecast", "Forecast")}</TabsTrigger>
          <TabsTrigger value="loans">{t("planning.tabs.loans", "Loans")}</TabsTrigger>
        </TabsList>
        <TabsContent value="budgets" className="mt-6">
          <BudgetsPanel />
        </TabsContent>
        <TabsContent value="goals" className="mt-6">
          <GoalsPanel />
        </TabsContent>
        <TabsContent value="forecast" className="mt-6">
          <ForecastPanel />
        </TabsContent>
        <TabsContent value="loans" className="mt-6">
          <LoansPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------- Budgets -------------------- */

function CurrencyPicker({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72">
        {CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BudgetsPanel() {
  const { state, addBudget, updateBudget, removeBudget } = useStore();
  const { fmt, toDisplay, currency: displayCurrency } = useMoney();
  const expenseCats = state.categories.filter((c) => c.kind === "expense");
  const [categoryId, setCategoryId] = useState<string>(expenseCats[0]?.id ?? "");
  const [amount, setAmount] = useState<string>("");
  const [entryCurrency, setEntryCurrency] = useState<string>(displayCurrency);

  // Compute this month's spent per category
  const monthSpent = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    const expanded = expandCashflows(state.cashflows, end);
    const values = valuesByEntry(expanded, toDisplay);
    const byCat = new Map<string, number>();
    for (const e of expanded) {
      if (e.kind !== "expense") continue;
      const d = new Date(e.date);
      if (!isWithinInterval(d, { start, end })) continue;
      const v = values.get(e.id) ?? 0;
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + v);
    }
    return byCat;
  }, [state.cashflows, toDisplay]);

  const submit = () => {
    const a = Number(amount);
    if (!categoryId || !Number.isFinite(a) || a <= 0) return;
    addBudget({ categoryId, amount: a, currency: entryCurrency, period: "monthly" });
    setAmount("");
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Add monthly budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
              <SelectContent>
                {expenseCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <Label>Monthly limit</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500" />
            </div>
            <div>
              <Label>Currency</Label>
              <CurrencyPicker value={entryCurrency} onChange={setEntryCurrency} className="w-28" />
            </div>
          </div>
          <Button onClick={submit} className="w-full"><Plus className="h-4 w-4 mr-1" />Add budget</Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">This month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No budgets yet. Add a monthly limit to a category to start tracking.</p>
          ) : null}
          {state.budgets.map((b) => {
            const cat = state.categories.find((c) => c.id === b.categoryId);
            const spent = monthSpent.get(b.categoryId) ?? 0;
            const budgetDisp = toDisplay(b.amount, b.currency);
            const pct = Math.min(100, (spent / Math.max(0.0001, budgetDisp)) * 100);
            const over = spent > budgetDisp;
            return (
              <div key={b.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: cat?.color || "#888" }} />
                    {cat?.name || "Unknown"}
                  </span>
                  <span className={over ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {fmt(spent)} / {fmt(b.amount, b.currency)}
                  </span>
                </div>
                <Progress value={pct} className={over ? "[&>div]:bg-destructive" : ""} />
                <div className="flex items-center justify-between text-xs">
                  <span className={over ? "text-destructive" : "text-muted-foreground"}>
                    {over ? `Over by ${fmt(spent - budgetDisp)}` : `${fmt(budgetDisp - spent)} left`}
                  </span>
                  <div className="flex items-center gap-1">
                    <EditBudgetButton budget={b} onSave={(patch) => updateBudget(b.id, patch)} />
                    <Button size="icon" variant="ghost" onClick={() => removeBudget(b.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function EditBudgetButton({ budget, onSave }: { budget: Budget; onSave: (p: Partial<Budget>) => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(budget.amount));
  if (!editing) {
    return (
      <Button size="icon" variant="ghost" onClick={() => setEditing(true)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Input className="h-7 w-24" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Button size="sm" variant="secondary" onClick={() => { const a = Number(amount); if (Number.isFinite(a) && a > 0) onSave({ amount: a }); setEditing(false); }}>OK</Button>
    </div>
  );
}

/* -------------------- Goals -------------------- */

const GOAL_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#a78bfa", "#f472b6", "#22c55e"];

function GoalsPanel() {
  const { state, addGoal, updateGoal, removeGoal } = useStore();
  const { fmt, currency: displayCurrency } = useMoney();
  const [form, setForm] = useState({ name: "", target: "", current: "", date: "", currency: displayCurrency });

  const submit = () => {
    const target = Number(form.target);
    const current = Number(form.current) || 0;
    if (!form.name || !Number.isFinite(target) || target <= 0) return;
    addGoal({
      name: form.name,
      targetAmount: target,
      currentAmount: current,
      targetDate: form.date || undefined,
      currency: form.currency,
      color: GOAL_COLORS[state.goals.length % GOAL_COLORS.length],
    });
    setForm({ name: "", target: "", current: "", date: "", currency: displayCurrency });
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base">New savings goal</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Emergency fund" />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <Label>Target amount</Label>
              <Input inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="10000" />
            </div>
            <div>
              <Label>Currency</Label>
              <CurrencyPicker value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} className="w-28" />
            </div>
          </div>
          <div>
            <Label>Already saved</Label>
            <Input inputMode="decimal" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="0" />
          </div>
          <div>
            <Label>Target date (optional)</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <Button onClick={submit} className="w-full"><Plus className="h-4 w-4 mr-1" />Add goal</Button>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
        {state.goals.length === 0 ? (
          <Card className="sm:col-span-2">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">No goals yet.</CardContent>
          </Card>
        ) : null}
        {state.goals.map((g) => {
          const pct = Math.min(100, (g.currentAmount / Math.max(0.0001, g.targetAmount)) * 100);
          const remaining = Math.max(0, g.targetAmount - g.currentAmount);
          let monthly: number | null = null;
          if (g.targetDate) {
            const months = Math.max(1, Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (30 * 24 * 3600 * 1000)));
            monthly = remaining / months;
          }
          return (
            <Card key={g.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                    {g.name}
                  </CardTitle>
                  {g.targetDate ? (
                    <div className="text-xs text-muted-foreground mt-0.5">by {format(new Date(g.targetDate), "MMM d, yyyy")}</div>
                  ) : null}
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeGoal(g.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={pct} />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{fmt(g.currentAmount, g.currency)} / {fmt(g.targetAmount, g.currency)}</span>
                  <span className="font-medium">{pct.toFixed(0)}%</span>
                </div>
                {monthly != null ? (
                  <div className="text-xs text-muted-foreground">
                    Save ~{fmt(monthly, g.currency)}/mo to hit your goal.
                  </div>
                ) : null}
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    inputMode="decimal"
                    placeholder={`Add contribution (${(g.currency || displayCurrency).toUpperCase()})`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = Number((e.target as HTMLInputElement).value);
                        if (Number.isFinite(v) && v !== 0) {
                          updateGoal(g.id, { currentAmount: g.currentAmount + v });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------- Forecast -------------------- */

function ForecastPanel() {
  const { state } = useStore();
  const { fmt, toDisplay } = useMoney();
  const [months, setMonths] = useState(6);

  const data = useMemo(() => {
    const now = new Date();
    const horizon = addMonths(now, months);
    // Start from current liquidity = expanded-to-today sum
    const past = expandCashflows(state.cashflows, now);
    const pastVals = valuesByEntry(past, toDisplay);
    let balance = 0;
    for (const e of past) {
      const v = pastVals.get(e.id) ?? 0;
      balance += liquidityImpact(e, v);
    }
    const future = expandCashflows(state.cashflows, horizon).filter((e) => new Date(e.date) > now);
    const futVals = valuesByEntry(future, toDisplay);
    // Group by month
    const buckets = new Map<string, { income: number; expense: number }>();
    for (const e of future) {
      const key = format(new Date(e.date), "yyyy-MM");
      const cur = buckets.get(key) ?? { income: 0, expense: 0 };
      const v = futVals.get(e.id) ?? 0;
      if (e.kind === "income") cur.income += v;
      else if (e.kind === "expense") {
        if (!e.paymentMethod?.startsWith("credit:")) cur.expense += v;
      }
      buckets.set(key, cur);
    }
    const rows: { month: string; balance: number; income: number; expense: number; net: number }[] = [];
    for (let i = 0; i < months; i++) {
      const m = startOfMonth(addMonths(now, i + 1));
      const key = format(m, "yyyy-MM");
      const b = buckets.get(key) ?? { income: 0, expense: 0 };
      const net = b.income - b.expense;
      balance += net;
      rows.push({ month: format(m, "MMM yy"), balance, income: b.income, expense: b.expense, net });
    }
    return rows;
  }, [state.cashflows, toDisplay, months]);

  // Subscription / recurring summary
  const recurring = useMemo(() => {
    const list = state.cashflows.filter((c) => c.recurrence);
    const monthlyTotals = list.map((c) => {
      const v = toDisplay(Number(c.amount) || 0, c.currency);
      const perMonth =
        c.recurrence!.frequency === "monthly" ? v :
        c.recurrence!.frequency === "weekly" ? v * 4.345 :
        v / 12;
      return { id: c.id, name: c.source, kind: c.kind, perMonth, category: c.category };
    });
    const inc = monthlyTotals.filter((x) => x.kind === "income").reduce((s, x) => s + x.perMonth, 0);
    const exp = monthlyTotals.filter((x) => x.kind === "expense").reduce((s, x) => s + x.perMonth, 0);
    return { items: monthlyTotals, incomeMo: inc, expenseMo: exp, savingsRate: inc > 0 ? Math.max(0, (inc - exp) / inc) : 0 };
  }, [state.cashflows, toDisplay]);

  const runwayMonths = recurring.expenseMo > 0 ? data[0]?.balance / recurring.expenseMo : Infinity;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly income (recurring)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-500">{fmt(recurring.incomeMo)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly expenses (recurring)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-rose-500">{fmt(recurring.expenseMo)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Savings rate</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{(recurring.savingsRate * 100).toFixed(0)}%</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Liquidity forecast</CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <Label className="text-xs">Months</Label>
            <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
              <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 6, 12, 24].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => fmt(v, undefined, { compact: true })} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [fmt(v), name]}
                />
                <Area type="monotone" dataKey="balance" stroke="hsl(var(--primary))" fill="url(#forecastFill)" strokeWidth={2} name="Projected balance" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {runwayMonths !== Infinity ? (
            <div className="text-xs text-muted-foreground mt-2">
              At your current recurring spend you have ~{Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : "∞"} months of runway from today's liquidity.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recurring subscriptions & income</CardTitle></CardHeader>
        <CardContent>
          {recurring.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recurring entries detected. Mark income/expenses as recurring on the Cashflow page.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {recurring.items
                .sort((a, b) => b.perMonth - a.perMonth)
                .map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate">
                      <span className={`mr-2 inline-block h-2 w-2 rounded-full ${r.kind === "income" ? "bg-emerald-500" : "bg-rose-500"}`} />
                      {r.name}
                    </span>
                    <span className="tabular-nums">{fmt(r.perMonth)}/mo</span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------- Loans -------------------- */

const LOAN_COLORS = ["#ef4444", "#f59e0b", "#a78bfa", "#0ea5e9", "#10b981"];

function LoansPanel() {
  const { state, addLoan, updateLoan, removeLoan } = useStore();
  const { fmt } = useMoney();
  const [form, setForm] = useState({
    name: "",
    principal: "",
    apr: "",
    term: "",
    start: new Date().toISOString().slice(0, 10),
    extra: "",
    notes: "",
  });
  const [openId, setOpenId] = useState<string | null>(null);

  const submit = () => {
    const principal = Number(form.principal);
    const apr = Number(form.apr);
    const term = Math.floor(Number(form.term));
    if (!form.name || !Number.isFinite(principal) || principal <= 0 || term <= 0) return;
    addLoan({
      name: form.name,
      principal,
      apr: Number.isFinite(apr) ? apr : 0,
      termMonths: term,
      startDate: form.start,
      extraMonthly: Number(form.extra) || 0,
      notes: form.notes,
      color: LOAN_COLORS[state.loans.length % LOAN_COLORS.length],
    });
    setForm({ name: "", principal: "", apr: "", term: "", start: form.start, extra: "", notes: "" });
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base">New loan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mortgage" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Principal</Label><Input inputMode="decimal" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></div>
            <div><Label>APR %</Label><Input inputMode="decimal" value={form.apr} onChange={(e) => setForm({ ...form, apr: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Term (months)</Label><Input inputMode="numeric" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} /></div>
            <div><Label>Start</Label><Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
          </div>
          <div><Label>Extra monthly (optional)</Label><Input inputMode="decimal" value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <Button onClick={submit} className="w-full"><Plus className="h-4 w-4 mr-1" />Add loan</Button>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-4">
        {state.loans.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No loans tracked yet.</CardContent></Card>
        ) : null}
        {state.loans.map((loan) => (
          <LoanCard
            key={loan.id}
            loan={loan}
            open={openId === loan.id}
            onToggle={() => setOpenId(openId === loan.id ? null : loan.id)}
            onRemove={() => removeLoan(loan.id)}
            onPatch={(p) => updateLoan(loan.id, p)}
            fmt={fmt}
          />
        ))}
      </div>
    </div>
  );
}

function LoanCard({ loan, open, onToggle, onRemove, onPatch, fmt }: {
  loan: Loan;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onPatch: (p: Partial<Loan>) => void;
  fmt: (n: number) => string;
}) {
  const schedule = useMemo(() => amortize(loan), [loan]);
  const paidMonths = Math.max(0, Math.floor((Date.now() - new Date(loan.startDate).getTime()) / (30 * 24 * 3600 * 1000)));
  const upto = Math.min(paidMonths, schedule.rows.length);
  const paidPrincipal = schedule.rows.slice(0, upto).reduce((s, r) => s + r.principal + r.extra, 0);
  const remaining = Math.max(0, loan.principal - paidPrincipal);
  const pct = Math.min(100, (paidPrincipal / Math.max(0.0001, loan.principal)) * 100);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: loan.color }} />
            {loan.name}
          </CardTitle>
          <div className="text-xs text-muted-foreground mt-0.5">
            {fmt(loan.principal)} @ {loan.apr}% APR · {loan.termMonths} mo · starts {format(new Date(loan.startDate), "MMM yyyy")}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={onToggle}>{open ? "Hide" : "Schedule"}</Button>
          <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Monthly payment" value={fmt(schedule.monthlyPayment)} />
          <Stat label="Total interest" value={fmt(schedule.totalInterest)} />
          <Stat label="Remaining" value={fmt(remaining)} />
          <Stat label="Payoff" value={format(new Date(schedule.payoffDate), "MMM yyyy")} />
        </div>
        <Progress value={pct} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{pct.toFixed(1)}% paid down</span>
          <span>Extra: {fmt(loan.extraMonthly || 0)}/mo</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Extra/mo</Label>
          <Input
            className="h-7 w-28"
            inputMode="decimal"
            defaultValue={String(loan.extraMonthly || 0)}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0 && v !== (loan.extraMonthly || 0)) onPatch({ extraMonthly: v });
            }}
          />
        </div>

        {open ? (
          <div className="max-h-72 overflow-auto rounded-md border border-border/60 mt-2">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Payment</th>
                  <th className="text-right p-2">Interest</th>
                  <th className="text-right p-2">Principal</th>
                  <th className="text-right p-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((r) => (
                  <tr key={r.index} className="border-t border-border/40">
                    <td className="p-2">{r.index}</td>
                    <td className="p-2">{format(new Date(r.date), "MMM yyyy")}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(r.payment)}</td>
                    <td className="p-2 text-right tabular-nums text-rose-500">{fmt(r.interest)}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-500">{fmt(r.principal + r.extra)}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
