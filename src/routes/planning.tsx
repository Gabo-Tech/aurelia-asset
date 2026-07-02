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
import { Trash2, Plus, Pencil, TrendingUp, TrendingDown, LineChart as LineChartIcon, Repeat, Wallet } from "lucide-react";
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
import type { Budget, Loan, CashflowEntry } from "@/lib/types";

export const Route = createFileRoute("/planning")({
  head: () => {
    const title = "Planning - Budgets, Goals & Forecast";
    const desc = "Plan your finances: monthly budgets, savings goals, 24-month cashflow forecasts and loan amortization tables.";
    const url = "https://financetracker.putopulse.org/planning";
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
  component: PlanningPage,
});

function PlanningPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader
        title={t("planning.title")}
        description={t("planning.description")}
      />
      <Tabs defaultValue="budgets" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="budgets">{t("planning.tabs.budgets")}</TabsTrigger>
          <TabsTrigger value="goals">{t("planning.tabs.goals")}</TabsTrigger>
          <TabsTrigger value="forecast">{t("planning.tabs.forecast")}</TabsTrigger>
          <TabsTrigger value="loans">{t("planning.tabs.loans")}</TabsTrigger>
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
  const { t } = useTranslation();
  const { state, addBudget, updateBudget, removeBudget } = useStore();
  const { fmt, toDisplay, currency: displayCurrency } = useMoney();
  const expenseCats = state.categories.filter((c) => c.kind === "expense");
  const [categoryId, setCategoryId] = useState<string>(expenseCats[0]?.id ?? "");
  const [amount, setAmount] = useState<string>("");
  const [entryCurrency, setEntryCurrency] = useState<string>(displayCurrency);

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
          <CardTitle className="text-base">{t("planning.budgets.addTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("planning.budgets.category")}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder={t("planning.budgets.pickCategory")} /></SelectTrigger>
              <SelectContent>
                {expenseCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <Label>{t("planning.budgets.monthlyLimit")}</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("planning.budgets.limitPlaceholder")} />
            </div>
            <div>
              <Label>{t("planning.budgets.currency")}</Label>
              <CurrencyPicker value={entryCurrency} onChange={setEntryCurrency} className="w-28" />
            </div>
          </div>
          <Button onClick={submit} className="w-full"><Plus className="h-4 w-4 mr-1" />{t("planning.budgets.addBudget")}</Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>{t("planning.budgets.thisMonth")}</span>
            {state.budgets.length > 0 ? (() => {
              const totalBudget = state.budgets.reduce((sum, b) => sum + toDisplay(b.amount, b.currency), 0);
              const totalSpent = state.budgets.reduce((sum, b) => sum + (monthSpent.get(b.categoryId) ?? 0), 0);
              const over = totalSpent > totalBudget;
              return (
                <span className="text-xs font-normal text-muted-foreground">
                  {t("planning.budgets.total", { defaultValue: "Total" })}:{" "}
                  <span className={over ? "text-destructive font-medium" : "font-medium text-foreground"}>
                    {fmt(totalSpent)} / {fmt(totalBudget)}
                  </span>
                </span>
              );
            })() : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("planning.budgets.empty")}</p>
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
                    {cat?.name || t("planning.budgets.unknown")}
                  </span>
                  <span className={over ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {fmt(spent)} / {fmt(budgetDisp)}
                  </span>
                </div>
                <Progress value={pct} className={over ? "[&>div]:bg-destructive" : ""} />
                <div className="flex items-center justify-between text-xs">
                  <span className={over ? "text-destructive" : "text-muted-foreground"}>
                    {over
                      ? t("planning.budgets.overBy", { amount: fmt(spent - budgetDisp) })
                      : t("planning.budgets.left", { amount: fmt(budgetDisp - spent) })}
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
  const { t } = useTranslation();
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
        <CardHeader><CardTitle className="text-base">{t("planning.goals.newTitle")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("planning.goals.name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("planning.goals.namePlaceholder")} />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <Label>{t("planning.goals.targetAmount")}</Label>
              <Input inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder={t("planning.goals.targetPlaceholder")} />
            </div>
            <div>
              <Label>{t("planning.goals.currency")}</Label>
              <CurrencyPicker value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} className="w-28" />
            </div>
          </div>
          <div>
            <Label>{t("planning.goals.alreadySaved")}</Label>
            <Input inputMode="decimal" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="0" />
          </div>
          <div>
            <Label>{t("planning.goals.targetDate")}</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <Button onClick={submit} className="w-full"><Plus className="h-4 w-4 mr-1" />{t("planning.goals.addGoal")}</Button>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
        {state.goals.length === 0 ? (
          <Card className="sm:col-span-2">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("planning.goals.empty")}</CardContent>
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
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t("planning.goals.by", { date: format(new Date(g.targetDate), "MMM d, yyyy") })}
                    </div>
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
                    {t("planning.goals.saveHint", { amount: fmt(monthly, g.currency) })}
                  </div>
                ) : null}
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    inputMode="decimal"
                    placeholder={t("planning.goals.addContribution", { currency: (g.currency || displayCurrency).toUpperCase() })}
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
  const { t } = useTranslation();
  const { state } = useStore();
  const { fmt, toDisplay } = useMoney();
  const [months, setMonths] = useState(6);

  const data = useMemo(() => {
    const now = new Date();
    const past = expandCashflows(state.cashflows, now);
    const pastVals = valuesByEntry(past, toDisplay);
    let balance = 0;
    for (const e of past) {
      const v = pastVals.get(e.id) ?? 0;
      balance += liquidityImpact(e, v);
    }
    const recurringParentIds = new Set(state.cashflows.filter((c) => c.recurrence).map((c) => c.id));
    const isRecurring = (e: CashflowEntry & { parentId?: string }) =>
      recurringParentIds.has(e.parentId ?? e.id);
    const rows: { month: string; balance: number; income: number; expense: number; net: number }[] = [];
    for (let i = 0; i < months; i++) {
      const m = startOfMonth(addMonths(now, i + 1));
      const end = endOfMonth(m);
      const monthEntries = expandCashflows(state.cashflows, end).filter((e) =>
        isWithinInterval(new Date(e.date), { start: m, end }) && isRecurring(e),
      );
      const vals = valuesByEntry(monthEntries, toDisplay);
      let income = 0;
      let expense = 0;
      let net = 0;
      for (const e of monthEntries) {
        const v = vals.get(e.id) ?? 0;
        if (e.kind === "income") income += v;
        if (e.kind === "expense") expense += v;
        net += liquidityImpact(e, v);
      }
      balance += net;
      rows.push({ month: format(m, "MMM yy"), balance, income, expense, net });
    }
    return rows;

  }, [state.cashflows, toDisplay, months]);

  // Single source of truth for the visible monthly snapshot: use the same
  // current-month expansion as Cashflow, so fixed, percent, card-paid and
  // installment expenses are resolved with the exact same rules.
  const monthly = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    const expanded = expandCashflows(state.cashflows, end).filter((e) =>
      isWithinInterval(new Date(e.date), { start, end }),
    );
    const vals = valuesByEntry(expanded, toDisplay);
    let income = 0;
    let expense = 0;
    let recurringIncome = 0;
    let recurringExpense = 0;
    // parentId -> current-month recurring contribution (in display ccy).
    const perParent = new Map<string, number>();
    const recurringParentIds = new Set(state.cashflows.filter((c) => c.recurrence).map((c) => c.id));
    for (const e of expanded) {
      const v = vals.get(e.id) ?? 0;
      const parentId = (e as CashflowEntry & { parentId?: string }).parentId ?? e.id;
      if (e.kind === "income") {
        income += v;
        if (recurringParentIds.has(parentId)) {
          recurringIncome += v;
          perParent.set(parentId, (perParent.get(parentId) ?? 0) + v);
        }
      } else if (e.kind === "expense") {
        expense += v;
        if (recurringParentIds.has(parentId)) {
          recurringExpense += v;
          perParent.set(parentId, (perParent.get(parentId) ?? 0) + v);
        }
      }
    }
    return {
      incomeMo: income,
      expenseMo: expense,
      recurringIncomeMo: recurringIncome,
      recurringExpenseMo: recurringExpense,
      netMo: recurringIncome - recurringExpense,
      savingsRate: recurringIncome > 0 ? (recurringIncome - recurringExpense) / recurringIncome : 0,
      perParent,
    };
  }, [state.cashflows, toDisplay]);


  // Recurring items list: only entries that actually occur in the current
  // month, with each /mo value resolved from the same current-month values.
  const recurringItems = useMemo(() => {
    return state.cashflows
      .filter((c) => c.recurrence)
      .map((c) => {
        const perMonth = monthly.perParent.get(c.id) ?? 0;
        const name =
          (c.source && c.source.trim()) ||
          (c.description && c.description.trim()) ||
          c.category ||
          "—";
        return { id: c.id, name, kind: c.kind, perMonth, category: c.category };
      })
      .filter((c) => c.perMonth > 0);
  }, [state.cashflows, monthly.perParent]);

  // Runway: only meaningful when the recurring cashflow is net-negative.
  // Use the recurring net (income − expenses) rather than gross expenses so
  // it reflects the actual liquidity drain per month.
  const netBurn = monthly.recurringExpenseMo - monthly.recurringIncomeMo;
  const runwayMonths =
    netBurn > 0 && (data[0]?.balance ?? 0) > 0
      ? (data[0]?.balance ?? 0) / netBurn
      : Infinity;


  const incomeItems = recurringItems.filter((r) => r.kind === "income").sort((a, b) => b.perMonth - a.perMonth);
  const expenseItems = recurringItems.filter((r) => r.kind === "expense").sort((a, b) => b.perMonth - a.perMonth);
  const netMo = monthly.netMo;


  return (
    <div className="space-y-8">
      {/* --- Snapshot --- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            {t("planning.forecast.monthlySnapshot", { defaultValue: "Monthly snapshot" })}
          </h3>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-emerald-500/70">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground font-normal">{t("planning.forecast.incomeMo")}</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-emerald-500">{fmt(monthly.recurringIncomeMo)}</CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500/70">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground font-normal">{t("planning.forecast.expenseMo")}</CardTitle>
              <TrendingDown className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-rose-500">{fmt(monthly.recurringExpenseMo)}</CardContent>
          </Card>
          <Card className="border-l-4" style={{ borderLeftColor: "var(--primary)" }}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground font-normal">{t("planning.forecast.savingsRate")}</CardTitle>
              <span className="text-xs tabular-nums text-muted-foreground">{fmt(netMo)}/mo</span>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{(monthly.savingsRate * 100).toFixed(0)}%</CardContent>

          </Card>
        </div>
      </section>

      {/* --- Liquidity forecast --- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          <LineChartIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            {t("planning.forecast.liquidityForecast")}
          </h3>
        </div>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">{t("planning.forecast.projectedBalance")}</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <Label className="text-xs">{t("planning.forecast.months")}</Label>
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
                <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
                  <defs>
                    <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} width={64} tickFormatter={(v) => fmt(v, undefined, { compact: true })} />

                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
                    formatter={(v: number, name: string) => [fmt(v), name]}
                  />
                  <Area type="monotone" dataKey="balance" stroke="var(--primary)" fill="url(#forecastFill)" strokeWidth={2} name={t("planning.forecast.projectedBalance")} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {runwayMonths !== Infinity ? (
              <div className="text-xs text-muted-foreground mt-2">
                {t("planning.forecast.runway", { months: Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : "∞" })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* --- Recurring income & subscriptions --- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          <Repeat className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            {t("planning.forecast.recurringTitle")}
          </h3>
        </div>
        {recurringItems.length === 0 ? (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">{t("planning.forecast.recurringEmpty")}</CardContent></Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-t-2 border-t-emerald-500/60">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  {t("planning.forecast.recurringIncome", { defaultValue: "Recurring income" })}
                  <span className="text-xs text-muted-foreground font-normal">({incomeItems.length})</span>
                </CardTitle>
                <span className="text-sm font-semibold text-emerald-500 tabular-nums">{fmt(monthly.recurringIncomeMo)}/mo</span>
              </CardHeader>
              <CardContent>
                {incomeItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("planning.forecast.recurringEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {incomeItems.map((r) => (
                      <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="truncate flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                          {r.name}
                        </span>
                        <span className="tabular-nums text-emerald-500">{t("planning.forecast.perMo", { amount: fmt(r.perMonth) })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-t-2 border-t-rose-500/60">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                  {t("planning.forecast.subscriptions", { defaultValue: "Subscriptions & recurring expenses" })}
                  <span className="text-xs text-muted-foreground font-normal">({expenseItems.length})</span>
                </CardTitle>
                <span className="text-sm font-semibold text-rose-500 tabular-nums">{fmt(monthly.recurringExpenseMo)}/mo</span>
              </CardHeader>
              <CardContent>
                {expenseItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("planning.forecast.recurringEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {expenseItems.map((r) => (
                      <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="truncate flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                          {r.name}
                        </span>
                        <span className="tabular-nums text-rose-500">{t("planning.forecast.perMo", { amount: fmt(r.perMonth) })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}

/* -------------------- Loans -------------------- */

const LOAN_COLORS = ["#ef4444", "#f59e0b", "#a78bfa", "#0ea5e9", "#10b981"];

function LoansPanel() {
  const { t } = useTranslation();
  const { state, addLoan, updateLoan, removeLoan } = useStore();
  const { fmt, currency: displayCurrency } = useMoney();
  const [form, setForm] = useState({
    name: "",
    principal: "",
    apr: "",
    term: "",
    start: new Date().toISOString().slice(0, 10),
    extra: "",
    notes: "",
    currency: displayCurrency,
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
      currency: form.currency,
      color: LOAN_COLORS[state.loans.length % LOAN_COLORS.length],
    });
    setForm({ name: "", principal: "", apr: "", term: "", start: form.start, extra: "", notes: "", currency: form.currency });
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base">{t("planning.loans.newTitle")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>{t("planning.loans.name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("planning.loans.namePlaceholder")} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("planning.loans.principal")}</Label><Input inputMode="decimal" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></div>
            <div><Label>{t("planning.loans.apr")}</Label><Input inputMode="decimal" value={form.apr} onChange={(e) => setForm({ ...form, apr: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("planning.loans.termMonths")}</Label><Input inputMode="numeric" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} /></div>
            <div><Label>{t("planning.loans.start")}</Label><Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("planning.loans.extraOpt")}</Label><Input inputMode="decimal" value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} /></div>
            <div><Label>{t("planning.loans.currency")}</Label><CurrencyPicker value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} /></div>
          </div>
          <div><Label>{t("planning.loans.notes")}</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <Button onClick={submit} className="w-full"><Plus className="h-4 w-4 mr-1" />{t("planning.loans.addLoan")}</Button>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-4">
        {state.loans.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("planning.loans.empty")}</CardContent></Card>
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
  fmt: (n: number, from?: string) => string;
}) {
  const { t } = useTranslation();
  const schedule = useMemo(() => amortize(loan), [loan]);
  const paidMonths = Math.max(0, Math.floor((Date.now() - new Date(loan.startDate).getTime()) / (30 * 24 * 3600 * 1000)));
  const upto = Math.min(paidMonths, schedule.rows.length);
  const paidPrincipal = schedule.rows.slice(0, upto).reduce((s, r) => s + r.principal + r.extra, 0);
  const remaining = Math.max(0, loan.principal - paidPrincipal);
  const pct = Math.min(100, (paidPrincipal / Math.max(0.0001, loan.principal)) * 100);
  const cur = loan.currency;
  const f = (n: number) => fmt(n, cur);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: loan.color }} />
            {loan.name}
          </CardTitle>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t("planning.loans.meta", {
              principal: f(loan.principal),
              apr: loan.apr,
              months: loan.termMonths,
              date: format(new Date(loan.startDate), "MMM yyyy"),
            })}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={onToggle}>{open ? t("planning.loans.hide") : t("planning.loans.schedule")}</Button>
          <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label={t("planning.loans.monthlyPayment")} value={f(schedule.monthlyPayment)} />
          <Stat label={t("planning.loans.totalInterest")} value={f(schedule.totalInterest)} />
          <Stat label={t("planning.loans.remaining")} value={f(remaining)} />
          <Stat label={t("planning.loans.payoff")} value={format(new Date(schedule.payoffDate), "MMM yyyy")} />
        </div>
        <Progress value={pct} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("planning.loans.paidDown", { pct: pct.toFixed(1) })}</span>
          <span>{t("planning.loans.extraShort", { amount: f(loan.extraMonthly || 0) })}</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">{t("planning.loans.extraLabel")}</Label>
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
                  <th className="text-left p-2">{t("planning.loans.tbl.n")}</th>
                  <th className="text-left p-2">{t("planning.loans.tbl.date")}</th>
                  <th className="text-right p-2">{t("planning.loans.tbl.payment")}</th>
                  <th className="text-right p-2">{t("planning.loans.tbl.interest")}</th>
                  <th className="text-right p-2">{t("planning.loans.tbl.principal")}</th>
                  <th className="text-right p-2">{t("planning.loans.tbl.balance")}</th>
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((r) => (
                  <tr key={r.index} className="border-t border-border/40">
                    <td className="p-2">{r.index}</td>
                    <td className="p-2">{format(new Date(r.date), "MMM yyyy")}</td>
                    <td className="p-2 text-right tabular-nums">{f(r.payment)}</td>
                    <td className="p-2 text-right tabular-nums text-rose-500">{f(r.interest)}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-500">{f(r.principal + r.extra)}</td>
                    <td className="p-2 text-right tabular-nums">{f(r.balance)}</td>
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
