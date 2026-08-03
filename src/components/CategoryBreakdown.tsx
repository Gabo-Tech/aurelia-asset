import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ChartFrame } from "@/components/ChartFrame";
import { colors, radii, spacing } from "@/theme/colors";
import { type as typography } from "@/theme/typography";

export type BreakdownSlice = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  title: string;
  filename: string;
  slices: BreakdownSlice[];
  format: (n: number) => string;
  emptyLabel?: string;
};

export function CategoryBreakdown({ title, filename, slices, format, emptyLabel }: Props) {
  const ranked = useMemo(() => {
    const positive = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
    const total = positive.reduce((s, x) => s + x.value, 0);
    return { items: positive.slice(0, 8), total };
  }, [slices]);

  if (!ranked.items.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.empty}>{emptyLabel ?? "No data in this period."}</Text>
      </View>
    );
  }

  return (
    <ChartFrame filename={filename} title={title}>
      <View style={styles.stack}>
        {ranked.items.map((s) => {
          const pct = ranked.total > 0 ? s.value / ranked.total : 0;
          return (
            <View key={s.label} style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={styles.label} numberOfLines={1}>
                {s.label}
              </Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.round(pct * 100)}%`, backgroundColor: s.color },
                  ]}
                />
              </View>
              <Text style={styles.value}>{format(s.value)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.total}>Total {format(ranked.total)}</Text>
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  emptyBox: { paddingVertical: spacing.sm },
  empty: { ...typography.caption, color: colors.muted },
  stack: { gap: 10, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  label: {
    ...typography.caption,
    color: colors.text,
    width: 72,
    fontWeight: "600",
  },
  track: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radii.sm },
  value: {
    ...typography.caption,
    color: colors.muted,
    width: 72,
    textAlign: "right",
  },
  total: { ...typography.caption, color: colors.muted, marginTop: spacing.sm },
});
