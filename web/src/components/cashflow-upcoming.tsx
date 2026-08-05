import { useMemo, useState } from "react";
import { format, isToday, isTomorrow } from "date-fns";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ChevronRight, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getUpcomingOccurrences,
  groupOccurrencesByDay,
  summarizeUpcoming,
  valuesByEntry,
  type ExpandedCashflowEntry,
} from "@/lib/cashflow-math";
import { formatMoney } from "@/lib/format";
import type { CashflowEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

type UpcomingDays = 7 | 14 | 30 | 90;
type PreviewDays = 7 | 14 | 30;

const FULL_PERIODS: UpcomingDays[] = [7, 14, 30, 90];
const PREVIEW_PERIODS: PreviewDays[] = [7, 14, 30];

function periodShortLabel(days: UpcomingDays, t: (k: string) => string): string {
  if (days === 7) return t("cashflow.upcoming.periodShort7");
  if (days === 14) return t("cashflow.upcoming.periodShort14");
  if (days === 30) return t("cashflow.upcoming.periodShort30");
  return t("cashflow.upcoming.periodShort90");
}

function entryLabel(e: ExpandedCashflowEntry): string {
  const name = e.kind === "income" ? e.source : e.category;
  return e.description || name || "(unnamed)";
}

function dayHeading(date: Date, t: (k: string) => string): string {
  if (isToday(date)) return t("cashflow.upcoming.today");
  if (isTomorrow(date)) return t("cashflow.upcoming.tomorrow");
  return format(date, "EEE, MMM d");
}

function isRecurringOccurrence(e: ExpandedCashflowEntry, parents: CashflowEntry[]): boolean {
  const parent = parents.find((p) => p.id === e.parentId);
  return !!parent?.recurrence || !!parent?.installmentPlan;
}

type UpcomingListProps = {
  cashflows: CashflowEntry[];
  currency: string;
  privacy: boolean;
  mask: string;
  toDisplay: (amount: number, from?: string) => number;
  days?: UpcomingDays;
  compact?: boolean;
  limit?: number;
  onEdit?: (parentId: string) => void;
  onViewAll?: () => void;
  showPeriodToggle?: boolean;
};

export function UpcomingList({
  cashflows,
  currency,
  privacy,
  mask,
  toDisplay,
  days: initialDays = 30,
  compact = false,
  limit,
  onEdit,
  onViewAll,
  showPeriodToggle = true,
}: UpcomingListProps) {
  const { t } = useTranslation();
  const [days, setDays] = useState<UpcomingDays>(initialDays);

  const windowDays = compact ? (initialDays as UpcomingDays) : days;

  const occurrences = useMemo(
    () => getUpcomingOccurrences(cashflows, { days: windowDays }),
    [cashflows, windowDays],
  );

  const displayed = limit ? occurrences.slice(0, limit) : occurrences;

  const values = useMemo(() => valuesByEntry(occurrences, toDisplay), [occurrences, toDisplay]);
  const totals = useMemo(() => summarizeUpcoming(occurrences, values), [occurrences, values]);
  const byDay = useMemo(() => groupOccurrencesByDay(displayed), [displayed]);

  const dayKeys = useMemo(() => [...byDay.keys()].sort(), [byDay]);

  return (
    <div className={compact ? "" : "space-y-4"}>
      {!compact && showPeriodToggle && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {t("cashflow.upcoming.expectedIn", { days: windowDays })}
          </p>
          <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
            {FULL_PERIODS.map((d) => (
              <Button
                key={d}
                variant={days === d ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setDays(d)}
              >
                {periodShortLabel(d, t)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {!compact && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <SummaryChip
            label={t("cashflow.income")}
            value={privacy ? mask : formatMoney(totals.income, currency)}
            tone="success"
          />
          <SummaryChip
            label={t("cashflow.expenses")}
            value={privacy ? mask : formatMoney(totals.expense, currency)}
            tone="destructive"
          />
          <SummaryChip
            label={t("cashflow.net")}
            value={
              privacy
                ? mask
                : `${totals.net >= 0 ? "+" : "−"}${formatMoney(Math.abs(totals.net), currency)}`
            }
            tone={totals.net >= 0 ? "success" : "destructive"}
          />
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <p>{t("cashflow.upcoming.empty")}</p>
          {!compact && (
            <p className="mt-2 text-xs">{t("cashflow.upcoming.emptyHint")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {dayKeys.map((key) => {
            const items = byDay.get(key) ?? [];
            const date = new Date(key + "T12:00:00");
            return (
              <div key={key}>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {dayHeading(date, t)}
                  {!compact && (
                    <span className="ml-1.5 font-normal opacity-70">{format(date, "MMM d")}</span>
                  )}
                </div>
                <ul className="divide-y divide-border/40 rounded-lg border border-border/60 overflow-hidden">
                  {items.map((e) => (
                    <UpcomingRow
                      key={e.id}
                      entry={e}
                      cashflows={cashflows}
                      value={values.get(e.id) ?? 0}
                      currency={currency}
                      privacy={privacy}
                      mask={mask}
                      compact={compact}
                      onEdit={onEdit}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {compact && onViewAll && occurrences.length > 0 && (
        <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={onViewAll}>
          {t("cashflow.upcoming.viewAll")}
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function UpcomingRow({
  entry,
  cashflows,
  value,
  currency,
  privacy,
  mask,
  compact,
  onEdit,
}: {
  entry: ExpandedCashflowEntry;
  cashflows: CashflowEntry[];
  value: number;
  currency: string;
  privacy: boolean;
  mask: string;
  compact?: boolean;
  onEdit?: (parentId: string) => void;
}) {
  const { t } = useTranslation();
  const isIncome = entry.kind === "income";
  const recurring = isRecurringOccurrence(entry, cashflows);
  const formatted = privacy ? mask : formatMoney(value, currency);

  return (
    <li>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
          onEdit && "hover:bg-muted/50 cursor-pointer",
          !onEdit && "cursor-default",
        )}
        onClick={() => onEdit?.(entry.parentId)}
        disabled={!onEdit}
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            isIncome ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
          )}
        >
          {isIncome ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{entryLabel(entry)}</span>
        {!compact && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {recurring ? (
              <span className="inline-flex items-center gap-0.5">
                <Repeat className="h-3 w-3" />
                {t("cashflow.upcoming.recurring")}
              </span>
            ) : (
              t("cashflow.upcoming.oneTime")
            )}
          </span>
        )}
        <span
          className={cn(
            "shrink-0 tabular-nums font-semibold",
            isIncome ? "text-success" : "text-destructive",
          )}
        >
          {isIncome ? "+" : "−"}
          {formatted}
        </span>
      </button>
    </li>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "destructive";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 px-3 py-2 text-center",
        tone === "success" ? "bg-success/5" : "bg-destructive/5",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums truncate",
          tone === "success" ? "text-success" : "text-destructive",
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

export function UpcomingPreviewCard({
  cashflows,
  currency,
  privacy,
  mask,
  toDisplay,
  onViewAll,
  onEdit,
}: {
  cashflows: CashflowEntry[];
  currency: string;
  privacy: boolean;
  mask: string;
  toDisplay: (amount: number, from?: string) => number;
  onViewAll: () => void;
  onEdit?: (parentId: string) => void;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState<PreviewDays>(7);

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-base">{t("cashflow.upcoming.title")}</CardTitle>
        <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
          {PREVIEW_PERIODS.map((d) => (
            <Button
              key={d}
              variant={days === d ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setDays(d)}
              aria-label={
                d === 7
                  ? t("cashflow.upcoming.period7")
                  : d === 14
                    ? t("cashflow.upcoming.period14")
                    : t("cashflow.upcoming.period30")
              }
            >
              {periodShortLabel(d, t)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <UpcomingList
          cashflows={cashflows}
          currency={currency}
          privacy={privacy}
          mask={mask}
          toDisplay={toDisplay}
          days={days}
          compact
          limit={5}
          onEdit={onEdit}
          onViewAll={onViewAll}
          showPeriodToggle={false}
        />
      </CardContent>
    </Card>
  );
}

export function UpcomingPanel({
  cashflows,
  currency,
  privacy,
  mask,
  toDisplay,
  onEdit,
}: {
  cashflows: CashflowEntry[];
  currency: string;
  privacy: boolean;
  mask: string;
  toDisplay: (amount: number, from?: string) => number;
  onEdit?: (parentId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>{t("cashflow.upcoming.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("cashflow.upcoming.description")}</p>
      </CardHeader>
      <CardContent>
        <UpcomingList
          cashflows={cashflows}
          currency={currency}
          privacy={privacy}
          mask={mask}
          toDisplay={toDisplay}
          onEdit={onEdit}
        />
      </CardContent>
    </Card>
  );
}
