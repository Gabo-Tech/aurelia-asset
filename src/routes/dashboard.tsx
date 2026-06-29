import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Sector,
} from "recharts";
import { useStore, useMoney } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatPct } from "@/lib/format";
import { ArrowUpRight, Wallet, TrendingUp, TrendingDown, PiggyBank } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ChartFrame } from "@/components/chart-frame";
import { expandCashflows, valuesByEntry, liquidityImpact, cardDebtImpact } from "@/routes/cashflow";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: i18n.t("dashboard.metaTitle") },
      { name: "description", content: i18n.t("dashboard.metaDesc") },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { state } = useStore();
  const { mask, toDisplay, privacy, currency } = useMoney();
  const { holdings, cashflows } = state;
  const { t } = useTranslation();
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Convert each holding's market value into the display currency once.
  const allocation = useMemo(
    () =>
      holdings
        .map((h) => ({
          id: h.id,
          name: h.symbol,
          fullName: h.name,
          color: h.color,
          value: toDisplay(h.quantity * h.currentPrice, h.priceCurrency),
        }))
        .filter((a) => a.value > 0)
        .sort((a, b) => b.value - a.value),
    [holdings, toDisplay]
  );

  const visibleAllocation = useMemo(
    () => allocation.filter((a) => !hidden.has(a.id)),
    [allocation, hidden]
  );

  const portfolioTotal = useMemo(() => allocation.reduce((s, a) => s + a.value, 0), [allocation]);
  const visibleTotal = useMemo(
    () => visibleAllocation.reduce((s, a) => s + a.value, 0),
    [visibleAllocation]
  );

  const toggleAsset = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showAll = () => setHidden(new Set());
  const hideAll = () => setHidden(new Set(allocation.map((a) => a.id)));
  const labelledIndexes = showAllLabels
    ? visibleAllocation.map((_, i) => i)
    : activeIdx != null
      ? [activeIdx]
      : [];

  const cashflowBalance = useMemo(() => {
    const expanded = expandCashflows(cashflows, new Date());
    const values = valuesByEntry(expanded, toDisplay);
    let bal = 0;
    for (const e of expanded) {
      const v = values.get(e.id) ?? 0;
      bal += liquidityImpact(e, v);
    }
    return bal;
  }, [cashflows, toDisplay]);

  const cardDebt = useMemo(() => {
    const expanded = expandCashflows(cashflows, new Date());
    const values = valuesByEntry(expanded, toDisplay);
    const cards = state.creditCards ?? [];
    let total = 0;
    for (const e of expanded) {
      const v = values.get(e.id) ?? 0;
      for (const c of cards) total += cardDebtImpact(e, c.id, v);
    }
    return total;
  }, [cashflows, toDisplay, state.creditCards]);

  const netWorth = useMemo(
    () => portfolioTotal + cashflowBalance - cardDebt,
    [portfolioTotal, cashflowBalance, cardDebt],
  );

  const net30 = useMemo(() => {
    const now = new Date();
    const cutoff = now.getTime() - 30 * 86400000;
    const expanded = expandCashflows(cashflows, now);
    const values = valuesByEntry(expanded, toDisplay);
    let bal = 0;
    for (const e of expanded) {
      if (new Date(e.date).getTime() < cutoff) continue;
      const v = values.get(e.id) ?? 0;
      bal += liquidityImpact(e, v);
    }
    return bal;
  }, [cashflows, toDisplay]);


  const topAlloc = allocation[0];

  if (!holdings.length) {
    return (
      <>
        <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <Button asChild>
            <Link to="/holdings">{t("nav.holdings")}</Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-4">
        <Card className="lg:col-span-2 relative overflow-hidden border-border/60">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dashboard.portfolioValue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl sm:text-5xl font-semibold tracking-tight">
              {mask(portfolioTotal, currency)}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
              {topAlloc ? (
                <>
                  {" · Top: "}
                  <span className="text-foreground font-medium">{topAlloc.name}</span>{" "}
                  ({formatPct((topAlloc.value / portfolioTotal) * 100, 1).replace("+", "")})
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net worth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">
              {mask(netWorth, currency)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Holdings{" "}
              <span
                className={
                  cashflowBalance >= 0 ? "text-success" : "text-destructive"
                }
              >
                {cashflowBalance >= 0 ? "+" : "−"}
                {mask(Math.abs(cashflowBalance), currency)}
              </span>{" "}
              liquidity
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cashflow · last 30 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-semibold tracking-tight ${
                net30 >= 0 ? "text-success" : "text-destructive"
              }`}
            >
              {net30 >= 0 ? "+" : "-"}
              {mask(Math.abs(net30), currency)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Net income − expenses</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3 border-border/60">
          <CardHeader className="flex flex-col gap-4">
            <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <CardTitle>{t("dashboard.allocation")}</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="all-labels" className="text-xs text-muted-foreground">
                  {t("dashboard.showAllLabels")}
                </Label>
                <Switch
                  id="all-labels"
                  checked={showAllLabels}
                  onCheckedChange={setShowAllLabels}
                />
              </div>
            </div>
            {allocation.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                {allocation.map((a) => {
                  const isHidden = hidden.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAsset(a.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${
                        isHidden
                          ? "border-border bg-transparent text-muted-foreground opacity-60"
                          : "border-transparent bg-primary/10 text-foreground hover:bg-primary/20"
                      }`}
                      title={a.fullName}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: a.color }}
                      />
                      <span className="font-medium">{a.name}</span>
                    </button>
                  );
                })}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={showAll}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {t("more.pcShowAll")}
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={hideAll}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {t("more.pcHideAll")}
                  </button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {visibleAllocation.length === 0 ? (
              <div className="flex h-80 flex-col items-center justify-center text-center text-sm text-muted-foreground sm:h-96">
                <p>All assets are hidden.</p>
                <button
                  type="button"
                  onClick={showAll}
                  className="mt-2 text-primary hover:underline"
                >
                  Show all assets
                </button>
              </div>
            ) : (
              <ChartFrame filename="allocation" title="Allocation">
                <div
                  className="flex h-80 items-center justify-center sm:h-96 [&_svg]:overflow-visible"
                  onMouseLeave={() => setActiveIdx(null)}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 28, right: 60, bottom: 28, left: 60 }}>
                      <Pie
                        data={visibleAllocation}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={0}
                        outerRadius="78%"
                        paddingAngle={0}
                        stroke="var(--foreground)"
                        strokeOpacity={0.3}
                        strokeWidth={1.5}
                        isAnimationActive={false}
                        activeIndex={labelledIndexes}
                        activeShape={
                          labelledIndexes.length > 0
                            ? (props: unknown) => (
                                <LabelledSector
                                  {...(props as AllocShapeProps)}
                                  privacy={privacy}
                                  total={visibleTotal}
                                  compact={showAllLabels}
                                />
                              )
                            : undefined
                        }
                        onMouseEnter={(_, i) => setActiveIdx(i)}
                        onMouseLeave={() => setActiveIdx(null)}
                      >
                        {visibleAllocation.map((a) => (
                          <Cell key={a.id} fill={a.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartFrame>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-border/60">
          <CardHeader>
            <CardTitle>{t("more.dashBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleAllocation.slice(0, 8).map((a) => {
              const pct = visibleTotal ? (a.value / visibleTotal) * 100 : 0;
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: a.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {pct.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {mask(a.value, currency)}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label={t("more.dashHoldings")}
          value={String(holdings.length)}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-success" />}
          label={t("dashboard.topAsset")}
          value={topAlloc ? topAlloc.name : "-"}
          sub={topAlloc ? mask(topAlloc.value, currency) : undefined}
        />
        <StatCard
          icon={
            net30 >= 0 ? (
              <PiggyBank className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )
          }
          label={t("dashboard.net30")}
          value={`${net30 >= 0 ? "+" : "-"}${mask(Math.abs(net30), currency)}`}
        />
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-border/70">
      <CardContent className="p-10 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary mb-4">
          <Wallet className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">No holdings yet</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          Add your first stock, ETF, crypto or metal to see allocation, performance and
          beautiful charts.
        </p>
        <Button asChild className="mt-5">
          <Link to="/holdings">
            Add a holding <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ===== Pie chart label sector with leader line =====

type AllocShapeProps = {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
  payload: { name: string; fullName?: string; value: number };
  percent: number;
};

function LabelledSector(
  props: AllocShapeProps & { privacy: boolean; total: number; compact?: boolean },
) {
  const {
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    privacy,
    total,
    compact,
  } = props;
  const RAD = Math.PI / 180;
  const sin = Math.sin(-RAD * midAngle);
  const cos = Math.cos(-RAD * midAngle);
  const pct = total ? (payload.value / total) * 100 : 0;

  // Stagger leader-line length for tiny adjacent slices to reduce overlap
  const tiny = pct < 3;
  const leaderOut = compact ? (tiny ? 28 : 18) : 16;
  const armOut = compact ? 22 : 18;

  const sx = cx + (outerRadius + 2) * cos;
  const sy = cy + (outerRadius + 2) * sin;
  const mx = cx + (outerRadius + leaderOut) * cos;
  const my = cy + (outerRadius + leaderOut) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * armOut;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  // Skip labels for negligible slices in compact (show-all) mode
  const skipLabel = compact && pct < 0.6;

  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Slight outer ring on the slice for emphasis */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 4}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      {!skipLabel && (
        <>
          <path
            d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
            stroke={fill}
            strokeWidth={1.25}
            fill="none"
            opacity={0.9}
          />
          <circle cx={ex} cy={ey} r={2} fill={fill} />
          <text
            x={ex + (cos >= 0 ? 5 : -5)}
            y={ey - 2}
            textAnchor={textAnchor}
            fill="var(--foreground)"
            fontSize={compact ? 10 : 11}
            fontWeight={600}
          >
            {payload.name}
          </text>
          <text
            x={ex + (cos >= 0 ? 5 : -5)}
            y={ey + (compact ? 10 : 11)}
            textAnchor={textAnchor}
            fill="var(--muted-foreground)"
            fontSize={compact ? 9 : 10}
          >
            {privacy ? "••••" : `${pct.toFixed(1)}%`}
          </text>
        </>
      )}
    </g>
  );
}
