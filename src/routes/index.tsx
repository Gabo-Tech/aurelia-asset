import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useStore, usePrivacy } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUSD, formatPct, maskUSD } from "@/lib/format";
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
  const { privacy } = usePrivacy();
  const { holdings, cashflows } = state;

  const total = useMemo(
    () => holdings.reduce((s, h) => s + h.quantity * h.currentPrice, 0),
    [holdings]
  );

  const allocation = useMemo(
    () =>
      holdings
        .map((h) => ({
          id: h.id,
          name: h.symbol,
          fullName: h.name,
          color: h.color,
          value: h.quantity * h.currentPrice,
        }))
        .filter((a) => a.value > 0)
        .sort((a, b) => b.value - a.value),
    [holdings]
  );

  const net30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return cashflows
      .filter((c) => new Date(c.date).getTime() >= cutoff)
      .reduce((s, c) => s + (c.kind === "income" ? c.amount : -c.amount), 0);
  }, [cashflows]);

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
              {maskUSD(total, privacy)}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
              {topAlloc ? (
                <>
                  {" · Top: "}
                  <span className="text-foreground font-medium">{topAlloc.name}</span>{" "}
                  ({formatPct((topAlloc.value / total) * 100, 1).replace("+", "")})
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
              {maskUSD(Math.abs(net30), privacy)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Net income − expenses</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3 border-border/60">
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={1}
                    stroke="none"
                  >
                    {allocation.map((a) => (
                      <Cell key={a.id} fill={a.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    formatter={(value: number, _name, item) => {
                      const pct = total ? (value / total) * 100 : 0;
                      return [
                        `${maskUSD(value, privacy)} · ${pct.toFixed(1)}%`,
                        (item.payload as { fullName?: string })?.fullName ?? "",
                      ];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-border/60">
          <CardHeader>
            <CardTitle>Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {allocation.slice(0, 8).map((a) => {
              const pct = total ? (a.value / total) * 100 : 0;
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
                      {maskUSD(a.value, privacy)}
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
          sub={topAlloc ? formatUSD(topAlloc.value) : undefined}
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
          value={`${net30 >= 0 ? "+" : "-"}${formatUSD(Math.abs(net30))}`}
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
