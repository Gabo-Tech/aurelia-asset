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
import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { useStore, useMoney } from "@/lib/store";
import {
  expandCashflows,
  valuesByEntry,
  liquidityImpact,
  cardDebtImpact,
} from "@/lib/cashflow-math";
import { formatHoldingQuantity } from "@/lib/format";
import type { RootTabParamList } from "@/navigation/RootNavigator";
import { colors, spacing, radii } from "@/theme/colors";

export function DashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { state } = useStore();
  const assistantEnabled = state.settings.aiAssistantEnabled !== false;
  const { mask, toDisplay, currency, privacy } = useMoney();
  const [refreshing, setRefreshing] = React.useState(false);
  const name = state.settings.displayName?.trim();
  const greeting = name
    ? t("dashboard.greetingNamed", {
        name,
        defaultValue: `Hi ${name}, welcome to your dashboard.`,
      })
    : t("dashboard.greeting", {
        defaultValue: "Hi, welcome to your dashboard.",
      });

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
        detail: formatHoldingQuantity(h.quantity, h.symbol, h.type, privacy),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    const max = Math.max(1, ...items.map((i) => i.value));
    return items.map((i) => ({ ...i, pct: i.value / max }));
  }, [state.holdings, toDisplay, privacy]);

  const allocation = useMemo(() => {
    const holdings = state.holdings
      .map((h) => ({
        label: h.symbol,
        value: Math.max(0, toDisplay(h.quantity * h.currentPrice, h.priceCurrency)),
        color: h.color || colors.accent,
        detail: formatHoldingQuantity(h.quantity, h.symbol, h.type, privacy),
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
  }, [state.holdings, stats.liquidity, stats.cardDebt, toDisplay, privacy]);

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
        <BrandMark title={greeting} subtitle={t("dashboard.brandSubtitle")} />

        {state.holdings.length === 0 && state.cashflows.length === 0 ? (
          <Card elevated>
            <EmptyState
              title={t("dashboard.gettingStarted")}
              body={t("dashboard.gettingStartedBody")}
              actionLabel={t("dashboard.trackSpending")}
              onAction={() => navigation.navigate("Cashflow")}
            />
            <View style={{ height: spacing.sm }} />
            <Chip
              label={t("dashboard.addHolding")}
              onPress={() => navigation.navigate("Holdings")}
            />
          </Card>
        ) : null}

        <HeroMetric
          label={t("dashboard.netWorth", { currency })}
          value={mask(stats.net)}
          hint={t("dashboard.netWorthHint", { amount: mask(stats.net30) })}
        />

        <View style={styles.tileRow}>
          <View style={styles.tile}>
            <Metric label="Liquidity" value={mask(stats.liquidity)} />
            <Text style={styles.tileHint}>{t("dashboard.liquidityHint")}</Text>
          </View>
          <View style={styles.tile}>
            <Metric label="Portfolio" value={mask(stats.portfolio)} />
            <Text style={styles.tileHint}>{t("dashboard.portfolioHint")}</Text>
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
          <CategoryBreakdown
            title={t("dashboard.topHoldings", { defaultValue: "Top holdings" })}
            filename="holdings-bar"
            slices={bars.map((b) => ({
              label: b.symbol,
              value: b.value,
              color: b.color || colors.accent,
              detail: b.detail,
            }))}
            format={(n) => mask(n)}
          />
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
  tileHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
});
