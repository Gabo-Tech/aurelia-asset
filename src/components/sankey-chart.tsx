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

/** Flow domain for classic (Accounts) layout — drives vertical grouping. */
export type SankeyBranch = "main" | "credit" | "shared";

export type SankeyDatum = {
  nodes: { name: string; fill: string; kind?: string; group?: string; branch?: SankeyBranch }[];
  links: { source: number; target: number; value: number; branch?: SankeyBranch }[];
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
  onReorder?: (side: "income" | "expense" | "account", orderedNames: string[]) => void;
};

const alignFns = {
  left: sankeyLeft,
  right: sankeyRight,
  center: sankeyCenter,
  justify: sankeyJustify,
};

const REORDERABLE = new Set([
  "income",
  "expense",
  "category",
  "leaf",
  "type_total",
  "saved",
  "account",
]);

function reorderSide(n: {
  kind?: string;
  group?: string;
}): "income" | "expense" | "account" | null {
  if (n.kind === "account") return "account";
  if (n.kind === "income" || n.group === "income") return "income";
  if (
    n.kind === "expense" ||
    n.kind === "type_total" ||
    n.kind === "saved" ||
    n.group === "expense" ||
    n.group === "savings" ||
    n.group === "investment"
  ) {
    return "expense";
  }
  return null;
}

function reorderSiblings(nodes: any[], dragged: any): any[] {
  if (dragged.kind === "type_total" || dragged.kind === "saved") {
    // Grouped type totals, or Accounts saved sitting with expense categories
    const typed = nodes.filter((n) => n.kind === "type_total" || n.kind === "saved");
    if (typed.length >= 2) return typed;
    return nodes.filter((n) => n.kind === "expense" || n.kind === "saved");
  }
  // Accounts: all expense categories share one column (ignore category group).
  if (dragged.kind === "expense") {
    return nodes.filter((n) => n.kind === "expense" || n.kind === "saved");
  }
  if (dragged.kind === "account") {
    return nodes.filter((n) => n.kind === "account");
  }
  // Grouped categories/leaves: keep income vs expense groups separate.
  if (dragged.kind === "category" || dragged.kind === "leaf") {
    return nodes.filter(
      (n) => n.kind === dragged.kind && (n.group ?? "") === (dragged.group ?? ""),
    );
  }
  return nodes.filter((n) => n.kind === dragged.kind);
}

const BRANCH_ORDER: Record<SankeyBranch, number> = { main: 0, shared: 1, credit: 2 };

function branchOf(node: { branch?: SankeyBranch }): SankeyBranch {
  return node.branch ?? "main";
}

/** Detect nodes in the same column whose Y ranges intersect. */
function hasColumnOverlap(nodes: { x0: number; y0: number; y1: number }[]): boolean {
  const byCol = new Map<number, { y0: number; y1: number }[]>();
  for (const n of nodes) {
    const col = Math.round(n.x0);
    const list = byCol.get(col) ?? [];
    list.push(n);
    byCol.set(col, list);
  }
  for (const colNodes of byCol.values()) {
    colNodes.sort((a, b) => a.y0 - b.y0);
    for (let i = 1; i < colNodes.length; i++) {
      if (colNodes[i].y0 < colNodes[i - 1].y1 - 0.5) return true;
    }
  }
  return false;
}

function resolveNodePadding(
  innerH: number,
  maxColNodes: number,
  explicit?: number,
  isNarrow?: boolean,
): number {
  if (explicit != null) return explicit;
  const bandShare = Math.max(0.55, Math.min(0.72, 0.76 - maxColNodes * 0.015));
  const maxPaddingTotal = innerH * (1 - bandShare);
  const gapCount = Math.max(1, maxColNodes - 1);
  const computed = maxPaddingTotal / gapCount;
  const cap = isNarrow ? 12 : 20;
  return Math.min(cap, Math.max(2, computed));
}

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
function useFixedChartHeight(wrapRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
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
  const effectiveLabelMode: LabelMode = isNarrow && labelMode === "always" ? "hover" : labelMode;

  const { incomeCount, expenseCount, incomeTotal, expenseTotal, groupTotals } = useMemo(() => {
    let iC = 0,
      eC = 0;
    let iT = 0,
      eT = 0;
    const gT: Record<string, number> = {};

    for (const n of data.nodes) {
      if (
        n.kind === "income" ||
        (n.kind === "category" && n.group === "income") ||
        (n.kind === "leaf" && n.group === "income")
      ) {
        iC++;
      }
      if (
        n.kind === "expense" ||
        (n.kind === "category" && n.group === "expense") ||
        (n.kind === "leaf" && n.group === "expense")
      ) {
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

    return {
      incomeCount: iC,
      expenseCount: eC,
      incomeTotal: iT,
      expenseTotal: eT,
      groupTotals: gT,
    };
  }, [data]);

  const nameFontSize = isNarrow ? 11 : 13;
  const amtFontSize = isNarrow ? 10 : 11;
  const labelBlockH = effectiveLabelMode !== "off" ? nameFontSize + amtFontSize + 10 : 0;

  const maxColNodes = Math.max(maxNodesInAnyColumn(data), 1);
  const hasCreditBranch = data.nodes.some((n) => n.branch === "credit");

  const marginTop = labelBlockH > 0 ? labelBlockH + 10 : 16;
  const marginBottom = isNarrow ? 12 : 16;
  const marginX = isNarrow ? 6 : 10;

  const minBandPerNode = isNarrow ? 10 : 12;
  const branchGap = hasCreditBranch ? (isNarrow ? 48 : 32) : 0;
  const autoHeight =
    Math.max(isNarrow ? 320 : 380, maxColNodes * (minBandPerNode + 8) + marginTop + marginBottom) +
    branchGap;

  // Cap to available screen height when fitToViewport is on; autoHeight is fallback only.
  const viewportHeight = fitToViewport && fixedChartHeight != null ? fixedChartHeight : 0;
  const displayHeight = height ?? (viewportHeight > 0 ? viewportHeight : autoHeight);

  const innerH = Math.max(80, displayHeight - marginTop - marginBottom);

  const isCompact = effectiveLabelMode !== "off" && maxColNodes > 6;
  const renderLabelMode: LabelMode = effectiveLabelMode;
  const compactFonts = isCompact || maxColNodes > 8;
  const renderNameFont = compactFonts ? Math.max(9, nameFontSize - 2) : nameFontSize;
  const renderAmtFont = compactFonts ? Math.max(8, amtFontSize - 2) : amtFontSize;
  const renderLabelBlockH = renderLabelMode !== "off" ? renderNameFont + renderAmtFont + 10 : 0;
  const extentY0 = renderLabelBlockH > 0 ? renderLabelBlockH + 4 : 0;

  const resolvedNodeWidth = nodeWidth ?? (isNarrow ? 14 : 20);

  const graph = useMemo(() => {
    const innerW = Math.max(100, width - marginX * 2);

    let padding = resolveNodePadding(innerH, maxColNodes, nodePadding, isNarrow);
    let result: { nodes: any[]; links: any[] } | null = null;

    const runLayout = (pad: number) => {
      const hasCredit = data.nodes.some((n) => n.branch === "credit");

      // Start from input order; for Accounts+credit, group main above credit.
      let nodes = data.nodes.map((n, i) => ({ ...n, index: i }));
      let links = data.links.map((l) => ({ ...l }));

      if (hasCredit) {
        nodes = [...nodes].sort((a, b) => {
          const d = BRANCH_ORDER[branchOf(a)] - BRANCH_ORDER[branchOf(b)];
          return d !== 0 ? d : a.index - b.index;
        });
        const indexMap = new Map(nodes.map((n, i) => [n.index, i]));
        nodes = nodes.map((n, i) => ({ ...n, index: i }));
        links = links.map((l) => ({
          ...l,
          source: indexMap.get(l.source as number) ?? l.source,
          target: indexMap.get(l.target as number) ?? l.target,
        }));
      }

      const gen = d3sankey<any, any>()
        .nodeId((d: any) => d.index)
        .nodeAlign(alignFns[align])
        .nodeWidth(resolvedNodeWidth)
        .nodePadding(pad)
        .iterations(64)
        .extent([
          [0, extentY0],
          [innerW, innerH],
        ]);

      // Pin node order to the build/input order (respects saved incomeOrder/expenseOrder).
      // linkSort stays undefined so d3 can still stack links to reduce crossings.
      // Pin vertical order to build/input order (saved income/expense/account orders).
      // Pre-sort by branch when credit-card flows exist, then lock with nodeSort(null).
      if (hasCredit) {
        gen.nodeSort(null);
        gen.linkSort((a: any, b: any) => {
          const td = BRANCH_ORDER[branchOf(a.target)] - BRANCH_ORDER[branchOf(b.target)];
          if (td !== 0) return td;
          const sd = BRANCH_ORDER[branchOf(a.source)] - BRANCH_ORDER[branchOf(b.source)];
          if (sd !== 0) return sd;
          const ty = (a.target.y0 ?? a.target.index ?? 0) - (b.target.y0 ?? b.target.index ?? 0);
          if (ty !== 0) return ty;
          return (a.source.y0 ?? a.source.index ?? 0) - (b.source.y0 ?? b.source.index ?? 0);
        });
      } else {
        gen.nodeSort(null);
      }

      try {
        return gen({ nodes, links } as any);
      } catch {
        return null;
      }
    };

    for (let attempt = 0; attempt < 6; attempt++) {
      result = runLayout(padding);
      if (!result) return null;
      if (!hasColumnOverlap(result.nodes)) break;
      padding = Math.max(2, padding * 0.65);
    }

    return result;
  }, [
    data,
    width,
    align,
    resolvedNodeWidth,
    nodePadding,
    marginX,
    innerH,
    maxColNodes,
    isNarrow,
    extentY0,
  ]);

  // Scale so the largest node band is ~50% of chart height; everything else stays proportional.
  // Applied to layout coordinates (not an SVG scale) so labels keep normal aspect ratio.
  const scaledGraph = useMemo(() => {
    if (!graph?.nodes?.length) return null;

    const nodes = graph.nodes as any[];
    const links = graph.links as any[];

    let usedTop = Infinity;
    let usedBottom = -Infinity;
    let maxBand = 0;
    for (const n of nodes) {
      usedTop = Math.min(usedTop, n.y0);
      usedBottom = Math.max(usedBottom, n.y1);
      maxBand = Math.max(maxBand, n.y1 - n.y0);
    }

    const available = Math.max(1, innerH - extentY0);
    const targetMaxBand = displayHeight * 0.5;
    const usedSpan = Math.max(0, usedBottom - usedTop);

    // Primary rule: largest node ≈ 50% of chart height.
    let scale = maxBand > 0 ? Math.min(1, targetMaxBand / maxBand) : 1;
    // Never overflow the available band space.
    if (usedSpan * scale > available && usedSpan > 0) {
      scale = available / usedSpan;
    }

    const finalSpan = usedSpan * scale;
    const pad = Math.max(0, (available - finalSpan) / 2);
    const origin = extentY0 + pad;
    const mapY = (y: number) => origin + (y - usedTop) * scale;

    const scaledNodes = nodes.map((n: any) => ({
      ...n,
      y0: mapY(n.y0),
      y1: mapY(n.y1),
    }));

    const byIndex = new Map(scaledNodes.map((n: any, i: number) => [n.index ?? i, n]));
    const scaledLinks = links.map((l: any) => {
      const sIdx = l.source?.index ?? 0;
      const tIdx = l.target?.index ?? 0;
      return {
        ...l,
        source: byIndex.get(sIdx) ?? { ...l.source, y0: mapY(l.source.y0), y1: mapY(l.source.y1) },
        target: byIndex.get(tIdx) ?? { ...l.target, y0: mapY(l.target.y0), y1: mapY(l.target.y1) },
        width: (l.width ?? 0) * scale,
        y0: l.y0 != null ? mapY(l.y0) : undefined,
        y1: l.y1 != null ? mapY(l.y1) : undefined,
      };
    });

    return { nodes: scaledNodes, links: scaledLinks };
  }, [graph, innerH, extentY0, displayHeight]);

  const [drag, setDrag] = useState<{ idx: number; dy: number; startY: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const didDragRef = useRef(false);

  const renderNodes = scaledGraph?.nodes ?? [];
  const renderLinks = scaledGraph?.links ?? [];
  const nodesRef = useRef(renderNodes);
  nodesRef.current = renderNodes;

  // Window-level listeners so touch drag keeps working when the finger leaves the node.
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const dy = e.clientY - d.startY;
      if (Math.abs(dy) > 4) didDragRef.current = true;
      setDrag({ ...d, dy });
    };
    const onUp = () => {
      const d = dragRef.current;
      const nodes = nodesRef.current;
      setDrag(null);
      if (!d || !onReorder) return;
      const dragged: any = nodes[d.idx];
      const side = dragged ? reorderSide(dragged) : null;
      if (!side || !REORDERABLE.has(dragged.kind)) return;
      const siblings = reorderSiblings(nodes, dragged);
      if (siblings.length < 2) return;
      const centerOf = (n: any) => (n === dragged ? (n.y0 + n.y1) / 2 + d.dy : (n.y0 + n.y1) / 2);
      const ordered = [...siblings].sort((a: any, b: any) => centerOf(a) - centerOf(b));
      onReorder(
        side,
        ordered.map((n: any) => n.name),
      );
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, onReorder]);

  if (!scaledGraph) return null;

  const linkPath = sankeyLinkHorizontal();
  const innerW = Math.max(100, width - marginX * 2);

  const activeLinkIdxs = new Set<number>();
  if (activeIdx != null) {
    renderLinks.forEach((l: any, i: number) => {
      if (l.source.index === activeIdx || l.target.index === activeIdx) activeLinkIdxs.add(i);
    });
  }

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>, idx: number, kind?: string) => {
    if (!onReorder || !kind || !REORDERABLE.has(kind)) return;
    e.preventDefault();
    e.stopPropagation();
    didDragRef.current = false;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore — capture optional on some browsers */
    }
    setDrag({ idx, dy: 0, startY: e.clientY });
  };

  const nameMaxLen = isNarrow ? (compactFonts ? 10 : 12) : compactFonts ? 16 : 22;

  const displayValueFor = (n: any): number => {
    // Aggregate (Total Income) must reflect incoming income, not d3's max(in, out).
    if (n.kind === "aggregate") {
      let incoming = 0;
      for (const l of renderLinks) {
        if (l.target?.index === n.index || l.target === n) incoming += l.value ?? 0;
      }
      return incoming > 0 ? incoming : incomeTotal > 0 ? incomeTotal : (n.value ?? 0);
    }
    return n.value ?? 0;
  };

  const pctFor = (n: any): number | null => {
    const val = displayValueFor(n);
    if (n.kind === "income" && incomeTotal > 0) return (val / incomeTotal) * 100;
    if (n.kind === "expense" && expenseTotal > 0) return (val / expenseTotal) * 100;
    if (n.group === "income" && incomeTotal > 0) return (val / incomeTotal) * 100;
    if (n.group === "expense" && expenseTotal > 0) return (val / expenseTotal) * 100;
    if (n.kind === "type_total" && n.group && groupTotals[n.group] > 0) {
      return (val / groupTotals[n.group]) * 100;
    }
    if (n.kind === "category" && n.group) {
      const base =
        n.group === "income"
          ? incomeTotal
          : n.group === "expense"
            ? expenseTotal
            : groupTotals[n.group];
      if (base > 0) return (val / base) * 100;
    }
    if (n.kind === "leaf" && n.group) {
      const base =
        n.group === "income"
          ? incomeTotal
          : n.group === "expense"
            ? expenseTotal
            : groupTotals[n.group];
      if (base > 0) return (val / base) * 100;
    }
    if (n.kind === "aggregate" && incomeTotal > 0) return 100;
    return null;
  };

  return (
    <div
      ref={wrapRef}
      className="w-full min-w-0"
      style={{ height: displayHeight, touchAction: drag ? "none" : undefined }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={displayHeight}
        className="block max-w-full"
        style={{ overflow: "visible", touchAction: drag ? "none" : undefined }}
        onPointerLeave={() => {
          if (!drag) setActiveIdx(null);
        }}
      >
        <g transform={`translate(${marginX},${marginTop})`}>
          <defs>
            {renderLinks.map((l: any, i: number) => (
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
            {renderLinks.map((l: any, i: number) => {
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
            {renderNodes.map((n: any, i: number) => {
              const bandH = Math.max(2, n.y1 - n.y0);
              const strokeW = bandH < 6 ? 0 : 1.5;
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
                renderLabelMode === "always" || (renderLabelMode === "hover" && isActive);
              const showPct = !isCompact && pct != null;
              const nodeAmount = displayValueFor(n);
              const amountText = showPct
                ? `${format(nodeAmount)} (${pct!.toFixed(1)}%)`
                : format(nodeAmount);
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
                  onPointerEnter={() => setActiveIdx(i)}
                  onClick={() => {
                    if (didDragRef.current) {
                      didDragRef.current = false;
                      return;
                    }
                    setActiveIdx((cur) => (cur === i ? null : i));
                  }}
                >
                  <rect
                    x={n.x0}
                    y={n.y0}
                    width={n.x1 - n.x0}
                    height={bandH}
                    fill={n.fill}
                    stroke="var(--background)"
                    strokeWidth={strokeW}
                    rx={3}
                    opacity={isDragging ? 0.85 : activeIdx != null && !isActive ? 0.55 : 1}
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
                        style={{
                          paintOrder: "stroke",
                          stroke: "var(--background)",
                          strokeWidth: 3,
                        }}
                      >
                        {displayName}
                      </text>
                      <text
                        x={labelX}
                        y={amountY}
                        textAnchor={anchor}
                        fontSize={renderAmtFont}
                        fill="var(--muted-foreground)"
                        style={{
                          paintOrder: "stroke",
                          stroke: "var(--background)",
                          strokeWidth: 3,
                        }}
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
