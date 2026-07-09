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
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

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

  const { incomeCount, expenseCount, incomeTotal, expenseTotal } = useMemo(() => {
    let iC = 0, eC = 0, iT = 0, eT = 0;
    for (const n of data.nodes) {
      if (n.kind === "income") iC++;
      else if (n.kind === "expense") eC++;
    }
    for (const l of data.links) {
      const s = data.nodes[l.source as number];
      const t = data.nodes[l.target as number];
      if (s?.kind === "income") iT += l.value;
      if (t?.kind === "expense") eT += l.value;
    }
    return { incomeCount: iC, expenseCount: eC, incomeTotal: iT, expenseTotal: eT };
  }, [data]);

  const rowHeight = isNarrow ? 68 : 78;
  const maxSide = Math.max(incomeCount, expenseCount, 1);
  const marginTop = isNarrow ? 40 : 48;
  const marginBottom = isNarrow ? 24 : 28;
  const marginX = isNarrow ? 6 : 10;
  const autoHeight = Math.max(
    isNarrow ? 380 : 460,
    maxSide * rowHeight + marginTop + marginBottom,
  );
  const resolvedHeight = height ?? autoHeight;

  const resolvedNodeWidth = nodeWidth ?? (isNarrow ? 14 : 20);
  const innerH = Math.max(100, resolvedHeight - marginTop - marginBottom);
  const resolvedNodePadding =
    nodePadding ?? Math.max(isNarrow ? 28 : 36, innerH / (maxSide * 2.2));

  const graph = useMemo(() => {
    const innerW = Math.max(100, width - marginX * 2);
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
  }, [data, width, resolvedHeight, align, resolvedNodeWidth, resolvedNodePadding, marginX, innerH]);

  const [drag, setDrag] = useState<{ idx: number; dy: number; startY: number } | null>(null);

  if (!graph) return null;

  const linkPath = sankeyLinkHorizontal();
  const innerW = Math.max(100, width - marginX * 2);

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

  const nameFontSize = isNarrow ? 11 : 13;
  const amtFontSize = isNarrow ? 10 : 11;
  const nameMaxLen = isNarrow ? 12 : 22;

  const pctFor = (n: any): number | null => {
    if (n.kind === "income" && incomeTotal > 0) return (n.value / incomeTotal) * 100;
    if (n.kind === "expense" && expenseTotal > 0) return (n.value / expenseTotal) * 100;
    return null;
  };

  const edgePad = 4;

  return (
    <div ref={wrapRef} className="w-full min-w-0" style={{ height: resolvedHeight }}>
      <svg
        ref={svgRef}
        width={width}
        height={resolvedHeight}
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

          <g fill="none" className="[mix-blend-mode:multiply] dark:[mix-blend-mode:screen]">
            {graph.links.map((l: any, i: number) => (
              <path
                key={i}
                d={linkPath(l) ?? ""}
                stroke={`url(#sk-grad-${i})`}
                strokeWidth={Math.max(1, Math.min(l.width, 60))}
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
              const reorderable = !!onReorder && REORDERABLE.has(n.kind);
              const isDragging = drag?.idx === i;
              const dy = isDragging ? drag!.dy : 0;
              const pct = pctFor(n);
              const displayName = truncate(n.name, nameMaxLen);
              const amountText = pct != null ? `${format(n.value)} (${pct.toFixed(1)}%)` : format(n.value);

              // Label positioning: centered on node, above the rect.
              const nodeCx = (n.x0 + n.x1) / 2;
              let labelX = nodeCx;
              let anchor: "start" | "middle" | "end" = "middle";
              if (nodeCx < 60) {
                labelX = n.x0;
                anchor = "start";
              } else if (nodeCx > innerW - 60) {
                labelX = n.x1;
                anchor = "end";
              }
              const labelY = Math.max(edgePad + nameFontSize, n.y0 - 8);

              const isActive = activeIdx === i;
              const showLabel =
                effectiveLabelMode === "always" ||
                (effectiveLabelMode === "hover" && isActive);

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
                    rx={3}
                    opacity={isDragging ? 0.85 : 1}
                  >
                    <title>{`${n.name}\n${amountText}${reorderable ? "\n(drag to reorder)" : ""}`}</title>
                  </rect>
                  {effectiveLabelMode !== "off" && (
                    <g
                      style={{
                        pointerEvents: "none",
                        opacity: showLabel ? 1 : 0,
                        transition: "opacity 150ms",
                      }}
                    >
                      <text
                        x={labelX}
                        y={labelY - amtFontSize - 2}
                        textAnchor={anchor}
                        fontSize={nameFontSize}
                        fontWeight={600}
                        fill="var(--foreground)"
                        style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3 }}
                      >
                        {displayName}
                      </text>
                      <text
                        x={labelX}
                        y={labelY}
                        textAnchor={anchor}
                        fontSize={amtFontSize}
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
