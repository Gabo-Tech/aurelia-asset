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
  nodes: { name: string; fill: string; kind?: string }[];
  links: { source: number; target: number; value: number }[];
};

type Props = {
  data: SankeyDatum;
  height?: number;
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

export function SankeyChart({
  data,
  height,
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

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(280, e.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const isNarrow = width < 480;

  // Count nodes per side to size the chart dynamically.
  const { incomeCount, expenseCount, incomeTotal, expenseTotal } = useMemo(() => {
    let iC = 0, eC = 0, iT = 0, eT = 0;
    for (const n of data.nodes) {
      if (n.kind === "income") iC++;
      else if (n.kind === "expense") eC++;
    }
    // Compute totals from links (source-side sum for income, target-side sum for expense).
    for (const l of data.links) {
      const s = data.nodes[l.source as number];
      const t = data.nodes[l.target as number];
      if (s?.kind === "income") iT += l.value;
      if (t?.kind === "expense") eT += l.value;
    }
    return { incomeCount: iC, expenseCount: eC, incomeTotal: iT, expenseTotal: eT };
  }, [data]);

  // Dynamic height so bands stay legible as expenses grow.
  const rowHeight = isNarrow ? 46 : 58;
  const maxSide = Math.max(incomeCount, expenseCount, 1);
  const autoHeight = Math.max(isNarrow ? 320 : 380, maxSide * rowHeight + 40);
  const resolvedHeight = height ?? autoHeight;

  // Adaptive margins: measure longest label so labels never crash into amounts.
  const { leftMargin, rightMargin } = useMemo(() => {
    const nameFont = isNarrow ? 12 : 13;
    const amtFont = isNarrow ? 10 : 11;
    const approx = (s: string, px: number) => s.length * px * 0.58;
    let maxLeft = 0;
    let maxRight = 0;
    for (const n of data.nodes) {
      const name = truncate(n.name, isNarrow ? 16 : 24);
      const label = Math.max(approx(name, nameFont), approx("€999.9K (99.9%)", amtFont));
      if (n.kind === "income") maxLeft = Math.max(maxLeft, label);
      else maxRight = Math.max(maxRight, label);
    }
    return {
      leftMargin: Math.min(Math.max(16, maxLeft + 16), isNarrow ? 130 : 200),
      rightMargin: Math.min(Math.max(60, maxRight + 16), isNarrow ? 140 : 220),
    };
  }, [data, isNarrow]);

  const resolvedNodeWidth = nodeWidth ?? (isNarrow ? 14 : 20);
  const margin = { top: 16, right: rightMargin, bottom: 16, left: leftMargin };
  const innerH = Math.max(100, resolvedHeight - margin.top - margin.bottom);
  const resolvedNodePadding =
    nodePadding ?? Math.min(48, Math.max(isNarrow ? 14 : 20, innerH / (maxSide * 2.4)));

  const graph = useMemo(() => {
    const innerW = Math.max(100, width - margin.left - margin.right);
    const gen = d3sankey<any, any>()
      .nodeId((d: any) => d.index)
      .nodeAlign(alignFns[align])
      .nodeWidth(resolvedNodeWidth)
      .nodePadding(resolvedNodePadding)
      .extent([
        [0, 0],
        [innerW, innerH],
      ]);
    const nodes = data.nodes.map((n, i) => ({ ...n, index: i }));
    const links = data.links.map((l) => ({ ...l }));
    try {
      return gen({ nodes, links } as any);
    } catch {
      return null;
    }
  }, [data, width, resolvedHeight, align, resolvedNodeWidth, resolvedNodePadding, margin.left, margin.right, innerH]);

  const [drag, setDrag] = useState<{ idx: number; dy: number; startY: number } | null>(null);

  if (!graph) return null;

  const showAlways = labelMode === "always";
  const showHover = labelMode === "hover";
  const linkPath = sankeyLinkHorizontal();

  const yScale = () => {
    const el = svgRef.current;
    if (!el) return 1;
    const rect = el.getBoundingClientRect();
    return rect.height === 0 ? 1 : resolvedHeight / rect.height;
  };

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

  const nameFontSize = isNarrow ? 12 : 13;
  const amtFontSize = isNarrow ? 10 : 11;
  const nameMaxLen = isNarrow ? 16 : 24;

  const pctFor = (n: any): number | null => {
    if (n.kind === "income" && incomeTotal > 0) return (n.value / incomeTotal) * 100;
    if (n.kind === "expense" && expenseTotal > 0) return (n.value / expenseTotal) * 100;
    return null;
  };

  return (
    <div ref={wrapRef} className="w-full" style={{ height: resolvedHeight }}>
      <svg
        ref={svgRef}
        width={width}
        height={resolvedHeight}
        className="block max-w-full"
        style={{ overflow: "visible" }}
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
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

          <g fill="none" className="[mix-blend-mode:multiply] dark:[mix-blend-mode:screen]">
            {graph.links.map((l: any, i: number) => (
              <path
                key={i}
                d={linkPath(l) ?? ""}
                stroke={`url(#sk-grad-${i})`}
                strokeWidth={Math.max(1, l.width)}
                strokeOpacity={0.55}
                className="transition-[stroke-opacity] duration-150 hover:!stroke-opacity-90"
              >
                <title>{`${l.source.name} → ${l.target.name}\n${format(l.value)}`}</title>
              </path>
            ))}
          </g>

          <g>
            {graph.nodes.map((n: any, i: number) => {
              const bandH = Math.max(1, n.y1 - n.y0);
              const isLeftSide = n.kind === "income" || (n.kind !== "expense" && n.x0 < (width - margin.left - margin.right) / 2);
              const reorderable = !!onReorder && REORDERABLE.has(n.kind);
              const isDragging = drag?.idx === i;
              const dy = isDragging ? drag!.dy : 0;
              const pct = pctFor(n);
              const displayName = truncate(n.name, nameMaxLen);
              const amountText = pct != null ? `${format(n.value)} (${pct.toFixed(1)}%)` : format(n.value);
              const compact = bandH < 28;
              const cy = (n.y0 + n.y1) / 2;
              const labelX = isLeftSide ? n.x1 + 8 : n.x0 - 8;
              const anchor = isLeftSide ? "start" : "end";
              return (
                <g
                  key={i}
                  className="group"
                  transform={dy ? `translate(0, ${dy})` : undefined}
                  style={{
                    cursor: reorderable ? (isDragging ? "grabbing" : "grab") : "default",
                    touchAction: reorderable ? "none" : "auto",
                  }}
                  onPointerDown={(e) => handlePointerDown(e, i, n.kind)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <rect
                    x={n.x0}
                    y={n.y0}
                    width={n.x1 - n.x0}
                    height={bandH}
                    fill={n.fill}
                    rx={3}
                    opacity={isDragging ? 0.85 : 1}
                  >
                    <title>{`${n.name}\n${format(n.value)}${pct != null ? ` (${pct.toFixed(1)}%)` : ""}${reorderable ? "\n(drag to reorder)" : ""}`}</title>
                  </rect>
                  {(showAlways || showHover) && (
                    <g
                      className={
                        showHover
                          ? "opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                          : ""
                      }
                      style={{ pointerEvents: "none" }}
                    >
                      {compact ? (
                        <text
                          x={labelX}
                          y={cy}
                          dy="0.35em"
                          textAnchor={anchor}
                          fontSize={nameFontSize}
                          fontWeight={600}
                          fill="var(--foreground)"
                        >
                          {displayName}
                          <tspan dx={6} fontSize={amtFontSize} fontWeight={400} fill="var(--muted-foreground)">
                            {amountText}
                          </tspan>
                        </text>
                      ) : (
                        <>
                          <text
                            x={labelX}
                            y={cy - 4}
                            textAnchor={anchor}
                            fontSize={nameFontSize}
                            fontWeight={600}
                            fill="var(--foreground)"
                          >
                            {displayName}
                          </text>
                          <text
                            x={labelX}
                            y={cy + (isNarrow ? 10 : 12)}
                            textAnchor={anchor}
                            fontSize={amtFontSize}
                            fill="var(--muted-foreground)"
                          >
                            {amountText}
                          </text>
                        </>
                      )}
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
