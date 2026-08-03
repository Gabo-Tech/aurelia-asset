import type { CSSProperties } from "react";

/** Theme-aware chart colors — prefer CSS variables so light/dark stay in sync. */

export const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#8c6a4a",
  "#5a6b7a",
  "#a67c52",
  "#6b8f71",
  "#9a7b4f",
] as const;

/** Hex fallbacks for SVG/canvas contexts that can't resolve CSS vars (e.g. D3 Sankey export). */
export const CHART_PALETTE_HEX_LIGHT = [
  "#4a5243",
  "#b7893a",
  "#8c6a4a",
  "#3e5871",
  "#8c2e22",
  "#5a6b7a",
  "#a67c52",
  "#6b8f71",
  "#9a7b4f",
  "#71717a",
] as const;

export const CHART_PALETTE_HEX_DARK = [
  "#c5a880",
  "#8fa98a",
  "#8fa1b8",
  "#b48a6b",
  "#b4534a",
  "#a1a1aa",
  "#d4b896",
  "#7a9a8a",
  "#9aabbc",
  "#c4a484",
] as const;

export function chartPaletteHex(isDark: boolean): readonly string[] {
  return isDark ? CHART_PALETTE_HEX_DARK : CHART_PALETTE_HEX_LIGHT;
}

export const CHART_SUCCESS = "var(--success)";
export const CHART_DESTRUCTIVE = "var(--destructive)";
export const CHART_MUTED = "var(--muted-foreground)";
export const CHART_BORDER = "var(--border)";
export const CHART_FOREGROUND = "var(--foreground)";

/** Resolved hex for success/destructive in SVG when CSS vars are unreliable. */
export const CHART_SUCCESS_HEX = { light: "#3d6b4f", dark: "#8fa98a" } as const;
export const CHART_DESTRUCTIVE_HEX = { light: "#8c2e22", dark: "#b4534a" } as const;
export const CHART_AXIS_HEX = { light: "#a1a1aa", dark: "#71717a" } as const;

export function getChartAxisStroke(): string {
  return "var(--muted-foreground)";
}

export function getChartGridStroke(): string {
  return "var(--border)";
}

export function getChartTooltipStyle(): CSSProperties {
  return {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--popover-foreground)",
    fontSize: 12,
    boxShadow: "var(--shadow-md-value)",
  };
}

export function chartColorAt(index: number, explicit?: string): string {
  if (explicit) return explicit;
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
