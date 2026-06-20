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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Elegant Portfolio Tracker" },
      { name: "description", content: "Your portfolio at a glance — allocation, value, and recent activity." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { state } = useStore();
  const { mask, toDisplay, privacy } = useMoney();
  const { holdings, cashflows } = state;
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

  const net30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return cashflows
      .filter((c) => new Date(c.date).getTime() >= cutoff)
      .reduce(
        (s, c) =>
          s + (c.kind === "income" ? 1 : -1) * toDisplay(c.amount, c.currency),
        0,
      );
  }, [cashflows, toDisplay]);

  const topAlloc = allocation[0];

  if (!holdings.length) {
    return (
      <>
        <PageHeader title="Dashboard" description="Welcome to your portfolio." />
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A high-level view of your portfolio."
        actions={
          <Button asChild>
            <Link to="/holdings">Manage holdings</Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Total value hero */}
        <Card className="lg:col-span-2 relative overflow-hidden border-border/60">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total portfolio value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl sm:text-5xl font-semibold tracking-tight">
              {mask(portfolioTotal)}
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
              {mask(Math.abs(net30))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Net income − expenses</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3 border-border/60">
          <CardHeader className="flex flex-col gap-4">
            <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <CardTitle>Allocation</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="all-labels" className="text-xs text-muted-foreground">
                  Show all labels
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
                    Show all
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={hideAll}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Hide all
                  </button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {visibleAllocation.length === 0 ? (
              <div className="flex h-96 flex-col items-center justify-center text-center text-sm text-muted-foreground">
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
              <div className="h-96 [&_svg]:overflow-visible">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 32, right: 120, bottom: 32, left: 120 }}>
                  <Pie
                    data={visibleAllocation}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={0}
                    outerRadius={120}
                    paddingAngle={0}
                    stroke="var(--foreground)"
                    strokeOpacity={0.3}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                    activeIndex={
                      showAllLabels
                        ? visibleAllocation.map((_, i) => i)
                        : activeIdx != null
                          ? [activeIdx]
                          : undefined
                    }
                    activeShape={(props: unknown) => (
                      <LabelledSector
                        {...(props as AllocShapeProps)}
                        privacy={privacy}
                        total={visibleTotal}
                        compact={showAllLabels}
                      />
                    )}
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
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-border/60">
          <CardHeader>
            <CardTitle>Breakdown</CardTitle>
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
                      {mask(a.value)}
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
          label="Holdings"
          value={String(holdings.length)}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-success" />}
          label="Top asset"
          value={topAlloc ? topAlloc.name : "—"}
          sub={topAlloc ? mask(topAlloc.value) : undefined}
        />
        <StatCard
          icon={
            net30 >= 0 ? (
              <PiggyBank className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )
          }
          label="Net 30d"
          value={`${net30 >= 0 ? "+" : "-"}${mask(Math.abs(net30))}`}
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
            style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3 }}
          >
            {payload.name}
          </text>
          <text
            x={ex + (cos >= 0 ? 5 : -5)}
            y={ey + (compact ? 10 : 11)}
            textAnchor={textAnchor}
            fill="var(--muted-foreground)"
            fontSize={compact ? 9 : 10}
            style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3 }}
          >
            {privacy ? "••••" : `${pct.toFixed(1)}%`}
          </text>
        </>
      )}
    </g>
  );
}
