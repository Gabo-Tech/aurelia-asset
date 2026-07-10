import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePortfolioHistory } from "@/hooks/use-portfolio-history";
import {
  AreaChart,
  Area,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartFrame } from "@/components/chart-frame";
import { PERIODS, toUtcDayMs, type PeriodId } from "@/lib/finance";
import { formatMoney, formatPct, MASK } from "@/lib/format";
import { convert } from "@/lib/finance/fx";
import { cn } from "@/lib/utils";

function formatQuantity(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(value) < 1 ? 8 : 6,
  });
}

export function HoldingsCharts() {
  const { t } = useTranslation();
  const { state } = useStore();
  const { currency, rates, mask, privacy } = useMoney();
  const [period, setPeriod] = useState<PeriodId>("3M");
  const [tab, setTab] = useState<"stacked" | "invested">("stacked");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visibleHoldings = useMemo(
    () => state.holdings.filter((h) => !hidden.has(h.id)),
    [state.holdings, hidden],
  );

  const fxByHolding = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of state.holdings) m[h.id] = convert(1, h.priceCurrency || "USD", currency, rates);
    return m;
  }, [state.holdings, currency, rates]);

  const { data, isLoading, isError } = usePortfolioHistory(
    state.holdings,
    state.transactions,
    period,
  );

  // Stacked area: value per asset over time (quantities already in perAsset).
  const stackedData = useMemo(() => {
    if (!data) return [];
    return data.map((d) => {
      const row: Record<string, number | string> = {
        date: d.date,
        label: format(new Date(d.date), period === "1D" ? "HH:mm" : "MMM d"),
      };
      for (const h of visibleHoldings) {
        const v = (d.perAsset[h.id] ?? 0) * (fxByHolding[h.id] ?? 1);
        row[h.symbol] = Math.round(v * 100) / 100;
      }
      return row;
    });
  }, [data, visibleHoldings, fxByHolding, period]);

  // Per-asset Invested (cumulative cost basis) and Value over time.
  const investedSeries = useMemo(() => {
    if (!data || !data.length) return [];
    const txsByHolding: Record<
      string,
      Array<(typeof state.transactions)[number] & { day: number }>
    > = {};
    for (const h of visibleHoldings) txsByHolding[h.id] = [];
    for (const t of state.transactions) {
      if (txsByHolding[t.holdingId])
        txsByHolding[t.holdingId].push({ ...t, day: toUtcDayMs(t.date) });
    }
    for (const id of Object.keys(txsByHolding)) {
      txsByHolding[id].sort((a, b) => a.day - b.day);
    }
    const cum: Record<string, number> = {};
    const qty: Record<string, number> = {};
    const idx: Record<string, number> = {};
    for (const h of visibleHoldings) {
      const hasTransactions = txsByHolding[h.id].length > 0;
      qty[h.id] = hasTransactions ? (h.openingQuantity ?? 0) : h.quantity;
      cum[h.id] =
        qty[h.id] > 0 && !hasTransactions
          ? qty[h.id] * h.currentPrice * (fxByHolding[h.id] ?? 1)
          : 0;
      idx[h.id] = 0;
    }
    return data.map((d) => {
      const row: Record<string, number | string> = {
        date: d.date,
        label: format(new Date(d.date), period === "1D" ? "HH:mm" : "MMM d"),
      };
      let totalInv = 0;
      let totalVal = 0;
      for (const h of visibleHoldings) {
        const list = txsByHolding[h.id];
        while (idx[h.id] < list.length && list[idx[h.id]].day <= d.date) {
          const t = list[idx[h.id]];
          const fx = convert(1, t.currency || "USD", currency, rates);
          if (t.kind === "buy") {
            cum[h.id] += t.quantity * t.pricePerUnit * fx;
            if (t.fees) cum[h.id] += t.fees * fx;
            qty[h.id] += t.quantity;
          } else {
            const sold = Math.min(qty[h.id], t.quantity);
            const avgCost = qty[h.id] > 0 ? cum[h.id] / qty[h.id] : 0;
            cum[h.id] = Math.max(0, cum[h.id] - sold * avgCost);
            qty[h.id] = Math.max(0, qty[h.id] - t.quantity);
          }
          idx[h.id]++;
        }
        const inv = Math.round(cum[h.id] * 100) / 100;
        const val = Math.round((d.perAsset[h.id] ?? 0) * (fxByHolding[h.id] ?? 1) * 100) / 100;
        row[`inv_${h.id}`] = inv;
        row[`val_${h.id}`] = val;
        row[`qty_${h.id}`] = qty[h.id];
        totalInv += inv;
        totalVal += val;
      }
      row.Invested = Math.round(totalInv * 100) / 100;
      row.Value = Math.round(totalVal * 100) / 100;
      return row;
    });
  }, [data, state.transactions, visibleHoldings, fxByHolding, currency, rates, period]);

  if (!state.holdings.length) return null;

  return (
    <Card className="border-border/60 mt-5">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle>{t("more.pcTitle")}</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={period === p.id ? "default" : "outline"}
              onClick={() => setPeriod(p.id)}
              className="h-7 px-2 text-xs"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = v as "stacked" | "invested";
            setTab(next);
            if (next === "invested") {
              const firstVisible =
                state.holdings.find((h) => !hidden.has(h.id)) ?? state.holdings[0];
              if (firstVisible) {
                setHidden(
                  new Set(state.holdings.filter((h) => h.id !== firstVisible.id).map((h) => h.id)),
                );
              }
            }
          }}
        >
          <TabsList className="grid w-full sm:w-auto grid-cols-2">
            <TabsTrigger value="stacked">{t("more.pcValuePerAsset")}</TabsTrigger>
            <TabsTrigger value="invested">{t("more.pcInvestedVsValue")}</TabsTrigger>
          </TabsList>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("more.pcAssets")}
            </span>
            {state.holdings.map((h) => {
              const off = hidden.has(h.id);
              return (
                <button
                  key={h.id}
                  onClick={() => {
                    if (tab === "invested") {
                      setHidden(
                        new Set(state.holdings.filter((x) => x.id !== h.id).map((x) => x.id)),
                      );
                    } else {
                      setHidden((prev) => {
                        const next = new Set(prev);
                        if (next.has(h.id)) next.delete(h.id);
                        else next.add(h.id);
                        return next;
                      });
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    off
                      ? "border-border/60 bg-muted text-muted-foreground opacity-60"
                      : "border-border bg-card text-foreground hover:bg-accent",
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: h.color }}
                  />
                  {h.symbol}
                </button>
              );
            })}
            {state.holdings.length > 1 && tab === "stacked" && (
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
                  onClick={() => setHidden(new Set(state.holdings.map((h) => h.id)))}
                >
                  {t("more.pcHideAll")}
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="stacked" className="mt-4">
            <ChartFrame
              filename="holdings-stacked"
              title={`${t("more.pcValuePerAsset")} · ${period}`}
            >
              <div className="flex h-72 items-center justify-center sm:h-80">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : isError ? (
                  <div className="grid h-full place-items-center text-sm text-destructive">
                    Couldn't load price history.
                  </div>
                ) : !stackedData.length ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">
                    No data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={stackedData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
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
                          privacy ? MASK : formatMoney(v as number, currency, { compact: true })
                        }
                        width={60}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          fontSize: 12,
                        }}
                        formatter={(value: number) => mask(value)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {visibleHoldings.map((h) => (
                        <Area
                          key={h.id}
                          type="monotone"
                          dataKey={h.symbol}
                          stackId="1"
                          stroke={h.color}
                          fill={h.color}
                          fillOpacity={0.5}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartFrame>
          </TabsContent>

          <TabsContent value="invested" className="mt-4">
            <ChartFrame
              filename="holdings-invested"
              title={`${t("more.pcInvestedVsValue")} · ${period}`}
            >
              <div className="flex h-72 items-center justify-center sm:h-80">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : !investedSeries.length ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">
                    No data
                  </div>
                ) : !state.transactions.length ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground text-center px-4">
                    Add buy/sell transactions to see invested capital vs current value.
                  </div>
                ) : !visibleHoldings.length ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground text-center px-4">
                    Select an asset above to view its quantity over time.
                  </div>
                ) : visibleHoldings.length > 1 ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground text-center px-4">
                    Select a single asset above to view its quantity over time.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={investedSeries}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                        minTickGap={30}
                      />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => (privacy ? MASK : formatQuantity(v as number))}
                        width={70}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          fontSize: 12,
                        }}
                        formatter={(value, _name, item) => {
                          const h = visibleHoldings[0];
                          const payload = (item as { payload?: Record<string, number> })?.payload;
                          const val = payload?.[`val_${h.id}`];
                          const valStr = typeof val === "number" ? `  ·  ${mask(val)}` : "";
                          return [
                            `${formatQuantity(Number(value))} ${h.symbol}${valStr}`,
                            h.symbol,
                          ];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey={`qty_${visibleHoldings[0].id}`}
                        name={`${visibleHoldings[0].symbol} quantity`}
                        stroke={visibleHoldings[0].color}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartFrame>

            {state.transactions.length > 0 &&
              investedSeries.length > 0 &&
              visibleHoldings.length === 1 && (
                <InvestedSummary
                  invested={
                    Number(
                      investedSeries[investedSeries.length - 1][`inv_${visibleHoldings[0].id}`],
                    ) || 0
                  }
                  value={
                    Number(
                      investedSeries[investedSeries.length - 1][`val_${visibleHoldings[0].id}`],
                    ) || 0
                  }
                />
              )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function InvestedSummary({ invested, value }: { invested: number; value: number }) {
  const { mask } = useMoney();
  const gain = value - invested;
  const pct = invested ? (gain / Math.abs(invested)) * 100 : 0;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
      <div className="rounded-md bg-muted/30 px-3 py-2">
        <div className="text-xs text-muted-foreground">Invested</div>
        <div className="tabular-nums font-medium">{mask(invested)}</div>
      </div>
      <div className="rounded-md bg-muted/30 px-3 py-2">
        <div className="text-xs text-muted-foreground">Value</div>
        <div className="tabular-nums font-medium">{mask(value)}</div>
      </div>
      <div
        className={cn("rounded-md px-3 py-2", gain >= 0 ? "bg-success/15" : "bg-destructive/15")}
      >
        <div className="text-xs text-muted-foreground">Gain</div>
        <div
          className={cn(
            "tabular-nums font-medium",
            gain >= 0 ? "text-success" : "text-destructive",
          )}
        >
          {gain >= 0 ? "+" : "−"}
          {mask(Math.abs(gain))} · {formatPct(pct)}
        </div>
      </div>
    </div>
  );
}
