import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

export type HistoryLineSeries = {
  key: string;
  color: string;
  values: number[];
  strokeWidth?: number;
};

type Props = {
  series: HistoryLineSeries[];
  height?: number;
};

const PAD_X = 4;
const PAD_Y = 8;

export function HistoryLineChart({ series, height = 120 }: Props) {
  const [width, setWidth] = useState(0);

  const polylines = useMemo(() => {
    if (!width || !series.length) return [];
    const n = series[0]?.values.length ?? 0;
    if (n < 2) return [];

    let min = Infinity;
    let max = -Infinity;
    for (const s of series) {
      for (const v of s.values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!isFinite(min) || !isFinite(max)) return [];
    if (min === max) {
      const pad = Math.abs(min) * 0.05 || 1;
      min -= pad;
      max += pad;
    }
    const range = max - min;
    const innerW = Math.max(1, width - PAD_X * 2);
    const innerH = Math.max(1, height - PAD_Y * 2);

    return series.map((s) => {
      const points = s.values
        .map((v, i) => {
          const x = PAD_X + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
          const y = PAD_Y + innerH - ((v - min) / range) * innerH;
          return `${x},${y}`;
        })
        .join(" ");
      return {
        key: s.key,
        color: s.color,
        strokeWidth: s.strokeWidth ?? 1.75,
        points,
      };
    });
  }, [series, width, height]);

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - width) > 0.5) setWidth(w);
  }

  return (
    <View style={[styles.wrap, { height }]} onLayout={onLayout}>
      {width > 0 && polylines.length > 0 ? (
        <Svg width={width} height={height}>
          {polylines.map((p) => (
            <Polyline
              key={p.key}
              points={p.points}
              fill="none"
              stroke={p.color}
              strokeWidth={p.strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: 0,
  },
});
