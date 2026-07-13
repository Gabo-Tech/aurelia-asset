import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from "recharts";
import { useStore, useMoney } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatPct } from "@/lib/format";
import {
  ArrowUpRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Plus,
  ArrowLeftRight,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ChartFrame } from "@/components/chart-frame";
import { expandCashflows, valuesByEntry, liquidityImpact, cardDebtImpact } from "@/routes/cashflow";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { SITE_URL } from "@/lib/site-config";
import {
  AppCard,
  AppCardContent,
  AppCardHeader,
  AppCardTitle,
  MetricHeroCard,
  MetricTile,
  FilterPillGroup,
  EmptyState,
  ResponsiveDialog,
} from "@/components/design";
import { MetricTile as StatTile } from "@/components/design/metric-tile";

export const Route = createFileRoute("/dashboard")({
  head: () => {
    const title = i18n.t("dashboard.metaTitle");
    const desc = i18n.t("dashboard.metaDesc");
    const url = `${SITE_URL}/dashboard`;
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
  const [detailId, setDetailId] = useState<string | null>(null);

  const allocation = useMemo(
    () =>
      holdings
        .map((h) => ({
          id: h.id,
          name: h.symbol,
          fullName: h.name,
          color: h.color,
          value: toDisplay(h.quantity * h.currentPrice, h.priceCurrency),
          quantity: h.quantity,
          currentPrice: h.currentPrice,
          priceCurrency: h.priceCurrency,
        }))
        .filter((a) => a.value > 0)
        .sort((a, b) => b.value - a.value),
    [holdings, toDisplay],
  );

  const visibleAllocation = useMemo(
    () => allocation.filter((a) => !hidden.has(a.id)),
    [allocation, hidden],
  );

  const portfolioTotal = useMemo(() => allocation.reduce((s, a) => s + a.value, 0), [allocation]);
  const visibleTotal = useMemo(
    () => visibleAllocation.reduce((s, a) => s + a.value, 0),
    [visibleAllocation],
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
  const detail = detailId ? allocation.find((a) => a.id === detailId) : null;

  if (!holdings.length) {
    return (
      <>
        <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title={t("more.dashNoHoldings")}
          description="Add your first stock, ETF, crypto or metal to see allocation, performance and beautiful charts."
          actionLabel="Add a holding"
          actionTo="/holdings"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/holdings">{t("nav.holdings")}</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-4" data-tour="dash-stats">
        <MetricHeroCard
          label={t("dashboard.portfolioValue")}
          value={mask(portfolioTotal, currency)}
          sub={
            <>
              {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
              {topAlloc ? (
                <>
                  {" · Top: "}
                  <span className="text-foreground font-medium">{topAlloc.name}</span> (
                  {formatPct((topAlloc.value / portfolioTotal) * 100, 1).replace("+", "")})
                </>
              ) : null}
            </>
          }
        />

        <MetricTile
          label="Net worth"
          value={mask(netWorth, currency)}
          sub={
            <>
              Holdings{" "}
              <span className={cashflowBalance >= 0 ? "text-success" : "text-destructive"}>
                {cashflowBalance >= 0 ? "+" : "−"}
                {mask(Math.abs(cashflowBalance), currency)}
              </span>{" "}
              liquidity
            </>
          }
        />

        <MetricTile
          label="Cashflow · last 30 days"
          value={`${net30 >= 0 ? "+" : "-"}${mask(Math.abs(net30), currency)}`}
          tone={net30 >= 0 ? "success" : "destructive"}
          sub="Net income − expenses"
          icon={
            net30 >= 0 ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )
          }
        />
      </div>

      {/* Quick actions */}
      <div
        className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-tour="dash-quick-actions"
      >
        <QuickAction to="/holdings" icon={<Plus className="h-4 w-4" />} label="Add asset" />
        <QuickAction
          to="/cashflow"
          icon={<ArrowLeftRight className="h-4 w-4" />}
          label="Add entry"
        />
        <QuickAction
          to="/holdings"
          icon={<Wallet className="h-4 w-4" />}
          label={t("nav.holdings")}
        />
        <QuickAction
          to="/performance"
          icon={<TrendingUp className="h-4 w-4" />}
          label={t("nav.short.performance")}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:gap-5 lg:grid-cols-5">
        <AppCard className="lg:col-span-3" elevated data-tour="dash-allocation">
          <AppCardHeader className="flex flex-col gap-4">
            <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <AppCardTitle className="text-base font-semibold text-foreground">
                {t("dashboard.allocation")}
              </AppCardTitle>
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
              <FilterPillGroup
                pills={allocation.map((a) => ({
                  id: a.id,
                  label: a.name,
                  color: a.color,
                  active: !hidden.has(a.id),
                }))}
                onToggle={toggleAsset}
                onShowAll={showAll}
                onHideAll={hideAll}
                showAllLabel={t("more.pcShowAll")}
                hideAllLabel={t("more.pcHideAll")}
              />
            )}
          </AppCardHeader>
          <AppCardContent>
            {visibleAllocation.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center text-center text-sm text-muted-foreground sm:h-80">
                <p>All assets are hidden.</p>
                <button
                  type="button"
                  onClick={showAll}
                  className="mt-2 min-h-11 text-primary hover:underline"
                >
                  Show all assets
                </button>
              </div>
            ) : (
              <ChartFrame filename="allocation" title="Allocation">
                <div
                  className="relative flex h-72 items-center justify-center sm:h-80 [&_svg]:overflow-visible"
                  onMouseLeave={() => setActiveIdx(null)}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 20, right: 48, bottom: 20, left: 48 }}>
                      <Pie
                        data={visibleAllocation}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="52%"
                        outerRadius="78%"
                        paddingAngle={1.5}
                        stroke="var(--card)"
                        strokeWidth={2}
                        isAnimationActive
                        animationDuration={300}
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
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Total
                    </div>
                    <div className="font-display text-lg tabular-nums tracking-tight sm:text-xl">
                      {mask(visibleTotal, currency)}
                    </div>
                  </div>
                </div>
              </ChartFrame>
            )}
          </AppCardContent>
        </AppCard>

        <AppCard className="lg:col-span-2" data-tour="dash-breakdown">
          <AppCardHeader>
            <AppCardTitle className="text-base font-semibold text-foreground">
              {t("more.dashBreakdown")}
            </AppCardTitle>
          </AppCardHeader>
          <AppCardContent className="space-y-1">
            {visibleAllocation.slice(0, 8).map((a) => {
              const pct = visibleTotal ? (a.value / visibleTotal) * 100 : 0;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setDetailId(a.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60 active-press min-h-11"
                >
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
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                </button>
              );
            })}
          </AppCardContent>
        </AppCard>
      </div>

      {/* Desktop secondary stats */}
      <div className="mt-5 hidden gap-5 md:grid md:grid-cols-3">
        <StatTile
          icon={<Wallet className="h-4 w-4" />}
          label={t("more.dashHoldings")}
          value={String(holdings.length)}
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4 text-success" />}
          label={t("dashboard.topAsset")}
          value={topAlloc ? topAlloc.name : "-"}
          sub={topAlloc ? mask(topAlloc.value, currency) : undefined}
        />
        <StatTile
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

      <ResponsiveDialog
        open={!!detail}
        onOpenChange={(open) => !open && setDetailId(null)}
        title={detail?.fullName ?? detail?.name ?? ""}
        description={detail?.name}
        footer={
          <Button asChild>
            <Link to="/holdings">
              {t("nav.holdings")} <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        }
      >
        {detail ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: detail.color }} />
              <span className="text-sm text-muted-foreground">{detail.name}</span>
            </div>
            <div className="font-display text-3xl tabular-nums tracking-tight">
              {mask(detail.value, currency)}
            </div>
            <div className="text-sm text-muted-foreground">
              {visibleTotal
                ? `${((detail.value / visibleTotal) * 100).toFixed(1)}% of portfolio`
                : null}
            </div>
          </div>
        ) : null}
      </ResponsiveDialog>
    </>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="h-11 shrink-0 gap-2 rounded-xl border-border/60 bg-card px-3 shadow-sm active-press"
    >
      <Link to={to}>
        {icon}
        {label}
      </Link>
    </Button>
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
  const skipLabel = compact && pct < 0.6;

  return (
    <g style={{ pointerEvents: "none" }}>
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
