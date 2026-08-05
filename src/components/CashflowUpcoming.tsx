import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { format, isToday, isTomorrow } from "date-fns";
import {
  getUpcomingOccurrences,
  groupOccurrencesByDay,
  summarizeUpcoming,
  valuesByEntry,
  type ExpandedCashflowEntry,
} from "@/lib/cashflow-math";
import { Card, EmptyState, SegmentedControl } from "@/components/ui";
import type { CashflowEntry } from "@/lib/types";
import { colors, spacing } from "@/theme/colors";

type UpcomingDays = 7 | 30 | 90;

function entryLabel(e: ExpandedCashflowEntry): string {
  const name = e.kind === "income" ? e.source : e.category;
  return e.description || name || "(unnamed)";
}

function dayHeading(date: Date, t: (k: string) => string): string {
  if (isToday(date)) return t("cashflow.upcoming.today");
  if (isTomorrow(date)) return t("cashflow.upcoming.tomorrow");
  return format(date, "EEE, MMM d");
}

function isRecurringOccurrence(e: ExpandedCashflowEntry, parents: CashflowEntry[]): boolean {
  const parent = parents.find((p) => p.id === e.parentId);
  return !!parent?.recurrence || !!parent?.installmentPlan;
}

type Props = {
  cashflows: CashflowEntry[];
  mask: (n: number) => string;
  toDisplay: (amount: number, from?: string) => number;
  onEdit?: (parentId: string) => void;
  compact?: boolean;
  limit?: number;
  initialDays?: UpcomingDays;
  onViewAll?: () => void;
};

export function CashflowUpcoming({
  cashflows,
  mask,
  toDisplay,
  onEdit,
  compact = false,
  limit,
  initialDays = 30,
  onViewAll,
}: Props) {
  const { t } = useTranslation();
  const [days, setDays] = useState<UpcomingDays>(initialDays);
  const windowDays = compact ? initialDays : days;

  const occurrences = useMemo(
    () => getUpcomingOccurrences(cashflows, { days: windowDays }),
    [cashflows, windowDays],
  );
  const displayed = limit ? occurrences.slice(0, limit) : occurrences;
  const values = useMemo(() => valuesByEntry(occurrences, toDisplay), [occurrences, toDisplay]);
  const totals = useMemo(() => summarizeUpcoming(occurrences, values), [occurrences, values]);
  const byDay = useMemo(() => groupOccurrencesByDay(displayed), [displayed]);
  const dayKeys = useMemo(() => [...byDay.keys()].sort(), [byDay]);

  if (!compact && !displayed.length) {
    return (
      <EmptyState
        title={t("cashflow.upcoming.empty")}
        body={t("cashflow.upcoming.emptyHint")}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      {!compact && (
        <>
          <Text style={styles.sub}>{t("cashflow.upcoming.expectedIn", { days: windowDays })}</Text>
          <SegmentedControl
            options={([7, 30, 90] as UpcomingDays[]).map((d) => ({
              id: String(d) as `${UpcomingDays}`,
              label: t("cashflow.upcoming.daysShort", { count: d }),
            }))}
            value={String(days)}
            onChange={(v) => setDays(Number(v) as UpcomingDays)}
          />
          <Card>
            <View style={styles.totalsRow}>
              <SummaryChip label={t("cashflow.income")} value={mask(totals.income)} tone="income" />
              <SummaryChip
                label={t("cashflow.expenses")}
                value={mask(totals.expense)}
                tone="expense"
              />
              <SummaryChip
                label={t("cashflow.net")}
                value={`${totals.net >= 0 ? "+" : "−"}${mask(Math.abs(totals.net))}`}
                tone={totals.net >= 0 ? "income" : "expense"}
              />
            </View>
          </Card>
        </>
      )}

      {displayed.length === 0 ? (
        <Text style={styles.empty}>{t("cashflow.upcoming.empty")}</Text>
      ) : (
        dayKeys.map((key) => {
          const items = byDay.get(key) ?? [];
          const date = new Date(`${key}T12:00:00`);
          return (
            <View key={key} style={styles.dayBlock}>
              <Text style={styles.dayHead}>{dayHeading(date, t)}</Text>
              {items.map((e) => (
                <UpcomingRow
                  key={e.id}
                  entry={e}
                  cashflows={cashflows}
                  value={values.get(e.id) ?? 0}
                  mask={mask}
                  compact={compact}
                  onEdit={onEdit}
                />
              ))}
            </View>
          );
        })
      )}

      {compact && onViewAll && occurrences.length > 0 ? (
        <Pressable onPress={onViewAll} style={styles.viewAll}>
          <Text style={styles.viewAllText}>{t("cashflow.upcoming.viewAll")} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function UpcomingRow({
  entry,
  cashflows,
  value,
  mask,
  compact,
  onEdit,
}: {
  entry: ExpandedCashflowEntry;
  cashflows: CashflowEntry[];
  value: number;
  mask: (n: number) => string;
  compact?: boolean;
  onEdit?: (parentId: string) => void;
}) {
  const { t } = useTranslation();
  const isIncome = entry.kind === "income";
  const recurring = isRecurringOccurrence(entry, cashflows);

  return (
    <Pressable
      onPress={() => onEdit?.(entry.parentId)}
      disabled={!onEdit}
      style={({ pressed }) => [styles.row, pressed && onEdit && styles.rowPressed]}
    >
      <Text style={[styles.arrow, isIncome ? styles.income : styles.expense]}>
        {isIncome ? "↑" : "↓"}
      </Text>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {entryLabel(entry)}
        </Text>
        {!compact && (
          <Text style={styles.rowMeta}>
            {recurring ? t("cashflow.upcoming.recurring") : t("cashflow.upcoming.oneTime")}
          </Text>
        )}
      </View>
      <Text style={[styles.rowAmount, isIncome ? styles.income : styles.expense]}>
        {isIncome ? "+" : "−"}
        {mask(value)}
      </Text>
    </Pressable>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "income" | "expense";
}) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, tone === "income" ? styles.income : styles.expense]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  sub: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  totalsRow: { flexDirection: "row", gap: 8 },
  chip: { flex: 1, alignItems: "center" },
  chipLabel: {
    color: colors.muted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipValue: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  dayBlock: { marginBottom: spacing.sm },
  dayHead: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { opacity: 0.85 },
  arrow: { fontSize: 16, fontWeight: "700", width: 22, textAlign: "center" },
  rowMain: { flex: 1, minWidth: 0 },
  rowLabel: { color: colors.text, fontWeight: "600", fontSize: 14 },
  rowMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  rowAmount: { fontWeight: "700", fontSize: 14 },
  income: { color: colors.income },
  expense: { color: colors.expense },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: 24, fontSize: 14 },
  viewAll: { alignItems: "center", paddingVertical: 8 },
  viewAllText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
});
