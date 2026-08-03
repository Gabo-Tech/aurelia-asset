import React, { useMemo } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { G, Path, Rect, Text as SvgText } from "react-native-svg";
import {
  sankey as d3sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
  type SankeyGraph,
  type SankeyNode,
  type SankeyLink,
} from "d3-sankey";
import type { SankeyDatum } from "@/lib/sankey-build";
import { colors } from "@/theme/colors";
import { ChartFrame } from "@/components/ChartFrame";

type Props = {
  data: SankeyDatum;
  height?: number;
  format?: (v: number) => string;
  title?: string;
};

type SNode = SankeyNode<{ name: string; fill: string; kind?: string }, { value: number }> & {
  name: string;
  fill: string;
  kind?: string;
};
type SLink = SankeyLink<SNode, { value: number; branch?: string }>;

function truncate(str: string, max: number) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

export function SankeyChart({ data, height = 320, format, title }: Props) {
  const { width: winW } = useWindowDimensions();
  const width = Math.max(320, winW - 48);

  const layout = useMemo(() => {
    if (!data.nodes.length || !data.links.length) return null;
    const nodes: SNode[] = data.nodes.map((n) => ({
      ...n,
    })) as SNode[];
    const links: SLink[] = data.links.map((l) => ({
      source: l.source,
      target: l.target,
      value: Math.max(0.0001, l.value),
      branch: l.branch,
    })) as SLink[];

    const sankeyGen = d3sankey<SNode, SLink>()
      .nodeWidth(14)
      .nodePadding(10)
      .extent([
        [8, 8],
        [width - 8, height - 8],
      ])
      .nodeAlign(sankeyJustify);

    // Index-based links: ensure nodes keep stable array identity for d3-sankey.
    try {
      return sankeyGen({
        nodes: nodes.map((d) => ({ ...d })),
        links: links.map((d) => ({ ...d })),
      }) as SankeyGraph<SNode, SLink>;
    } catch {
      return null;
    }
  }, [data, width, height]);

  if (!layout) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Not enough cashflow data for a Sankey diagram.</Text>
      </View>
    );
  }

  const linkPath = sankeyLinkHorizontal();
  const fmt = format ?? ((v: number) => v.toFixed(0));

  return (
    <ChartFrame filename="cashflow-sankey" title={title ?? "Cashflow Sankey"}>
      <Svg width={width} height={height}>
        <G>
          {layout.links.map((link, i) => {
            const path = linkPath(link as never);
            if (!path) return null;
            const src = link.source as SNode;
            const stroke = src.fill || colors.accent;
            const opacity = 0.35;
            return (
              <Path
                key={`l-${i}`}
                d={path}
                stroke={stroke}
                strokeWidth={Math.max(1, link.width ?? 1)}
                fill="none"
                strokeOpacity={opacity}
              />
            );
          })}
          {layout.nodes.map((node, i) => {
            const x0 = node.x0 ?? 0;
            const x1 = node.x1 ?? 0;
            const y0 = node.y0 ?? 0;
            const y1 = node.y1 ?? 0;
            const labelX = x0 < width / 2 ? x1 + 6 : x0 - 6;
            const anchor = x0 < width / 2 ? "start" : "end";
            const h = Math.max(1, y1 - y0);
            return (
              <G key={`n-${i}`}>
                <Rect
                  x={x0}
                  y={y0}
                  width={Math.max(1, x1 - x0)}
                  height={h}
                  fill={node.fill || colors.accent}
                  rx={2}
                />
                <SvgText
                  x={labelX}
                  y={(y0 + y1) / 2}
                  fill={colors.text}
                  fontSize={10}
                  fontWeight="600"
                  alignmentBaseline="middle"
                  textAnchor={anchor}
                >
                  {truncate(node.name, 18)}
                </SvgText>
                {h > 14 ? (
                  <SvgText
                    x={labelX}
                    y={(y0 + y1) / 2 + 12}
                    fill={colors.muted}
                    fontSize={9}
                    alignmentBaseline="middle"
                    textAnchor={anchor}
                  >
                    {fmt(node.value ?? 0)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </G>
      </Svg>
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  empty: {
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { color: colors.muted, fontSize: 13 },
});
