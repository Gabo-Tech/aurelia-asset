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
    return data.map((d) => {
      const row: Record<string, number | string> = {
        date: d.date,
        label: format(new Date(d.date), period === "1D" ? "HH:mm" : "MMM d"),
      };
      for (const h of state.holdings) {
        const v = (d.perAsset[h.id] ?? 0) * (fxByHolding[h.id] ?? 1);
        row[h.symbol] = Math.round(v * 100) / 100;
      }
      return row;
    });
  }, [data, state.holdings, fxByHolding, period]);

  // Invested vs value: walk transactions cumulatively over dates,
  // restricted to the currently visible holdings.
  const investedSeries = useMemo(() => {
    if (!data || !data.length) return [];
    const visibleIds = new Set(visibleHoldings.map((h) => h.id));
    const txs = [...state.transactions]
      .filter((t) => visibleIds.has(t.holdingId))
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));
    let cum = 0;
    let ti = 0;
    return data.map((d) => {
      while (ti < txs.length && +new Date(txs[ti].date) <= d.date) {
        const t = txs[ti];
        const fx = convert(1, t.currency || "USD", currency, rates);
        const sign = t.kind === "buy" ? 1 : -1;
        cum += sign * t.quantity * t.pricePerUnit * fx;
        if (t.fees) cum += t.fees * fx;
        ti++;
      }
      let value = 0;
      for (const h of visibleHoldings) {
        value += (d.perAsset[h.id] ?? 0) * (fxByHolding[h.id] ?? 1);
      }
      return {
        date: d.date,
        label: format(new Date(d.date), period === "1D" ? "HH:mm" : "MMM d"),
        Invested: Math.round(cum * 100) / 100,
        Value: Math.round(value * 100) / 100,
      };
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
                      {state.holdings.map((h) => (
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
                        formatter={(value: number) => mask(value)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Invested" stroke="#94a3b8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Value" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartFrame>

            {state.transactions.length > 0 && investedSeries.length > 0 && (
              <InvestedSummary
                invested={investedSeries[investedSeries.length - 1].Invested}
                value={investedSeries[investedSeries.length - 1].Value}
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
