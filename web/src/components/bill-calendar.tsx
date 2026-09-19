import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useStore, useMoney } from "@/lib/store";
import { expandCashflows, valuesByEntry } from "@/lib/cashflow-math";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BillCalendar({ onEdit }: { onEdit?: (parentId: string) => void }) {
  const { t } = useTranslation();
  const { state } = useStore();
  const { currency, toDisplay, privacy, MASK } = useMoney();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date | null>(new Date());

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const byDay = useMemo(() => {
    const until = endOfMonth(addMonths(cursor, 1));
    const expanded = expandCashflows(state.cashflows, until).filter((e) => e.kind !== "transfer");
    const values = valuesByEntry(expanded, toDisplay);
    const map = new Map<
      string,
      { id: string; parentId: string; label: string; kind: string; amount: number }[]
    >();
    for (const e of expanded) {
      const d = new Date(e.date);
      if (!isSameMonth(d, cursor)) continue;
      const key = format(d, "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push({
        id: e.id,
        parentId: e.parentId,
        label: e.description || e.source || e.category || "Entry",
        kind: e.kind,
        amount: values.get(e.id) ?? 0,
      });
      map.set(key, list);
    }
    return map;
  }, [state.cashflows, cursor, toDisplay]);

  const selectedKey = selected ? format(selected, "yyyy-MM-dd") : "";
  const selectedItems = selectedKey ? byDay.get(selectedKey) ?? [] : [];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 sm:p-4 space-y-3" data-tour="bill-calendar">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {t("cashflow.calendar.title", { defaultValue: "Bill calendar" })}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={() => setCursor(addMonths(cursor, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[8rem] text-center text-sm font-medium tabular-nums">
            {format(cursor, "MMMM yyyy")}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={() => setCursor(addMonths(cursor, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const items = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, cursor);
          const isSel = selected && isSameDay(day, selected);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(day)}
              className={cn(
                "relative flex min-h-11 flex-col items-center rounded-lg p-1 text-xs transition-colors",
                inMonth ? "text-foreground" : "text-muted-foreground/40",
                isSel && "bg-primary/15 text-foreground ring-1 ring-primary/40",
                !isSel && inMonth && "hover:bg-muted/60",
              )}
            >
              <span className="tabular-nums">{format(day, "d")}</span>
              {items.length > 0 ? (
                <span className="mt-0.5 flex gap-0.5">
                  {items.slice(0, 3).map((it) => (
                    <span
                      key={it.id}
                      className={cn(
                        "h-1 w-1 rounded-full",
                        it.kind === "income" ? "bg-success" : "bg-destructive",
                      )}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border/50 pt-3">
        <div className="text-xs font-medium text-muted-foreground">
          {selected
            ? format(selected, "EEE, MMM d")
            : t("cashflow.calendar.pickDay", { defaultValue: "Pick a day" })}
        </div>
        {selectedItems.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("cashflow.calendar.empty", { defaultValue: "No cashflow on this day." })}
          </div>
        ) : (
          selectedItems.map((it) => (
            <button
              key={it.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-left text-sm hover:bg-muted/40"
              onClick={() => onEdit?.(it.parentId)}
            >
              <span className="min-w-0 truncate">{it.label}</span>
              <span
                className={cn(
                  "tabular-nums shrink-0",
                  it.kind === "income" ? "text-success" : "text-destructive",
                )}
              >
                {privacy
                  ? MASK
                  : `${it.kind === "expense" ? "−" : "+"}${formatMoney(Math.abs(it.amount), currency)}`}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
