import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export type PieEntry = {
  id: string;
  label: string;
  category: string;
  amount: number;
  color?: string;
};

type Props = {
  title: string;
  entries: PieEntry[];
  format: (v: number) => string;
  emptyLabel?: string;
  /** Palette used when a category has no explicit color. */
  palette?: string[];
};

const DEFAULT_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const OTHER_THRESHOLD = 0.03;

export function CategoryPieCard({
  title,
  entries,
  format,
  emptyLabel,
  palette = DEFAULT_PALETTE,
}: Props) {
  const { t } = useTranslation();
  const [drill, setDrill] = useState<string | null>(null);

  // Aggregate by category (top-level view)
  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color?: string }>();
    for (const e of entries) {
      const key =
        e.category || t("cashflow.breakdown.uncategorized", { defaultValue: "Uncategorized" });
      const cur = map.get(key);
      if (cur) cur.value += e.amount;
      else map.set(key, { name: key, value: e.amount, color: e.color });
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [entries, t]);

  const total = useMemo(() => byCategory.reduce((s, x) => s + x.value, 0), [byCategory]);

  const drillData = useMemo(() => {
    if (!drill) return [];
    return entries
      .filter(
        (e) =>
          (e.category ||
            t("cashflow.breakdown.uncategorized", { defaultValue: "Uncategorized" })) === drill,
      )
      .map((e) => ({
        name: e.label || t("cashflow.unnamed", { defaultValue: "(unnamed)" }),
        value: e.amount,
        color: e.color,
      }))
      .sort((a, b) => b.value - a.value);
  }, [drill, entries, t]);

  // Roll up small slices into "Other" for readability
  const displayData = useMemo(() => {
    const source = drill ? drillData : byCategory;
    const sum = source.reduce((s, x) => s + x.value, 0);
    if (!sum || source.length <= 6) return source;
    const big: typeof source = [];
    let otherVal = 0;
    for (const s of source) {
      if (s.value / sum < OTHER_THRESHOLD) otherVal += s.value;
      else big.push(s);
    }
    if (otherVal > 0)
      big.push({ name: t("cashflow.breakdown.other", { defaultValue: "Other" }), value: otherVal });
    return big;
  }, [drill, drillData, byCategory, t]);

  const displayTotal = drill ? drillData.reduce((s, x) => s + x.value, 0) : total;

  const colorAt = (idx: number, explicit?: string) => explicit ?? palette[idx % palette.length];

  const isEmpty = entries.length === 0 || total === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium">
              {drill ? (
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{title}</span>
                  <span className="text-muted-foreground">›</span>
                  <span className="truncate text-muted-foreground">{drill}</span>
                </span>
              ) : (
                title
              )}
            </CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {format(displayTotal)} · {drill ? drillData.length : byCategory.length}{" "}
              {drill
                ? t("cashflow.breakdown.entries", { defaultValue: "entries" })
                : t("cashflow.breakdown.categories", { defaultValue: "categories" })}
            </div>
          </div>
          {drill && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDrill(null)}
            >
              <ArrowLeft className="mr-1 h-3 w-3" />
              {t("cashflow.breakdown.back", { defaultValue: "Back" })}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isEmpty ? (
          <div className="grid h-48 place-items-center text-xs text-muted-foreground">
            {emptyLabel ?? t("cashflow.breakdown.empty", { defaultValue: "No entries yet" })}
          </div>
        ) : (
          <>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={displayData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={1}
                    stroke="var(--background)"
                    strokeWidth={2}
                    onClick={(d: any) => {
                      if (drill) return;
                      const name = d?.name;
                      if (!name) return;
                      if (name === t("cashflow.breakdown.other", { defaultValue: "Other" })) return;
                      setDrill(name);
                    }}
                    cursor={drill ? "default" : "pointer"}
                  >
                    {displayData.map((d, i) => (
                      <Cell key={d.name} fill={colorAt(i, (d as any).color)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [
                      `${format(v)} (${((v / (displayTotal || 1)) * 100).toFixed(1)}%)`,
                      "",
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
            </div>
            <ul className="mt-3 space-y-1 text-xs">
              {displayData.map((d, i) => {
                const pct = ((d.value / (displayTotal || 1)) * 100).toFixed(1);
                const clickable =
                  !drill && d.name !== t("cashflow.breakdown.other", { defaultValue: "Other" });
                return (
                  <li
                    key={d.name}
                    className={`flex items-center justify-between gap-2 rounded px-1 py-0.5 ${
                      clickable ? "cursor-pointer hover:bg-muted" : ""
                    }`}
                    onClick={() => clickable && setDrill(d.name)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: colorAt(i, (d as any).color) }}
                      />
                      <span className="truncate">{d.name}</span>
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
