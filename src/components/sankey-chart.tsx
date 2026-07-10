import { useEffect, useMemo, useRef, useState } from "react";
import {
  sankey as d3sankey,
  sankeyLinkHorizontal,
  sankeyLeft,
  sankeyRight,
  sankeyCenter,
  sankeyJustify,
} from "d3-sankey";

export type LabelMode = "always" | "hover" | "off";

export type SankeyDatum = {
  nodes: { name: string; fill: string; kind?: string; group?: string }[];
  links: { source: number; target: number; value: number }[];
};

type Props = {
  data: SankeyDatum;
  height?: number;
  /** When true (default), cap height to the viewport and scale the graph vertically. */
  fitToViewport?: boolean;
  labelMode?: LabelMode;
  format?: (v: number) => string;
  align?: "left" | "right" | "center" | "justify";
  nodeWidth?: number;
  nodePadding?: number;
  onReorder?: (kind: "income" | "expense", orderedNames: string[]) => void;
};

const alignFns = {
  left: sankeyLeft,
  right: sankeyRight,
  center: sankeyCenter,
  justify: sankeyJustify,
};

const REORDERABLE = new Set(["income", "expense"]);

function truncate(str: string, max: number) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

/** Max nodes stacked in any single Sankey column (drives vertical spacing). */
function maxNodesInAnyColumn(data: SankeyDatum): number {
  const n = data.nodes.length;
  if (n === 0) return 1;

  const incoming = new Array(n).fill(0);
  const adj: number[][] = Array.from({ length: n }, () => []);

  for (const l of data.links) {
    adj[l.source]?.push(l.target);
    incoming[l.target]++;
  }

  const depth = new Array(n).fill(0);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (incoming[i] === 0) queue.push(i);
  }

  while (queue.length) {
    const u = queue.shift()!;
    for (const v of adj[u] ?? []) {
      depth[v] = Math.max(depth[v], depth[u] + 1);
      incoming[v]--;
      if (incoming[v] === 0) queue.push(v);
    }
  }

  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    counts.set(depth[i], (counts.get(depth[i]) ?? 0) + 1);
  }
  return Math.max(1, ...counts.values());
}

/** Fixed chart height from viewport (resize only — never changes while scrolling). */
function useFixedChartHeight(
  wrapRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const [maxH, setMaxH] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMaxH(null);
      return;
    }

    const measure = () => {
      const el = wrapRef.current;
      const constrained = el?.closest(".chart-viewport") as HTMLElement | null;
      if (constrained && constrained.clientHeight > 120) {
        setMaxH(constrained.clientHeight);
        return;
      }

      const vh = window.innerHeight;
      const mobile = window.innerWidth < 1024;
      setMaxH(Math.round(vh * (mobile ? 0.42 : 0.48)));
    };

    measure();
    window.addEventListener("resize", measure);

    const ro = new ResizeObserver(measure);
    let raf = 0;
    const attach = () => {
      const el = wrapRef.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      const constrained = el.closest(".chart-viewport");
      if (constrained) ro.observe(constrained);
      measure();
    };
    attach();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [wrapRef, enabled]);

  return maxH;
}

export function SankeyChart({
  data,
  height,
  fitToViewport = true,
  labelMode = "always",
  format = (v) => v.toLocaleString(),
  align = "justify",
  nodeWidth,
  nodePadding,
  onReorder,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const fixedChartHeight = useFixedChartHeight(wrapRef, fitToViewport && !height);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(280, e.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const isNarrow = width < 640;

  // Effective label mode: on narrow screens default to hover unless the user
  // explicitly forced "always" or "off".
  const effectiveLabelMode: LabelMode =
    isNarrow && labelMode === "always" ? "hover" : labelMode;

  const { incomeCount, expenseCount, incomeTotal, expenseTotal, groupTotals } = useMemo(() => {
    let iC = 0, eC = 0;
    let iT = 0, eT = 0;
    const gT: Record<string, number> = {};

    for (const n of data.nodes) {
      if (n.kind === "income" || (n.kind === "category" && n.group === "income") || (n.kind === "leaf" && n.group === "income")) {
        iC++;
      }
      if (n.kind === "expense" || (n.kind === "category" && n.group === "expense") || (n.kind === "leaf" && n.group === "expense")) {
        eC++;
      }
    }

    for (const l of data.links) {
      const s = data.nodes[l.source as number];
      const t = data.nodes[l.target as number];
      if (t?.kind === "aggregate") iT += l.value;
      if (s?.kind === "income") iT += l.value;
      if (t?.kind === "expense") eT += l.value;
      if (t?.kind === "type_total" && t.group) {
        gT[t.group] = (gT[t.group] ?? 0) + l.value;
        if (t.group === "expense") eT += l.value;
      }
    }

    if (iT === 0) {
      for (const n of data.nodes) {
        if (n.kind === "aggregate") iT = Math.max(iT, (n as { value?: number }).value ?? 0);
      }
    }

    return { incomeCount: iC, expenseCount: eC, incomeTotal: iT, expenseTotal: eT, groupTotals: gT };
  }, [data]);

  const nameFontSize = isNarrow ? 11 : 13;
  const amtFontSize = isNarrow ? 10 : 11;
  const labelBlockH =
    effectiveLabelMode !== "off" ? nameFontSize + amtFontSize + 10 : 0;

  const leafCount = data.nodes.filter(
    (n) => n.kind === "leaf" || n.kind === "income" || n.kind === "expense" || n.kind === "category",
  ).length;
  const maxColNodes = Math.max(maxNodesInAnyColumn(data), 1);

  const marginTop = labelBlockH > 0 ? labelBlockH + 10 : 16;
  const marginBottom = isNarrow ? 12 : 16;
  const marginX = isNarrow ? 6 : 10;

  const layoutHeight =
    fitToViewport && fixedChartHeight != null ? fixedChartHeight : (height ?? 0);
  const autoHeight = Math.max(
    isNarrow ? 320 : 380,
    maxColNodes * (labelBlockH + 24) + marginTop + marginBottom,
  );
  const idealHeight = height ?? (layoutHeight > 0 ? layoutHeight : autoHeight);
  const displayHeight = layoutHeight > 0 ? layoutHeight : idealHeight;

  const innerH = Math.max(80, displayHeight - marginTop - marginBottom);

  const isCompact =
    effectiveLabelMode !== "off" &&
    maxColNodes > 6;
  const renderLabelMode: LabelMode = effectiveLabelMode;
  const compactFonts = isCompact || maxColNodes > 8;
  const renderNameFont = compactFonts ? Math.max(9, nameFontSize - 2) : nameFontSize;
  const renderAmtFont = compactFonts ? Math.max(8, amtFontSize - 2) : amtFontSize;
  const renderLabelBlockH = renderLabelMode !== "off" ? renderNameFont + renderAmtFont + 10 : 0;
  const labelGapAbove = renderLabelBlockH > 0 ? renderLabelBlockH + 6 : 14;

  // Reserve ~60–70% of height for flow bands; cap padding so links/nodes stay visible.
  const bandShare = Math.max(0.55, Math.min(0.72, 0.76 - maxColNodes * 0.015));
  const maxPaddingTotal = innerH * (1 - bandShare);
  const gapCount = Math.max(1, maxColNodes - 1);
  const computedPadding = maxPaddingTotal / gapCount;
  const resolvedNodePadding =
    nodePadding ??
    Math.max(labelGapAbove, computedPadding);

  const resolvedNodeWidth = nodeWidth ?? (isNarrow ? 14 : 20);

  const graph = useMemo(() => {
    const innerW = Math.max(100, width - marginX * 2);
    const gen = d3sankey<any, any>()
      .nodeId((d: any) => d.index)
      .nodeAlign(alignFns[align])
      .nodeWidth(resolvedNodeWidth)
      .nodePadding(resolvedNodePadding)
      .linkSort((a: any, b: any) => (a.value ?? 0) - (b.value ?? 0))
      .iterations(64)
      .extent([
        [0, renderLabelBlockH > 0 ? renderLabelBlockH + 4 : 0],
        [innerW, innerH],
      ]);
    const nodes = data.nodes.map((n, i) => ({ ...n, index: i }));
    const links = data.links.map((l) => ({ ...l }));
    try {
      return gen({ nodes, links } as any);
    } catch {
      return null;
    }
  }, [data, width, displayHeight, align, resolvedNodeWidth, resolvedNodePadding, marginX, innerH, renderLabelBlockH]);

  const [drag, setDrag] = useState<{ idx: number; dy: number; startY: number } | null>(null);

  if (!graph) return null;

  const linkPath = sankeyLinkHorizontal();
  const innerW = Math.max(100, width - marginX * 2);

  const yScale = () => 1;

  const activeLinkIdxs = new Set<number>();
  if (activeIdx != null) {
    graph.links.forEach((l: any, i: number) => {
      if (l.source.index === activeIdx || l.target.index === activeIdx) activeLinkIdxs.add(i);
    });
  }

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>, idx: number, kind?: string) => {
    if (!onReorder || !kind || !REORDERABLE.has(kind)) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ idx, dy: 0, startY: e.clientY });
  };
  const handlePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!drag) return;
    setDrag({ ...drag, dy: (e.clientY - drag.startY) * yScale() });
  };
  const handlePointerUp = () => {
    if (!drag || !onReorder) {
      setDrag(null);
      return;
    }
    const dragged: any = graph.nodes[drag.idx];
    const kind = dragged?.kind;
    if (!kind || !REORDERABLE.has(kind)) {
      setDrag(null);
      return;
    }
    const siblings = (graph.nodes as any[]).filter((n) => n.kind === kind);
    const centerOf = (n: any) =>
      n === dragged ? (n.y0 + n.y1) / 2 + drag.dy : (n.y0 + n.y1) / 2;
    const ordered = [...siblings].sort((a, b) => centerOf(a) - centerOf(b));
    onReorder(kind as "income" | "expense", ordered.map((n) => n.name));
    setDrag(null);
  };

  const nameMaxLen = isNarrow ? (compactFonts ? 10 : 12) : (compactFonts ? 16 : 22);

  const pctFor = (n: any): number | null => {
    if (n.kind === "income" && incomeTotal > 0) return (n.value / incomeTotal) * 100;
    if (n.kind === "expense" && expenseTotal > 0) return (n.value / expenseTotal) * 100;
    if (n.group === "income" && incomeTotal > 0) return (n.value / incomeTotal) * 100;
    if (n.group === "expense" && expenseTotal > 0) return (n.value / expenseTotal) * 100;
    if (n.kind === "type_total" && n.group && groupTotals[n.group] > 0) {
      return (n.value / groupTotals[n.group]) * 100;
    }
    if (n.kind === "category" && n.group) {
      const base =
        n.group === "income"
          ? incomeTotal
          : n.group === "expense"
            ? expenseTotal
            : groupTotals[n.group];
      if (base > 0) return (n.value / base) * 100;
    }
    if (n.kind === "leaf" && n.group) {
      const base =
        n.group === "income"
          ? incomeTotal
          : n.group === "expense"
            ? expenseTotal
            : groupTotals[n.group];
      if (base > 0) return (n.value / base) * 100;
    }
    if (n.kind === "aggregate" && incomeTotal > 0) return 100;
    return null;
  };

  return (
    <div ref={wrapRef} className="w-full min-w-0" style={{ height: displayHeight }}>
      <svg
        ref={svgRef}
        width={width}
        height={displayHeight}
        className="block max-w-full"
        style={{ overflow: "visible" }}
        onPointerLeave={() => setActiveIdx(null)}
      >
        <g transform={`translate(${marginX},${marginTop})`}>
          <defs>
            {graph.links.map((l: any, i: number) => (
              <linearGradient
                key={i}
                id={`sk-grad-${i}`}
                gradientUnits="userSpaceOnUse"
                x1={l.source.x1}
                x2={l.target.x0}
              >
                <stop offset="0%" stopColor={l.source.fill} />
                <stop offset="100%" stopColor={l.target.fill} />
              </linearGradient>
            ))}
          </defs>

          <g fill="none">
            {graph.links.map((l: any, i: number) => {
              const lit = activeIdx == null || activeLinkIdxs.has(i);
              return (
              <path
                key={i}
                d={linkPath(l) ?? ""}
                stroke={`url(#sk-grad-${i})`}
                strokeWidth={Math.max(1.5, l.width)}
                strokeOpacity={lit ? 0.5 : 0.12}
                strokeLinecap="butt"
                className="transition-[stroke-opacity] duration-150"
              >
                <title>{`${l.source.name} → ${l.target.name}\n${format(l.value)}`}</title>
              </path>
              );
            })}
          </g>

          <g>
            {graph.nodes.map((n: any, i: number) => {
              const bandH = Math.max(2, n.y1 - n.y0);
              const reorderable = !!onReorder && REORDERABLE.has(n.kind);
              const isDragging = drag?.idx === i;
              const dy = isDragging ? drag!.dy : 0;
              const pct = pctFor(n);
              const displayName = truncate(n.name, nameMaxLen);

              // Label alignment: left-anchored at each node's own x0, so labels
              // in the same column line up regardless of node kind. Right-most
              // column flips to end-anchored to avoid clipping the SVG edge.
              const nodeCx = (n.x0 + n.x1) / 2;
              let labelX = n.x0;
              let anchor: "start" | "middle" | "end" = "start";
              if (nodeCx > innerW - 80) {
                labelX = n.x1;
                anchor = "end";
              }
              const isActive = activeIdx === i;
              const showLabel =
                renderLabelMode === "always" ||
                (renderLabelMode === "hover" && isActive);
              const showPct = !isCompact && pct != null;
              const amountText = showPct
                ? `${format(n.value)} (${pct!.toFixed(1)}%)`
                : format(n.value);
              const amountY = n.y0 - 6;
              const nameY = amountY - renderAmtFont - 3;

              return (
                <g
                  key={i}
                  className="group"
                  transform={dy ? `translate(0, ${dy})` : undefined}
                  style={{
                    cursor: reorderable ? (isDragging ? "grabbing" : "grab") : "pointer",
                    touchAction: reorderable ? "none" : "auto",
                  }}
                  onPointerDown={(e) => handlePointerDown(e, i, n.kind)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onPointerEnter={() => setActiveIdx(i)}
                  onClick={() =>
                    setActiveIdx((cur) => (cur === i ? null : i))
                  }
                >
                  <rect
                    x={n.x0}
                    y={n.y0}
                    width={n.x1 - n.x0}
                    height={bandH}
                    fill={n.fill}
                    stroke="var(--background)"
                    strokeWidth={2}
                    rx={3}
                    opacity={
                      isDragging ? 0.85 : activeIdx != null && !isActive ? 0.55 : 1
                    }
                  >
                    <title>{`${n.name}\n${amountText}${reorderable ? "\n(drag to reorder)" : ""}`}</title>
                  </rect>
                  {renderLabelMode !== "off" && (
                    <g
                      style={{
                        pointerEvents: "none",
                        opacity: showLabel ? 1 : 0,
                        transition: "opacity 150ms",
                      }}
                    >
                      <text
                        x={labelX}
                        y={nameY}
                        textAnchor={anchor}
                        fontSize={renderNameFont}
                        fontWeight={600}
                        fill="var(--foreground)"
                        style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3 }}
                      >
                        {displayName}
                      </text>
                      <text
                        x={labelX}
                        y={amountY}
                        textAnchor={anchor}
                        fontSize={renderAmtFont}
                        fill="var(--muted-foreground)"
                        style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3 }}
                      >
                        {amountText}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
