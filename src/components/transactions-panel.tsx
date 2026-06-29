import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { useStore, useMoney } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { TransactionDialog } from "@/components/transaction-dialog";
import type { HoldingTransaction } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PeriodKey = "all" | "week" | "month" | "year" | "custom";

export function TransactionsPanel() {
  const { t } = useTranslation();
  const { state, removeTransaction } = useStore();
  const { mask, toDisplay, currency, privacy, MASK } = useMoney();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HoldingTransaction | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "buy" | "sell">("all");
  const [holdingFilter, setHoldingFilter] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const holdingById = useMemo(() => {
    const m = new Map(state.holdings.map((h) => [h.id, h] as const));
    return m;
  }, [state.holdings]);

  const interval = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "week": return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "year": return { start: startOfYear(now), end: endOfYear(now) };
      case "custom": return { start: parseISO(customFrom), end: parseISO(customTo) };
      default: return null;
    }
  }, [period, customFrom, customTo]);

  const filtered = useMemo(() => {
    return state.transactions.filter((t) => {
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;
      if (holdingFilter !== "all" && t.holdingId !== holdingFilter) return false;
      if (interval) {
        const d = new Date(t.date);
        if (!isWithinInterval(d, interval)) return false;
      }
      return true;
    });
  }, [state.transactions, kindFilter, holdingFilter, interval]);

  const totals = useMemo(() => {
    let invested = 0;
    let proceeds = 0;
    let fees = 0;
    for (const t of filtered) {
      const gross = toDisplay(t.quantity * t.pricePerUnit, t.currency);
      const fee = toDisplay(t.fees ?? 0, t.currency);
      fees += fee;
      if (t.kind === "buy") invested += gross + fee;
      else proceeds += gross - fee;
    }
    return { invested, proceeds, fees, net: invested - proceeds };
  }, [filtered, toDisplay]);

  return (
    <Card className="border-border/60 mt-5">
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
        <CardTitle>{t("more.tpTitle")}</CardTitle>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setOpen(true); }}
          disabled={!state.holdings.length}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("more.tpAddTransaction")}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <div>
            <Label className="text-xs">{t("more.tpType")}</Label>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
              <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("more.tpAll")}</SelectItem>
                <SelectItem value="buy">{t("more.tpBuy")}</SelectItem>
                <SelectItem value="sell">{t("more.tpSell")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("more.tpHolding")}</Label>
            <Select value={holdingFilter} onValueChange={setHoldingFilter}>
              <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("more.tpAllHoldings")}</SelectItem>
                {state.holdings.map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("more.tpPeriod")}</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="h-9 mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("more.tpAllTime")}</SelectItem>
                <SelectItem value="week">{t("more.tpThisWeek")}</SelectItem>
                <SelectItem value="month">{t("more.tpThisMonth")}</SelectItem>
                <SelectItem value="year">{t("more.tpThisYear")}</SelectItem>
                <SelectItem value="custom">{t("more.tpCustomRange")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t("more.tpFrom")}</Label>
                <Input type="date" className="h-9 mt-1.5" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t("more.tpTo")}</Label>
                <Input type="date" className="h-9 mt-1.5" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
          <span className="rounded-md bg-success/15 text-success px-2 py-1">
            {t("more.tpInvested")}: {privacy ? MASK : formatMoney(totals.invested, currency)}
          </span>
          <span className="rounded-md bg-destructive/15 text-destructive px-2 py-1">
            {t("more.tpProceeds")}: {privacy ? MASK : formatMoney(totals.proceeds, currency)}
          </span>
          <span className="rounded-md bg-muted/50 px-2 py-1">
            {t("more.tpFeesLabel")}: {privacy ? MASK : formatMoney(totals.fees, currency)}
          </span>
          <span className={cn("rounded-md px-2 py-1", totals.net >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
            {t("more.tpNetInvested")}: {privacy ? MASK : `${totals.net >= 0 ? "+" : "−"}${formatMoney(Math.abs(totals.net), currency)}`}
          </span>
          <span className="ml-auto">{filtered.length} {t("more.tpCountSuffix")}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {state.transactions.length === 0
              ? t("more.tpEmpty")
              : t("more.tpEmptyFilters")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground [&>th]:px-3 [&>th]:py-2">
                  <th>{t("more.tpDate")}</th>
                  <th>{t("more.tpType")}</th>
                  <th>{t("more.tpHolding")}</th>
                  <th className="text-right">{t("more.tpQuantity")}</th>
                  <th className="text-right">{t("more.tpPrice")}</th>
                  <th className="text-right">{t("more.tpFeesLabel")}</th>
                  <th className="text-right">{t("more.tpTotal")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 [&>tr>td]:px-3">
                {[...filtered]
                  .sort((a, b) => +new Date(b.date) - +new Date(a.date))
                  .map((tx) => {
                    const h = holdingById.get(tx.holdingId);
                    const cur = (tx.currency || h?.priceCurrency || "USD").toUpperCase();
                    const total = tx.quantity * tx.pricePerUnit + (tx.fees ?? 0) * (tx.kind === "buy" ? 1 : -1);
                    return (
                      <tr key={tx.id}>
                        <td className="py-2.5 text-muted-foreground">{format(new Date(tx.date), "MMM d, yyyy")}</td>
                        <td className="py-2.5">
                          <span className={cn(
                            "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded",
                            tx.kind === "buy" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                          )}>
                            {tx.kind}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5">
                            {h && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: h.color }} />}
                            <span className="font-medium">{h?.symbol ?? "-"}</span>
                            {h && <span className="text-muted-foreground text-xs truncate max-w-[140px]">{h.name}</span>}
                          </div>
                          {tx.notes && (
                            <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[260px]" title={tx.notes}>
                              {tx.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{tx.quantity}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatMoney(tx.pricePerUnit, cur)}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {tx.fees ? formatMoney(tx.fees, cur) : "-"}
                        </td>
                        <td className={cn(
                          "py-2.5 text-right tabular-nums font-medium",
                          tx.kind === "buy" ? "text-success" : "text-destructive",
                        )}>
                          {privacy ? MASK : (tx.kind === "buy" ? "+" : "−") + mask(total, tx.currency)}
                        </td>
                        <td>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditing(tx); setOpen(true); }}>
                                <Pencil className="mr-2 h-4 w-4" /> {t("more.tpEdit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => { removeTransaction(tx.id); toast.success(t("more.tpRemoved")); }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> {t("more.tpDelete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <TransactionDialog open={open} onOpenChange={setOpen} editing={editing} />
    </Card>
  );
}
