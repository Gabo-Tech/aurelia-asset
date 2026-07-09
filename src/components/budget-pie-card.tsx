import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorSwatchPicker } from "@/components/color-swatch-picker";

export type PieSlice = {
  id: string;
  label: string;
  value: number;
  color?: string;
};

type Props = {
  title: string;
  slices: PieSlice[];
  format: (v: number) => string;
  emptyLabel?: string;
  centerLabel?: string;
  /** Palette used when a slice has no explicit color. */
  palette?: string[];
  className?: string;
  /** When provided, each legend row exposes a color picker so users can
   *  override the slice color. Called with (sliceId, color|undefined). */
  onColorChange?: (sliceId: string, color: string | undefined) => void;
};

const DEFAULT_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#a78bfa",
  "#ef4444",
  "#0ea5e9",
  "#f472b6",
  "#22c55e",
  "#eab308",
  "#8b5cf6",
];

const OTHER_THRESHOLD = 0.03;

export function BudgetPieCard({
  title,
  slices,
  format,
  emptyLabel = "Nothing to show yet",
  centerLabel,
  palette = DEFAULT_PALETTE,
  className,
}: Props) {
  const sorted = useMemo(
    () => slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value),
    [slices],
  );
  const total = useMemo(() => sorted.reduce((s, x) => s + x.value, 0), [sorted]);

  // Roll up small slices into "Other" for readability.
  const displayData = useMemo(() => {
    if (!total || sorted.length <= 6) return sorted;
    const big: PieSlice[] = [];
    let otherVal = 0;
    for (const s of sorted) {
      if (s.value / total < OTHER_THRESHOLD) otherVal += s.value;
      else big.push(s);
    }
    if (otherVal > 0) big.push({ id: "__other", label: "Other", value: otherVal });
    return big;
  }, [sorted, total]);

  const colorAt = (idx: number, explicit?: string) =>
    explicit ?? palette[idx % palette.length];

  const isEmpty = sorted.length === 0 || total === 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="mt-1 text-xs text-muted-foreground">
          {format(total)} · {sorted.length} {sorted.length === 1 ? "item" : "items"}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isEmpty ? (
          <div className="grid h-48 place-items-center text-xs text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <>
            <div className="relative h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={displayData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="88%"
                    paddingAngle={1}
                    stroke="var(--background)"
                    strokeWidth={2}
                  >
                    {displayData.map((d, i) => (
                      <Cell key={d.id} fill={colorAt(i, d.color)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      `${format(v)} (${((v / (total || 1)) * 100).toFixed(1)}%)`,
                      name,
                    ]}
                    allowEscapeViewBox={{ x: true, y: true }}
                    wrapperStyle={{ zIndex: 50, pointerEvents: "none", outline: "none" }}
                    contentStyle={{
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      padding: "6px 10px",
                    }}
                    itemStyle={{ color: "var(--popover-foreground)" }}
                    labelStyle={{ color: "var(--popover-foreground)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {centerLabel ? (
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {centerLabel}
                    </div>
                    <div className="text-sm font-semibold tabular-nums">{format(total)}</div>
                  </div>
                </div>
              ) : null}
            </div>
            <ul className="mt-3 space-y-1 text-xs">
              {displayData.map((d, i) => {
                const pct = ((d.value / (total || 1)) * 100).toFixed(1);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-2 px-1 py-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: colorAt(i, d.color) }}
                      />
                      <span className="truncate">{d.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {format(d.value)} · {pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
