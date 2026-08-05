import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Svg, { G, Path, Circle } from "react-native-svg";
import { ChartFrame } from "@/components/ChartFrame";
import { SegmentedControl } from "@/components/ui";
import { colors, radii, spacing } from "@/theme/colors";
import { type as typography } from "@/theme/typography";

export type BreakdownSlice = {
  label: string;
  value: number;
  color: string;
  /** Optional secondary line, e.g. "0.25 BTC" for holdings allocation. */
  detail?: string;
};

type Props = {
  title: string;
  filename: string;
  slices: BreakdownSlice[];
  format: (n: number) => string;
  emptyLabel?: string;
};

type ViewMode = "bars" | "pie";

function polar(cx: number, cy: number, r: number, angle: number) {
  const a = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y} L ${cx} ${cy} Z`;
}

export function CategoryBreakdown({ title, filename, slices, format, emptyLabel }: Props) {
  const [mode, setMode] = useState<ViewMode>("bars");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const ranked = useMemo(() => {
    const positive = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
    return positive.slice(0, 8);
  }, [slices]);

  const visible = useMemo(
    () => ranked.filter((s) => !hidden[s.label]),
    [ranked, hidden],
  );
  const total = useMemo(() => visible.reduce((s, x) => s + x.value, 0), [visible]);

  const toggle = (label: string) => {
    setHidden((h) => ({ ...h, [label]: !h[label] }));
  };

  if (!ranked.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.empty}>{emptyLabel ?? "No data in this period."}</Text>
      </View>
    );
  }

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 78;
  let angle = 0;
  const arcs =
    total > 0
      ? visible.map((s) => {
          const sweep = (s.value / total) * 360;
          const start = angle;
          const end = angle + Math.max(sweep, 0.01);
          angle = end;
          return { ...s, start, end };
        })
      : [];

  return (
    <ChartFrame filename={filename} title={title}>
      <SegmentedControl
        options={[
          { id: "bars" as const, label: "Bars" },
          { id: "pie" as const, label: "Pie" },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === "pie" ? (
        <View style={styles.pieWrap}>
          <Svg width={size} height={size}>
            <G>
              {arcs.length === 0 ? (
                <Circle cx={cx} cy={cy} r={r} fill={colors.surfaceAlt} />
              ) : arcs.length === 1 ? (
                <Circle cx={cx} cy={cy} r={r} fill={arcs[0]!.color} />
              ) : (
                arcs.map((a) => (
                  <Path
                    key={a.label}
                    d={arcPath(cx, cy, r, a.start, a.end)}
                    fill={a.color}
                  />
                ))
              )}
              <Circle cx={cx} cy={cy} r={36} fill={colors.surface} />
            </G>
          </Svg>
          <Text style={styles.pieTotal}>{format(total)}</Text>
        </View>
      ) : null}
      <View style={styles.stack}>
        {ranked.map((s) => {
          const pct = total > 0 && !hidden[s.label] ? s.value / total : 0;
          const dim = !!hidden[s.label];
          return (
            <Pressable key={s.label} onPress={() => toggle(s.label)} style={styles.row}>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: s.color, opacity: dim ? 0.25 : 1 },
                ]}
              />
              <View style={styles.labelCol}>
                <Text
                  style={[styles.label, dim && styles.labelDim]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
                {s.detail ? (
                  <Text
                    style={[styles.detail, dim && styles.labelDim]}
                    numberOfLines={1}
                  >
                    {s.detail}
                  </Text>
                ) : null}
              </View>
              {mode === "bars" ? (
                <View style={[styles.trackWrap, dim && { opacity: 0.25 }]}>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${Math.round(pct * 100)}%`, backgroundColor: s.color },
                      ]}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <Text style={[styles.value, dim && styles.labelDim]}>{format(s.value)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.total}>
        Total {format(total)}
        {Object.values(hidden).some(Boolean) ? " · tap to toggle" : ""}
      </Text>
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  emptyBox: { paddingVertical: spacing.sm },
  empty: { ...typography.caption, color: colors.muted },
  pieWrap: { alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  pieTotal: {
    ...typography.caption,
    color: colors.muted,
    position: "absolute",
    fontWeight: "700",
  },
  stack: { gap: 10, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  swatch: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  labelCol: { width: 88, flexShrink: 0 },
  label: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
  },
  detail: {
    ...typography.caption,
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
    fontVariant: ["tabular-nums"],
  },
  labelDim: { color: colors.muted, textDecorationLine: "line-through", opacity: 0.55 },
  trackWrap: { flex: 1, justifyContent: "center", minHeight: 18, paddingTop: 4 },
  track: {
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
    marginTop: 2,
  },
  total: { ...typography.caption, color: colors.muted, marginTop: spacing.sm },
});
