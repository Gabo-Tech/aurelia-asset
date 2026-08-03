import React, { useMemo } from "react";
import { ScrollView, Text, StyleSheet, RefreshControl, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { subDays } from "date-fns";
import {
  Screen,
  BrandMark,
  Card,
  Metric,
  HeroMetric,
  EmptyState,
  Chip,
  SectionHeader,
} from "@/components/ui";
import { ChartFrame } from "@/components/ChartFrame";
import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { useStore, useMoney } from "@/lib/store";
import {
  expandCashflows,
  valuesByEntry,
  liquidityImpact,
  cardDebtImpact,
} from "@/lib/cashflow-math";
import type { RootTabParamList } from "@/navigation/RootNavigator";
import { colors, spacing, radii } from "@/theme/colors";
import { type as typography } from "@/theme/typography";

export function DashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { state } = useStore();
  const assistantEnabled = state.settings.aiAssistantEnabled !== false;
  const { mask, toDisplay, currency } = useMoney();
  const [refreshing, setRefreshing] = React.useState(false);

  const stats = useMemo(() => {
    const until = new Date();
    const from30 = subDays(until, 30);
    const expanded = expandCashflows(state.cashflows, until);
    const values = valuesByEntry(expanded, toDisplay);
    let liquidity = 0;
    let income = 0;
    let expense = 0;
    let cardDebt = 0;
    let income30 = 0;
    let expense30 = 0;
    for (const e of expanded) {
      const v = values.get(e.id) ?? 0;
      liquidity += liquidityImpact(e, v);
      if (e.kind === "income") income += v;
      if (e.kind === "expense") expense += v;
      const d = new Date(e.date);
      if (d >= from30 && d <= until) {
        if (e.kind === "income") income30 += v;
        if (e.kind === "expense") expense30 += v;
      }
    }
    for (const c of state.creditCards ?? []) {
      for (const e of expanded) {
        const v = values.get(e.id) ?? toDisplay(e.amount, e.currency);
        cardDebt += cardDebtImpact(e, c.id, v);
      }
    }
    const portfolio = state.holdings.reduce(
      (sum, h) => sum + toDisplay(h.quantity * h.currentPrice, h.priceCurrency),
      0,
    );
    return {
      liquidity,
      income,
      expense,
      portfolio,
      cardDebt,
      net: liquidity + portfolio - Math.max(0, cardDebt),
      net30: income30 - expense30,
    };
  }, [state.cashflows, state.holdings, state.creditCards, toDisplay]);

  const bars = useMemo(() => {
    const items = state.holdings
      .map((h) => ({
        symbol: h.symbol,
        value: Math.max(0, toDisplay(h.quantity * h.currentPrice, h.priceCurrency)),
        color: h.color,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    const max = Math.max(1, ...items.map((i) => i.value));
    return items.map((i) => ({ ...i, pct: i.value / max }));
  }, [state.holdings, toDisplay]);

  const allocation = useMemo(() => {
    const holdings = state.holdings
      .map((h) => ({
        label: h.symbol,
        value: Math.max(0, toDisplay(h.quantity * h.currentPrice, h.priceCurrency)),
        color: h.color || colors.accent,
      }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
    const cash = Math.max(0, stats.liquidity);
    const slices = [
      ...(cash > 0 ? [{ label: "Liquidity", value: cash, color: colors.accent }] : []),
      ...holdings,
    ];
    if (stats.cardDebt > 0) {
      slices.push({
        label: "Card debt",
        value: stats.cardDebt,
        color: colors.danger,
      });
    }
    return slices;
  }, [state.holdings, stats.liquidity, stats.cardDebt, toDisplay]);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 500);
            }}
            tintColor={colors.accent}
          />
        }
      >
        <BrandMark
          subtitle={t("design.localFirst", { defaultValue: "Private · on-device" })}
        />

        <HeroMetric
          label={t("dashboard.netWorth", { defaultValue: `Net worth · ${currency}`, currency })}
          value={mask(stats.net)}
          hint={t("dashboard.net30", {
            defaultValue: `Cashflow last 30d · ${mask(stats.net30)}`,
          })}
        />

        <View style={styles.tileRow}>
          <View style={styles.tile}>
            <Metric label="Liquidity" value={mask(stats.liquidity)} />
          </View>
          <View style={styles.tile}>
            <Metric label="Portfolio" value={mask(stats.portfolio)} />
          </View>
        </View>
        {stats.cardDebt > 0 ? (
          <Card elevated>
            <Metric label="Credit card debt" value={mask(Math.max(0, stats.cardDebt))} />
          </Card>
        ) : null}

        <SectionHeader title={t("dashboard.quickActions", { defaultValue: "Go to" })} />
        <View style={styles.chips}>
          <Chip label="Holdings" onPress={() => navigation.navigate("Holdings")} />
          <Chip label="Cashflow" onPress={() => navigation.navigate("Cashflow")} />
          <Chip label="Performance" onPress={() => navigation.navigate("Performance")} />
          <Chip label="Planning" onPress={() => navigation.navigate("Planning")} />
          {assistantEnabled ? (
            <Chip label="Assistant" onPress={() => navigation.navigate("Assistant")} />
          ) : null}
        </View>

        <CategoryBreakdown
          title={t("dashboard.allocation", { defaultValue: "Allocation" })}
          filename="dashboard-allocation"
          slices={allocation}
          format={(n) => mask(n)}
          emptyLabel={t("dashboard.allocationEmpty", {
            defaultValue: "Add cashflow or holdings to see allocation.",
          })}
        />

        {bars.length > 0 ? (
          <ChartFrame
            filename="holdings-bar"
            title={t("dashboard.topHoldings", { defaultValue: "Top holdings" })}
          >
            {bars.map((b) => (
              <View key={b.symbol} style={styles.barRow}>
                <Text style={styles.barLabel}>{b.symbol}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.round(b.pct * 100)}%`,
                        backgroundColor: b.color || colors.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barValue}>{mask(b.value)}</Text>
              </View>
            ))}
          </ChartFrame>
        ) : (
          <EmptyState
            title={t("dashboard.emptyHoldings", { defaultValue: "No holdings yet" })}
            body={t("dashboard.emptyHoldingsBody", {
              defaultValue: "Add a holding to track portfolio value. Your data stays on this device.",
            })}
            actionLabel={t("dashboard.addHolding", { defaultValue: "Add a holding" })}
            onAction={() => navigation.navigate("Holdings")}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tileRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.md },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  barLabel: { ...typography.caption, color: colors.text, width: 52, fontWeight: "700" },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: radii.sm },
  barValue: { ...typography.caption, color: colors.muted, width: 88, textAlign: "right" },
});
