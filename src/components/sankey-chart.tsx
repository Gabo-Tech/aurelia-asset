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
  /**
   * Called when the user drags a node to a new position within its column.
   * Receives the node kind ("income" | "expense") and the new ordered list
   * of node names for that kind.
   */
  onReorder?: (kind: "income" | "expense", orderedNames: string[]) => void;
};

const alignFns = {
  left: sankeyLeft,
  right: sankeyRight,
  center: sankeyCenter,
  justify: sankeyJustify,
};

const REORDERABLE = new Set(["income", "expense"]);

export function SankeyChart({
  data,
  height = 380,
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

  // Adapt margins / node sizing to viewport width so labels fit on mobile.
  const isNarrow = width < 480;
  const rightMargin = isNarrow ? Math.min(70, Math.max(48, width * 0.22)) : 110;
  const leftMargin = isNarrow ? 8 : 12;
  const resolvedNodeWidth = nodeWidth ?? (isNarrow ? 12 : 18);
  const resolvedNodePadding = nodePadding ?? (isNarrow ? 12 : 18);
  const margin = { top: 12, right: rightMargin, bottom: 12, left: leftMargin };

  const graph = useMemo(() => {
    const innerW = Math.max(100, width - margin.left - margin.right);
    const innerH = Math.max(100, height - margin.top - margin.bottom);
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
  }, [data, width, height, align, resolvedNodeWidth, resolvedNodePadding, margin.left, margin.right]);

  const [drag, setDrag] = useState<{ idx: number; dy: number; startY: number } | null>(null);

  if (!graph) return null;

  const showAlways = labelMode === "always";
  const showHover = labelMode === "hover";
  const linkPath = sankeyLinkHorizontal();

  // Map CSS pixel delta to SVG-unit delta (svg may be CSS-scaled).
  const yScale = () => {
    const el = svgRef.current;
    if (!el) return 1;
    const rect = el.getBoundingClientRect();
    return rect.height === 0 ? 1 : height / rect.height;
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

  return (
    <div ref={wrapRef} className="w-full" style={{ height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="block max-w-full"
        style={{ overflow: "hidden" }}
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
                strokeOpacity={0.6}
                className="transition-[stroke-opacity] duration-150 hover:!stroke-opacity-90"

              >
                <title>{`${l.source.name} → ${l.target.name}\n${format(l.value)}`}</title>
              </path>
            ))}
          </g>

          <g>
            {graph.nodes.map((n: any, i: number) => {
              const isLeftSide = n.x0 < (width - margin.left - margin.right) / 2;
              const reorderable = !!onReorder && REORDERABLE.has(n.kind);
              const isDragging = drag?.idx === i;
              const dy = isDragging ? drag!.dy : 0;
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
                    height={Math.max(1, n.y1 - n.y0)}
                    fill={n.fill}
                    rx={2}
                    opacity={isDragging ? 0.85 : 1}
                  >
                    <title>{`${n.name}\n${format(n.value)}${reorderable ? "\n(drag to reorder)" : ""}`}</title>
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
                      <text
                        x={isLeftSide ? n.x1 + 6 : n.x0 - 6}
                        y={(n.y0 + n.y1) / 2 - 4}
                        textAnchor={isLeftSide ? "start" : "end"}
                        fontSize={isNarrow ? 10 : 12}
                        fontWeight={600}
                        fill="var(--foreground)"
                      >
                        {n.name}
                      </text>
                      <text
                        x={isLeftSide ? n.x1 + 6 : n.x0 - 6}
                        y={(n.y0 + n.y1) / 2 + 10}
                        textAnchor={isLeftSide ? "start" : "end"}
                        fontSize={isNarrow ? 9 : 11}
                        fill="var(--muted-foreground)"
                      >
                        {format(n.value)}
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
