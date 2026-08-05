import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
} from "react-native";
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
import { colors, spacing } from "@/theme/colors";
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

function isTotalNode(n: SNode) {
  const k = (n.kind || "").toLowerCase();
  const name = (n.name || "").toLowerCase();
  return (
    k.includes("total") ||
    name.includes("total income") ||
    name.includes("total expense")
  );
}

function buildLayout(data: SankeyDatum, width: number, height: number) {
  if (!data.nodes.length || !data.links.length) return null;
  const nodes: SNode[] = data.nodes.map((n) => ({ ...n })) as SNode[];
  const links: SLink[] = data.links.map((l) => ({
    source: l.source,
    target: l.target,
    value: Math.max(0.0001, l.value),
    branch: l.branch,
  })) as SLink[];

  const padTop = 36;
  const sankeyGen = d3sankey<SNode, SLink>()
    .nodeWidth(12)
    .nodePadding(Math.max(12, Math.min(20, Math.floor(height / Math.max(8, nodes.length)))))
    .extent([
      [10, padTop],
      [width - 10, height - 10],
    ])
    .nodeAlign(sankeyJustify);

  let graph: SankeyGraph<SNode, SLink>;
  try {
    graph = sankeyGen({
      nodes: nodes.map((d) => ({ ...d })),
      links: links.map((d) => ({ ...d })),
    }) as SankeyGraph<SNode, SLink>;
  } catch {
    return null;
  }

  const totals = graph.nodes.filter(isTotalNode).sort((a, b) => (a.x0 ?? 0) - (b.x0 ?? 0));
  if (totals.length >= 2) {
    const left = totals[0]!;
    const right = totals[1]!;
    // Keep Total income / Total expenses close but leave room for labels.
    const gap = 28;
    const current = (right.x0 ?? 0) - (left.x1 ?? 0);
    if (Math.abs(current - gap) > 2) {
      const shift = (current - gap) / 2;
      left.x0 = (left.x0 ?? 0) + shift;
      left.x1 = (left.x1 ?? 0) + shift;
      right.x0 = (right.x0 ?? 0) - shift;
      right.x1 = (right.x1 ?? 0) - shift;
      sankeyGen.update(graph);
    }
  }

  return graph;
}

function SankeySvg({
  layout,
  width,
  height,
  fmt,
}: {
  layout: SankeyGraph<SNode, SLink>;
  width: number;
  height: number;
  fmt: (v: number) => string;
}) {
  const linkPath = sankeyLinkHorizontal();
  return (
    <Svg width={width} height={height}>
      <G>
        {layout.links.map((link, i) => {
          const path = linkPath(link as never);
          if (!path) return null;
          const src = link.source as SNode;
          return (
            <Path
              key={`l-${i}`}
              d={path}
              stroke={src.fill || colors.accent}
              strokeWidth={Math.max(1, link.width ?? 1)}
              fill="none"
              strokeOpacity={0.35}
            />
          );
        })}
        {layout.nodes.map((node, i) => {
          const x0 = node.x0 ?? 0;
          const x1 = node.x1 ?? 0;
          const y0 = node.y0 ?? 0;
          const y1 = node.y1 ?? 0;
          const midX = (x0 + x1) / 2;
          const h = Math.max(1, y1 - y0);
          const labelAbove = y0 - 6;
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
                x={midX}
                y={Math.max(12, labelAbove)}
                fill={colors.text}
                fontSize={10}
                fontWeight="700"
                textAnchor="middle"
              >
                {truncate(node.name, 16)}
              </SvgText>
              <SvgText
                x={midX}
                y={Math.max(22, labelAbove + 11)}
                fill={colors.muted}
                fontSize={9}
                textAnchor="middle"
              >
                {fmt(node.value ?? 0)}
              </SvgText>
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

export function SankeyChart({ data, height = 320, format, title }: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const width = Math.max(320, winW - 48);
  const chartH = Math.max(280, Math.min(420, 40 + data.nodes.length * 18));
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const fmt = format ?? ((v: number) => v.toFixed(0));

  const layout = useMemo(
    () => buildLayout(data, width, height ?? chartH),
    [data, width, height, chartH],
  );

  const fullW = Math.max(320, (winW - 24) * zoom);
  const fullH = Math.max(400, (winH - 140) * zoom);
  const fullLayout = useMemo(
    () => (fullscreen ? buildLayout(data, fullW, fullH) : null),
    [fullscreen, data, fullW, fullH],
  );

  if (!layout) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Not enough cashflow data for a Sankey diagram.</Text>
      </View>
    );
  }

  return (
    <>
      <ChartFrame filename="cashflow-sankey" title={title ?? "Cashflow Sankey"}>
        <Pressable onPress={() => setFullscreen(true)} style={styles.expandBtn}>
          <Text style={styles.expandText}>Expand · zoom</Text>
        </Pressable>
        <SankeySvg layout={layout} width={width} height={height ?? chartH} fmt={fmt} />
      </ChartFrame>

      <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title ?? "Cashflow Sankey"}</Text>
            <Pressable onPress={() => setFullscreen(false)}>
              <Text style={styles.expandText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.zoomBar}>
            <Pressable
              onPress={() => setZoom((z) => Math.min(3, z + 0.25))}
              style={styles.zoomBtn}
            >
              <Text style={styles.zoomBtnText}>+</Text>
            </Pressable>
            <Pressable
              onPress={() => setZoom((z) => Math.max(0.75, z - 0.25))}
              style={styles.zoomBtn}
            >
              <Text style={styles.zoomBtnText}>−</Text>
            </Pressable>
            <Pressable onPress={() => setZoom(1)} style={styles.zoomBtn}>
              <Text style={styles.zoomBtnText}>Reset</Text>
            </Pressable>
            <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
          </View>
          <ScrollView
            horizontal
            maximumZoomScale={3}
            minimumZoomScale={0.75}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <ScrollView>
              {fullLayout ? (
                <SankeySvg layout={fullLayout} width={fullW} height={fullH} fmt={fmt} />
              ) : null}
            </ScrollView>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
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
  expandBtn: { alignSelf: "flex-end", marginBottom: spacing.sm },
  expandText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  modal: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 12 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  modalTitle: { color: colors.text, fontWeight: "700", fontSize: 16 },
  zoomBar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  zoomBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  zoomBtnText: { color: colors.accent, fontWeight: "700", fontSize: 14 },
  zoomLabel: { color: colors.muted, fontSize: 12, marginLeft: 4 },
});
