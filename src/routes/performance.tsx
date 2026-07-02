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
import { useStore, useMoney } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app-shell";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { ChartFrame } from "@/components/chart-frame";
import { fetchPortfolioHistory, PERIODS, type PeriodId } from "@/lib/finance";
import { formatPct, formatMoney, MASK } from "@/lib/format";
import { convert } from "@/lib/finance/fx";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/performance")({
  head: () => {
    const title = i18n.t("performance.metaTitle");
    const desc = i18n.t("performance.metaDesc");
    const url = "https://financetracker.putopulse.org/performance";
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
  component: PerformancePage,
});

function PerformancePage() {
  const { state } = useStore();
  const { t } = useTranslation();
  const { currency, rates, mask, privacy } = useMoney();
  const [period, setPeriod] = useState<PeriodId>("1M");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hideTotal, setHideTotal] = useState(false);
  const [scaleMode, setScaleMode] = useState<"value" | "indexed">("value");

  const visibleKeys = useMemo(() => {
    const keys: string[] = [];
    if (!hideTotal) keys.push("Total");
    for (const h of state.holdings) if (!hidden.has(h.symbol)) keys.push(h.symbol);
    return keys;
  }, [state.holdings, hidden, hideTotal]);

  // Per-holding FX multiplier from its native priceCurrency -> display currency.
  const fxByHolding = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of state.holdings) {
      m[h.id] = convert(1, h.priceCurrency || "USD", currency, rates);
    }
    return m;
  }, [state.holdings, currency, rates]);

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
    // Baselines for indexed mode: first non-zero value per key.
    const baselines: Record<string, number> = {};
    if (scaleMode === "indexed") {
      for (const d of data) {
        let total = 0;
        for (const h of state.holdings) {
          const v = (d.perAsset[h.id] ?? 0) * (fxByHolding[h.id] ?? 1);
          total += v;
          if (baselines[h.symbol] == null && v > 0) baselines[h.symbol] = v;
        }
        if (baselines.Total == null && total > 0) baselines.Total = total;
        if (
          baselines.Total != null &&
          state.holdings.every((h) => baselines[h.symbol] != null)
        )
          break;
      }
    }
    return data.map((d) => {
      let total = 0;
      const row: Record<string, number | string> = {
        date: d.date,
        label: format(new Date(d.date), period === "1D" ? "HH:mm" : "MMM d"),
        Total: 0,
      };
      for (const h of state.holdings) {
        const v = (d.perAsset[h.id] ?? 0) * (fxByHolding[h.id] ?? 1);
        total += v;
        if (scaleMode === "indexed") {
          const base = baselines[h.symbol];
          row[h.symbol] = base ? Math.round(((v / base) * 100 - 100) * 100) / 100 : 0;
        } else {
          row[h.symbol] = Math.round(v * 100) / 100;
        }
      }
      if (scaleMode === "indexed") {
        const base = baselines.Total;
        row.Total = base ? Math.round(((total / base) * 100 - 100) * 100) / 100 : 0;
      } else {
        row.Total = Math.round(total * 100) / 100;
      }
      return row;
    });
  }, [data, period, state.holdings, fxByHolding, scaleMode]);

  const yDomain = useMemo<[number, number]>(() => {
    if (!chartData.length || !visibleKeys.length) return [0, 0];
    let min = Infinity;
    let max = -Infinity;
    for (const row of chartData) {
      for (const k of visibleKeys) {
        const v = row[k] as number;
        if (typeof v !== "number") continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!isFinite(min) || !isFinite(max)) return [0, 0];
    if (min === max) {
      const pad = Math.abs(min) * 0.05 || 1;
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.08;
    // Don't clamp to 0 — that squashes small variations against a giant Total.
    return [min - pad, max + pad];
  }, [chartData, visibleKeys]);

  const metrics = useMemo(() => {
    if (!data || data.length < 2) return null;
    const first = data[0];
    const last = data[data.length - 1];
    const perAsset = state.holdings.map((h) => {
      const m = fxByHolding[h.id] ?? 1;
      const start = (first.perAsset[h.id] ?? 0) * m;
      const end = (last.perAsset[h.id] ?? 0) * m;
      const pct = start ? ((end - start) / start) * 100 : 0;
      return { h, start, end, abs: end - start, pct };
    });
    const firstTotal = perAsset.reduce((s, x) => s + x.start, 0);
    const lastTotal = perAsset.reduce((s, x) => s + x.end, 0);
    const totalPct = firstTotal ? ((lastTotal - firstTotal) / firstTotal) * 100 : 0;
    return {
      first: { total: firstTotal },
      last: { total: lastTotal },
      perAsset,
      totalPct,
    };
  }, [data, state.holdings, fxByHolding]);

  if (!state.holdings.length) {
    return (
      <>
        <PageHeader title={t("performance.title")} />
        <Card className="border-dashed border-border/70">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t("performance.emptyState")}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("performance.title")}
        description={t("performance.description")}
      />

      <div className="mb-4 flex flex-wrap gap-1.5" data-tour="perf-period">
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
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant={scaleMode === "value" ? "default" : "outline"}
            onClick={() => setScaleMode("value")}
            title="Absolute value"
          >
            {currency}
          </Button>
          <Button
            size="sm"
            variant={scaleMode === "indexed" ? "default" : "outline"}
            onClick={() => setScaleMode("indexed")}
            title="Percent change from start of period"
          >
            %
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2" data-tour="perf-assets">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("more.perfAssets")}
        </span>
        <button
          onClick={() => setHideTotal((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            hideTotal
              ? "border-border/60 bg-muted text-muted-foreground opacity-60"
              : "border-border bg-card text-foreground hover:bg-accent"
          )}
        >
          <span
            className="h-1.5 w-1.5 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: "var(--primary)" }}
          />
          {t("more.perfTotalLabel")}
        </button>
        {state.holdings.map((h) => (
          <button
            key={h.id}
            onClick={() => {
              setHidden((prev) => {
                const next = new Set(prev);
                if (next.has(h.symbol)) next.delete(h.symbol);
                else next.add(h.symbol);
                return next;
              });
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              hidden.has(h.symbol)
                ? "border-border/60 bg-muted text-muted-foreground opacity-60"
                : "border-border bg-card text-foreground hover:bg-accent"
            )}
          >
            <span
              className="h-1.5 w-1.5 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: h.color }}
            />
            {h.symbol}
          </button>
        ))}
        {state.holdings.length > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setHidden(new Set())}
            >
              {t("more.pcShowAll")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setHidden(new Set(state.holdings.map((h) => h.symbol)))}
            >
              {t("more.pcHideAll")}
            </Button>
          </div>
        )}
      </div>

      <Card className="border-border/60" data-tour="perf-chart">
        <CardHeader className="flex flex-row items-baseline justify-between flex-wrap gap-2">
          <CardTitle>{t("more.perfPortfolioValue")}</CardTitle>
          {metrics && (
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums">
                {mask(metrics.last.total)}
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
          <ChartFrame filename="performance" title={`${t("more.perfPortfolioValue")} · ${period}`}>
            <div className="flex h-72 items-center justify-center sm:h-80">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : isError ? (
                <div className="grid h-full place-items-center text-sm text-destructive">
                  {t("more.perfCouldntLoad")}
                </div>
              ) : !chartData.length ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  {t("more.perfNoData")}
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
                      tickFormatter={(v) =>
                        privacy
                          ? MASK
                          : scaleMode === "indexed"
                          ? `${(v as number) >= 0 ? "+" : ""}${(v as number).toFixed(1)}%`
                          : formatMoney(v as number, currency, { compact: true })
                      }
                      width={60}
                      domain={yDomain}
                      allowDataOverflow
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      formatter={(value: number) =>
                        scaleMode === "indexed"
                          ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
                          : mask(value)
                      }
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      onClick={(e) => {
                        const name = e.dataKey as string;
                        if (name === "Total") {
                          setHideTotal((v) => !v);
                          return;
                        }
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
                      hide={hideTotal}
                      isAnimationActive
                      style={{ filter: "drop-shadow(0 0 1.5px var(--background)) drop-shadow(0 0 0.5px var(--foreground))" }}
                    />
                    {state.holdings.map((h) => (
                      <Line
                        key={h.id}
                        type="monotone"
                        dataKey={h.symbol}
                        stroke={h.color}
                        strokeWidth={1.75}
                        dot={false}
                        hide={hidden.has(h.symbol)}
                        style={{ filter: "drop-shadow(0 0 1.5px var(--background)) drop-shadow(0 0 0.5px var(--foreground))" }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartFrame>
        </CardContent>
      </Card>

      {metrics && (
        <Card className="border-border/60 mt-5" data-tour="perf-returns">
          <CardHeader>
            <CardTitle>{t("more.perfReturnsByAsset")} · {period}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">{t("more.perfAsset")}</th>
                  <th className="py-2 pl-4 text-right whitespace-nowrap">{t("more.perfStart")}</th>
                  <th className="py-2 pl-4 text-right whitespace-nowrap">{t("more.perfEnd")}</th>
                  <th className="py-2 pl-4 text-right whitespace-nowrap">{t("more.perfChange")}</th>
                  <th className="py-2 pl-4 text-right whitespace-nowrap">%</th>
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
                    <td className="py-2.5 pl-4 text-right tabular-nums whitespace-nowrap">{mask(start)}</td>
                    <td className="py-2.5 pl-4 text-right tabular-nums whitespace-nowrap">{mask(end)}</td>
                    <td
                      className={cn(
                        "py-2.5 pl-4 text-right tabular-nums whitespace-nowrap",
                        abs >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {abs >= 0 ? "+" : "-"}
                      {mask(Math.abs(abs))}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 pl-4 text-right tabular-nums font-medium whitespace-nowrap",
                        pct >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {formatPct(pct)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2.5">{t("more.perfTotal")}</td>
                  <td className="py-2.5 pl-4 text-right tabular-nums whitespace-nowrap">
                    {mask(metrics.first.total)}
                  </td>
                  <td className="py-2.5 pl-4 text-right tabular-nums whitespace-nowrap">
                    {mask(metrics.last.total)}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 pl-4 text-right tabular-nums whitespace-nowrap",
                      metrics.last.total - metrics.first.total >= 0
                        ? "text-success"
                        : "text-destructive"
                    )}
                  >
                    {mask(metrics.last.total - metrics.first.total)}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 pl-4 text-right tabular-nums whitespace-nowrap",
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
