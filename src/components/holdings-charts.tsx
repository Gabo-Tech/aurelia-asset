import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { fetchPortfolioHistory, PERIODS, type PeriodId } from "@/lib/finance";
import { formatMoney, formatPct, MASK } from "@/lib/format";
import { convert } from "@/lib/finance/fx";
import { cn } from "@/lib/utils";

function toUtcDayMs(value: string | number | Date) {
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function formatQuantity(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(value) < 1 ? 8 : 6,
  });
}

function buildQuantityByDate(
  data: Array<{ date: number }>,
  holdings: Array<{ id: string; quantity: number; openingQuantity?: number }>,
  transactions: Array<{ holdingId: string; kind: "buy" | "sell"; date: string; quantity: number }>,
) {
  const txsByHolding: Record<string, Array<{ day: number; kind: "buy" | "sell"; quantity: number }>> = {};
  for (const h of holdings) txsByHolding[h.id] = [];
  for (const t of transactions) {
    if (txsByHolding[t.holdingId]) {
      txsByHolding[t.holdingId].push({ day: toUtcDayMs(t.date), kind: t.kind, quantity: t.quantity });
    }
  }
  for (const id of Object.keys(txsByHolding)) txsByHolding[id].sort((a, b) => a.day - b.day);

  const qty: Record<string, number> = {};
  const idx: Record<string, number> = {};
  for (const h of holdings) {
    qty[h.id] = txsByHolding[h.id].length > 0 ? h.openingQuantity ?? 0 : h.quantity;
    idx[h.id] = 0;
  }

  const byDate = new Map<number, Record<string, number>>();
  for (const d of data) {
    const row: Record<string, number> = {};
    for (const h of holdings) {
      const list = txsByHolding[h.id];
      while (idx[h.id] < list.length && list[idx[h.id]].day <= d.date) {
        const t = list[idx[h.id]];
        qty[h.id] = Math.max(0, qty[h.id] + (t.kind === "buy" ? 1 : -1) * t.quantity);
        idx[h.id]++;
      }
      row[h.id] = qty[h.id];
    }
    byDate.set(d.date, row);
  }
  return byDate;
}

export function HoldingsCharts() {
  const { state } = useStore();
  const { currency, rates, mask, privacy } = useMoney();
  const [period, setPeriod] = useState<PeriodId>("3M");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visibleHoldings = useMemo(
    () => state.holdings.filter((h) => !hidden.has(h.id)),
    [state.holdings, hidden]
  );

  const fxByHolding = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of state.holdings) m[h.id] = convert(1, h.priceCurrency || "USD", currency, rates);
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

  // Stacked area: value per asset over time
  const stackedData = useMemo(() => {
    if (!data) return [];
    const quantities = buildQuantityByDate(data, visibleHoldings, state.transactions);
    return data.map((d) => {
      const row: Record<string, number | string> = {
        date: d.date,
        label: format(new Date(d.date), period === "1D" ? "HH:mm" : "MMM d"),
      };
      for (const h of visibleHoldings) {
        const quantity = quantities.get(d.date)?.[h.id] ?? h.quantity;
        const nativePrice = d.perAssetPrice?.[h.id] ?? (h.quantity ? (d.perAsset[h.id] ?? 0) / h.quantity : h.currentPrice);
        const v = nativePrice * quantity * (fxByHolding[h.id] ?? 1);
        row[h.symbol] = Math.round(v * 100) / 100;
      }
      return row;
    });
  }, [data, visibleHoldings, state.transactions, fxByHolding, period]);

  // Per-asset Invested (cumulative cost basis) and Value over time.
  const investedSeries = useMemo(() => {
    if (!data || !data.length) return [];
    const txsByHolding: Record<string, Array<(typeof state.transactions)[number] & { day: number }>> = {};
    for (const h of visibleHoldings) txsByHolding[h.id] = [];
    for (const t of state.transactions) {
      if (txsByHolding[t.holdingId]) txsByHolding[t.holdingId].push({ ...t, day: toUtcDayMs(t.date) });
    }
    for (const id of Object.keys(txsByHolding)) {
      txsByHolding[id].sort((a, b) => a.day - b.day);
    }
    const cum: Record<string, number> = {};
    const qty: Record<string, number> = {};
    const idx: Record<string, number> = {};
    for (const h of visibleHoldings) {
      const hasTransactions = txsByHolding[h.id].length > 0;
      qty[h.id] = hasTransactions ? h.openingQuantity ?? 0 : h.quantity;
      cum[h.id] = qty[h.id] > 0 && !hasTransactions ? qty[h.id] * h.currentPrice * (fxByHolding[h.id] ?? 1) : 0;
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
        const nativePrice = d.perAssetPrice?.[h.id] ?? (h.quantity ? (d.perAsset[h.id] ?? 0) / h.quantity : h.currentPrice);
        const val = Math.round(nativePrice * qty[h.id] * (fxByHolding[h.id] ?? 1) * 100) / 100;
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
        <CardTitle>Portfolio over time</CardTitle>
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
        <Tabs defaultValue="stacked">
          <TabsList className="grid w-full sm:w-auto grid-cols-2">
            <TabsTrigger value="stacked">Value per asset</TabsTrigger>
            <TabsTrigger value="invested">Invested vs Value</TabsTrigger>
          </TabsList>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Assets
            </span>
            {state.holdings.map((h) => {
              const off = hidden.has(h.id);
              return (
                <button
                  key={h.id}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(h.id)) next.delete(h.id);
                      else next.add(h.id);
                      return next;
                    })
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    off
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
              );
            })}
            {state.holdings.length > 1 && (
              <div className="ml-auto flex items-center gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setHidden(new Set())}>
                  Show all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setHidden(new Set(state.holdings.map((h) => h.id)))}
                >
                  Hide all
                </Button>
              </div>
            )}
          </div>


          <TabsContent value="stacked" className="mt-4">
            <ChartFrame filename="holdings-stacked" title={`Value per asset · ${period}`}>
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
                    <AreaChart data={stackedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} minTickGap={30} />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => (privacy ? MASK : formatMoney(v as number, currency, { compact: true }))}
                        width={60}
                      />
                      <Tooltip
                        contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
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
            <ChartFrame filename="holdings-invested" title={`Invested vs Value · ${period}`}>
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
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={investedSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} minTickGap={30} />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => (privacy ? MASK : formatMoney(v as number, currency, { compact: true }))}
                        width={60}
                      />
                      <Tooltip
                        contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                        formatter={(value, name, item) => {
                          const key = String((item as { dataKey?: unknown })?.dataKey ?? "");
                          const m = key.match(/^(?:inv|val)_(.+)$/);
                          const payload = (item as { payload?: Record<string, number> })?.payload;
                          if (m && payload) {
                            const q = payload[`qty_${m[1]}`];
                            if (typeof q === "number") {
                              const holding = visibleHoldings.find((h) => h.id === m[1]);
                              return [`${mask(Number(value))}  ·  ${formatQuantity(q)} ${holding?.symbol ?? ""}`, String(name)];
                            }
                          }
                          return [mask(Number(value)), String(name)];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {visibleHoldings.length > 1 && (
                        <>
                          <Line type="monotone" dataKey="Invested" name="Total invested" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                          <Line type="monotone" dataKey="Value" name="Total value" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
                        </>
                      )}
                      {visibleHoldings.map((h) => (
                        <Line
                          key={`inv-${h.id}`}
                          type="monotone"
                          dataKey={`inv_${h.id}`}
                          name={`${h.symbol} invested`}
                          stroke={h.color}
                          strokeOpacity={0.55}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={false}
                        />
                      ))}
                      {visibleHoldings.map((h) => (
                        <Line
                          key={`val-${h.id}`}
                          type="monotone"
                          dataKey={`val_${h.id}`}
                          name={`${h.symbol} value`}
                          stroke={h.color}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartFrame>

            {state.transactions.length > 0 && investedSeries.length > 0 && (
              <InvestedSummary
                invested={Number(investedSeries[investedSeries.length - 1].Invested) || 0}
                value={Number(investedSeries[investedSeries.length - 1].Value) || 0}
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
      <div className={cn("rounded-md px-3 py-2", gain >= 0 ? "bg-success/15" : "bg-destructive/15")}>
        <div className="text-xs text-muted-foreground">Gain</div>
        <div className={cn("tabular-nums font-medium", gain >= 0 ? "text-success" : "text-destructive")}>
          {gain >= 0 ? "+" : "−"}{mask(Math.abs(gain))} · {formatPct(pct)}
        </div>
      </div>
    </div>
  );
}
