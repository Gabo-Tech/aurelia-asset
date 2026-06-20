import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { useStore, usePrivacy } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app-shell";
import { fetchPortfolioHistory, PERIODS, type PeriodId } from "@/lib/finance";
import { formatPct, formatUSD, maskUSD, MASK } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance — Elegant Portfolio Tracker" },
      { name: "description", content: "Historical portfolio performance with per-asset breakdown." },
    ],
  }),
  component: PerformancePage,
});

function PerformancePage() {
  const { state } = useStore();
  const { privacy } = usePrivacy();
  const [period, setPeriod] = useState<PeriodId>("1M");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const holdingsKey = state.holdings
    .map((h) => `${h.id}:${h.symbol}:${h.coinGeckoId ?? ""}:${h.quantity}`)
    .join("|");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["portfolio-history", period, holdingsKey],
    queryFn: () => fetchPortfolioHistory(state.holdings, period),
    enabled: state.holdings.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((d) => {
      const row: Record<string, number | string> = {
        date: d.date,
        label: format(new Date(d.date), period === "1D" ? "HH:mm" : "MMM d"),
        Total: Math.round(d.total * 100) / 100,
      };
      for (const h of state.holdings) {
        row[h.symbol] = Math.round((d.perAsset[h.id] ?? 0) * 100) / 100;
      }
      return row;
    });
  }, [data, period, state.holdings]);

  const metrics = useMemo(() => {
    if (!data || data.length < 2) return null;
    const first = data[0];
    const last = data[data.length - 1];
    const perAsset = state.holdings.map((h) => {
      const start = first.perAsset[h.id] ?? 0;
      const end = last.perAsset[h.id] ?? 0;
      const pct = start ? ((end - start) / start) * 100 : 0;
      return { h, start, end, abs: end - start, pct };
    });
    const totalPct = first.total ? ((last.total - first.total) / first.total) * 100 : 0;
    return { first, last, perAsset, totalPct };
  }, [data, state.holdings]);

  if (!state.holdings.length) {
    return (
      <>
        <PageHeader title="Performance" />
        <Card className="border-dashed border-border/70">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Add holdings first to see your historical performance.
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Performance"
        description="Historical portfolio value, period over period."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={period === p.id ? "default" : "outline"}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-baseline justify-between flex-wrap gap-2">
          <CardTitle>Portfolio value</CardTitle>
          {metrics && (
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums">
                {maskUSD(metrics.last.total, privacy)}
              </div>
              <div
                className={cn(
                  "text-sm font-medium",
                  metrics.totalPct >= 0 ? "text-success" : "text-destructive"
                )}
              >
                {formatPct(metrics.totalPct)} · {period}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="h-80">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : isError ? (
              <div className="grid h-full place-items-center text-sm text-destructive">
                Couldn't load price history. Try enabling the CORS proxy in Settings.
              </div>
            ) : !chartData.length ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="var(--muted-foreground)"
                    tick={{ fontSize: 11 }}
                    minTickGap={30}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (privacy ? MASK : formatUSD(v as number, { compact: true }))}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => maskUSD(value, privacy)}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    onClick={(e) => {
                      const name = e.dataKey as string;
                      if (name === "Total") return;
                      setHidden((h) => {
                        const s = new Set(h);
                        if (s.has(name)) s.delete(name);
                        else s.add(name);
                        return s;
                      });
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Total"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive
                  />
                  {state.holdings.map((h) => (
                    <Line
                      key={h.id}
                      type="monotone"
                      dataKey={h.symbol}
                      stroke={h.color}
                      strokeWidth={1.3}
                      dot={false}
                      hide={hidden.has(h.symbol)}
                      opacity={0.85}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {metrics && (
        <Card className="border-border/60 mt-5">
          <CardHeader>
            <CardTitle>Returns by asset · {period}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Asset</th>
                  <th className="py-2 text-right">Start</th>
                  <th className="py-2 text-right">End</th>
                  <th className="py-2 text-right">Change</th>
                  <th className="py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {metrics.perAsset.map(({ h, start, end, abs, pct }) => (
                  <tr key={h.id}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: h.color }} />
                        <span className="font-medium">{h.symbol}</span>
                        <span className="text-muted-foreground text-xs truncate">{h.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatUSD(start)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatUSD(end)}</td>
                    <td
                      className={cn(
                        "py-2.5 text-right tabular-nums",
                        abs >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {abs >= 0 ? "+" : "-"}
                      {formatUSD(Math.abs(abs))}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 text-right tabular-nums font-medium",
                        pct >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {formatPct(pct)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2.5">Total</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatUSD(metrics.first.total)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatUSD(metrics.last.total)}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 text-right tabular-nums",
                      metrics.last.total - metrics.first.total >= 0
                        ? "text-success"
                        : "text-destructive"
                    )}
                  >
                    {formatUSD(metrics.last.total - metrics.first.total)}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 text-right tabular-nums",
                      metrics.totalPct >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {formatPct(metrics.totalPct)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
