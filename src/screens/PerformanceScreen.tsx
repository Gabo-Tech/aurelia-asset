import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  View,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Screen, Header, Card, Metric, MetricRow, PrimaryButton, EmptyState, chipLabelStyle, chipContainerStyle } from "@/components/ui";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { RootTabParamList } from "@/navigation/RootNavigator";
import { ChartFrame } from "@/components/ChartFrame";
import { HistoryLineChart, type HistoryLineSeries } from "@/components/HistoryLineChart";
import { useStore, useMoney } from "@/lib/store";
import { fetchCurrentQuote, fetchPortfolioHistory } from "@/lib/finance";
import {
  type PeriodId,
  type PortfolioHistoryPoint,
} from "@/lib/finance/portfolio-history";
import { colors } from "@/theme/colors";

const PERIODS: PeriodId[] = ["1D", "7D", "1M", "3M", "6M", "YTD", "1Y", "Max"];
const TOTAL_KEY = "Total";

export function PerformanceScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { state, updateHolding } = useStore();
  const { mask, toDisplay } = useMoney();
  const [busy, setBusy] = useState(false);
  const [histBusy, setHistBusy] = useState(false);
  const [sort, setSort] = useState<"pnl" | "value" | "symbol">("pnl");
  const [period, setPeriod] = useState<PeriodId>("1M");
  const [history, setHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [indexed, setIndexed] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hideTotal, setHideTotal] = useState(false);

  const rows = useMemo(() => {
    const list = state.holdings.map((h) => {
      const buys = state.transactions.filter((tx) => tx.holdingId === h.id && tx.kind === "buy");
      const sells = state.transactions.filter((tx) => tx.holdingId === h.id && tx.kind === "sell");
      const costFromTx = [...buys, ...sells].reduce((sum, tx) => {
        const signed = tx.kind === "buy" ? 1 : -1;
        return (
          sum +
          signed *
            toDisplay(
              tx.quantity * tx.pricePerUnit + (tx.fees ?? 0),
              tx.currency || h.priceCurrency,
            )
        );
      }, 0);
      const hasTx = buys.length + sells.length > 0;
      const cost = hasTx
        ? costFromTx
        : toDisplay(h.quantity * (h.manualPrice ?? h.currentPrice), h.priceCurrency);
      const value = toDisplay(h.quantity * h.currentPrice, h.priceCurrency);
      const pnl = value - Math.abs(cost);
      const pct = Math.abs(cost) > 0 ? (pnl / Math.abs(cost)) * 100 : 0;
      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        value,
        cost: Math.abs(cost),
        pnl,
        pct,
        color: h.color,
      };
    });
    list.sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sort === "value") return b.value - a.value;
      return b.pnl - a.pnl;
    });
    return list;
  }, [state.holdings, state.transactions, toDisplay, sort]);

  const totals = useMemo(() => {
    const value = rows.reduce((s, r) => s + r.value, 0);
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    const pnl = value - cost;
    const pct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { value, cost, pnl, pct };
  }, [rows]);

  const bars = useMemo(() => {
    const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
    return rows.slice(0, 8).map((r) => ({
      ...r,
      pctBar: Math.abs(r.pnl) / max,
    }));
  }, [rows]);

  const chartSeries = useMemo((): HistoryLineSeries[] => {
    if (history.length < 2) return [];

    const baselines: Record<string, number> = {};
    if (indexed) {
      for (const p of history) {
        if (baselines[TOTAL_KEY] == null && p.total > 0) baselines[TOTAL_KEY] = p.total;
        for (const h of state.holdings) {
          const v = p.perAsset[h.id] ?? 0;
          if (baselines[h.id] == null && v > 0) baselines[h.id] = v;
        }
        if (
          baselines[TOTAL_KEY] != null &&
          state.holdings.every((h) => baselines[h.id] != null)
        ) {
          break;
        }
      }
    }

    const scale = (key: string, raw: number) => {
      if (!indexed) return raw;
      const base = baselines[key] || 1;
      return (raw / base) * 100;
    };

    const out: HistoryLineSeries[] = [];
    if (!hideTotal) {
      out.push({
        key: TOTAL_KEY,
        color: colors.accent,
        strokeWidth: 2.5,
        values: history.map((p) => scale(TOTAL_KEY, p.total)),
      });
    }
    for (const h of state.holdings) {
      if (hidden.has(h.id)) continue;
      out.push({
        key: h.id,
        color: h.color || colors.text,
        strokeWidth: 1.75,
        values: history.map((p) => scale(h.id, p.perAsset[h.id] ?? 0)),
      });
    }
    return out;
  }, [history, indexed, state.holdings, hidden, hideTotal]);

  const rangeCaption = useMemo(() => {
    if (!chartSeries.length || history.length < 2) return null;
    const primary =
      chartSeries.find((s) => s.key === TOTAL_KEY) ?? chartSeries[0]!;
    const first = primary.values[0]!;
    const last = primary.values[primary.values.length - 1]!;
    return { first, last, isTotal: primary.key === TOTAL_KEY };
  }, [chartSeries, history.length]);

  const periodReturn = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0]!.total;
    const last = history[history.length - 1]!.total;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }, [history]);

  const assetPeriodReturns = useMemo(() => {
    if (history.length < 2) return [];
    const first = history[0]!;
    const last = history[history.length - 1]!;
    return state.holdings
      .map((h) => {
        const start = first.perAsset[h.id] ?? 0;
        const end = last.perAsset[h.id] ?? 0;
        const change = end - start;
        const pct = start > 0 ? (change / start) * 100 : null;
        return {
          id: h.id,
          symbol: h.symbol,
          start,
          end,
          change,
          pct,
          color: h.color,
        };
      })
      .filter((r) => r.start > 0 || r.end > 0)
      .sort((a, b) => b.change - a.change);
  }, [history, state.holdings]);

  useEffect(() => {
    let cancelled = false;
    if (!state.holdings.length) {
      setHistory([]);
      return;
    }
    setHistBusy(true);
    void fetchPortfolioHistory(state.holdings, period, state.transactions)
      .then((pts) => {
        if (!cancelled) setHistory(pts);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.holdings, state.transactions, period]);

  async function refresh() {
    setBusy(true);
    try {
      for (const h of state.holdings) {
        try {
          const q = await fetchCurrentQuote(h);
          if (q?.price != null) {
            updateHolding(h.id, {
              currentPrice: q.price,
              lastPriceAt: Date.now(),
              priceCurrency: q.currency || h.priceCurrency,
            });
          }
        } catch {
          /* skip */
        }
      }
      const pts = await fetchPortfolioHistory(state.holdings, period, state.transactions);
      setHistory(pts);
    } finally {
      setBusy(false);
    }
  }

  function toggleHolding(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasChart = chartSeries.length > 0 && history.length > 1;

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={() => void refresh()}
            tintColor={colors.accent}
          />
        }
      >
        <Header
          title={t("nav.performance", { defaultValue: "Performance" })}
          subtitle={t("performance.subtitle", {
            defaultValue: "Value, cost basis, and returns over time",
          })}
        />
        <Card>
          <MetricRow
            items={[
              { label: "Portfolio value", value: mask(totals.value) },
              { label: "Cost basis", value: mask(totals.cost) },
              {
                label: "Total P&L",
                value: `${mask(totals.pnl)} (${totals.pct.toFixed(1)}%)`,
                color: totals.pnl >= 0 ? colors.success : colors.danger,
              },
            ]}
          />
          {periodReturn != null ? (
            <Metric label={`Return (${period})`} value={`${periodReturn.toFixed(1)}%`} />
          ) : null}
          <PrimaryButton
            compact
            label={busy ? "Refreshing…" : "Refresh prices"}
            onPress={() => void refresh()}
            disabled={busy}
          />
        </Card>

        <View style={styles.sortRow}>
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={[styles.sortChip, period === p && styles.sortChipOn]}
            >
              <Text style={styles.sortText}>{p}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.sortRow}>
          <Pressable
            onPress={() => setIndexed(false)}
            style={[styles.sortChip, !indexed && styles.sortChipOn]}
          >
            <Text style={styles.sortText}>Value</Text>
          </Pressable>
          <Pressable
            onPress={() => setIndexed(true)}
            style={[styles.sortChip, indexed && styles.sortChipOn]}
          >
            <Text style={styles.sortText}>Indexed</Text>
          </Pressable>
        </View>

        {state.holdings.length > 0 ? (
          <View style={styles.filterRow}>
            <Pressable
              onPress={() => setHideTotal((v) => !v)}
              style={[styles.filterChip, hideTotal && styles.filterChipOff]}
            >
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.filterText, hideTotal && styles.filterTextOff]}>Total</Text>
            </Pressable>
            {state.holdings.map((h) => {
              const off = hidden.has(h.id);
              return (
                <Pressable
                  key={h.id}
                  onPress={() => toggleHolding(h.id)}
                  style={[styles.filterChip, off && styles.filterChipOff]}
                >
                  <View style={[styles.dot, { backgroundColor: h.color || colors.text }]} />
                  <Text style={[styles.filterText, off && styles.filterTextOff]}>{h.symbol}</Text>
                </Pressable>
              );
            })}
            {state.holdings.length > 1 ? (
              <View style={styles.filterActions}>
                <Pressable
                  onPress={() => {
                    setHidden(new Set());
                    setHideTotal(false);
                  }}
                  hitSlop={6}
                >
                  <Text style={styles.filterAction}>Show all</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHidden(new Set(state.holdings.map((h) => h.id)));
                    setHideTotal(true);
                  }}
                  hitSlop={6}
                >
                  <Text style={styles.filterAction}>Hide all</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {histBusy ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
        ) : hasChart ? (
          <ChartFrame filename={`performance-${period}`} title={`History · ${period}`}>
            <HistoryLineChart series={chartSeries} />
            {rangeCaption ? (
              <Text style={styles.sparkMeta}>
                {indexed
                  ? `${rangeCaption.first.toFixed(0)} → ${rangeCaption.last.toFixed(0)} (idx)`
                  : `${mask(rangeCaption.first)} → ${mask(rangeCaption.last)}`}
              </Text>
            ) : null}
          </ChartFrame>
        ) : null}

        {assetPeriodReturns.length > 0 ? (
          <Card>
            <Text style={styles.symbol}>Period returns · {period}</Text>
            {assetPeriodReturns.map((r) => (
              <View key={r.id} style={styles.assetRow}>
                <Text style={[styles.assetSym, { color: r.color || colors.text }]}>
                  {r.symbol}
                </Text>
                <Text style={styles.assetMeta}>
                  {mask(r.start)} → {mask(r.end)}
                </Text>
                <Text
                  style={[
                    styles.assetChg,
                    { color: r.change >= 0 ? colors.success : colors.danger },
                  ]}
                >
                  {mask(r.change)}
                  {r.pct != null ? ` (${r.pct.toFixed(1)}%)` : ""}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        <View style={styles.sortRow}>
          {(["pnl", "value", "symbol"] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSort(s)}
              style={[styles.sortChip, sort === s && styles.sortChipOn]}
            >
              <Text style={styles.sortText}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {bars.length > 0 ? (
          <ChartFrame filename="performance-pnl" title="P&L by holding">
            {bars.map((b) => (
              <View key={b.id} style={styles.barRow}>
                <Text style={styles.barLabel}>{b.symbol}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.round(b.pctBar * 100)}%`,
                        backgroundColor: b.pnl >= 0 ? colors.success : colors.danger,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barValue}>{mask(b.pnl)}</Text>
              </View>
            ))}
          </ChartFrame>
        ) : null}

        {rows.map((r) => (
          <Card key={r.id}>
            <Text style={styles.symbol}>
              {r.symbol} · {r.name}
            </Text>
            <MetricRow
              items={[
                { label: "Value", value: mask(r.value) },
                { label: "Cost", value: mask(r.cost) },
                {
                  label: "P&L",
                  value: `${mask(r.pnl)} (${r.pct.toFixed(1)}%)`,
                  color: r.pnl >= 0 ? colors.success : colors.danger,
                },
              ]}
            />
          </Card>
        ))}
        {rows.length === 0 ? (
          <EmptyState
            title={t("performance.emptyTitle", { defaultValue: "No performance data yet" })}
            body={t("performance.emptyState", {
              defaultValue: "Add holdings first to see your historical performance.",
            })}
            actionLabel={t("dashboard.addHolding", { defaultValue: "Add a holding" })}
            onAction={() => navigation.navigate("Holdings")}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  symbol: { color: colors.text, fontWeight: "700", marginBottom: 8 },
  empty: { color: colors.muted },
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  assetSym: { width: 56, fontWeight: "700", fontSize: 12 },
  assetMeta: { flex: 1, color: colors.muted, fontSize: 11 },
  assetChg: { fontSize: 12, fontWeight: "600", textAlign: "right", minWidth: 100 },
  sortRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  sortChip: {
    ...chipContainerStyle,
    borderWidth: 1,
  },
  sortChipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  sortText: { ...chipLabelStyle, textTransform: "uppercase" },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    ...chipContainerStyle,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipOff: {
    opacity: 0.55,
    backgroundColor: colors.surfaceAlt,
  },
  filterText: { ...chipLabelStyle },
  filterTextOff: { color: colors.muted },
  filterActions: { flexDirection: "row", alignItems: "center", gap: 12, marginLeft: "auto" },
  filterAction: { color: colors.muted, fontSize: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  barLabel: { color: colors.text, width: 52, fontSize: 12, fontWeight: "600" },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 5,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 5 },
  barValue: { color: colors.muted, width: 88, fontSize: 11, textAlign: "right" },
  sparkMeta: { color: colors.muted, fontSize: 11, marginTop: 8, paddingHorizontal: 4 },
});
