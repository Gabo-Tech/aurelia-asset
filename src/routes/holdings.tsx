import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, useMoney } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, MoreVertical, RefreshCw, ArrowUpDown, Trash2, Pencil, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { HoldingDialog } from "@/components/holding-dialog";
import { TransactionDialog } from "@/components/transaction-dialog";
import { TransactionsPanel } from "@/components/transactions-panel";
import { HoldingsCharts } from "@/components/holdings-charts";
import { formatNumber, formatPct, formatMoney, maskNumber, maskMoney } from "@/lib/format";
import { fetchCurrentQuote } from "@/lib/finance";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Holding } from "@/lib/types";

export const Route = createFileRoute("/holdings")({
  head: () => ({
    meta: [
      { title: i18n.t("holdings.metaTitle") },
      { name: "description", content: i18n.t("holdings.metaDesc") },
    ],
  }),
  component: HoldingsPage,
});

type SortKey = "symbol" | "type" | "quantity" | "currentPrice" | "marketValue" | "pct";

function HoldingsPage() {
  const { state, removeHolding, updateHolding } = useStore();
  const { t } = useTranslation();
  const { mask, toDisplay, privacy, currency } = useMoney();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [txHoldingId, setTxHoldingId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "marketValue",
    dir: "desc",
  });
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const PAGE_SIZE = 10;

  const total = useMemo(
    () =>
      state.holdings.reduce((s, h) => {
        const mv = toDisplay(h.quantity * h.currentPrice, h.priceCurrency);
        return mv > 0 ? s + mv : s;
      }, 0),
    [state.holdings, toDisplay],
  );

  const rows = useMemo(() => {
    const filtered = state.holdings.filter((h) => {
      if (typeFilter !== "all" && h.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!h.symbol.toLowerCase().includes(q) && !h.name.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
    return filtered
      .map((h) => {
        const mv = toDisplay(h.quantity * h.currentPrice, h.priceCurrency);
        return {
          ...h,
          marketValue: mv,
          pct: total ? (mv * 100) / total : 0,
        };
      })
      .sort((a, b) => {
        const dir = sort.dir === "asc" ? 1 : -1;
        const av = a[sort.key];
        const bv = b[sort.key];
        if (typeof av === "string" && typeof bv === "string")
          return av.localeCompare(bv) * dir;
        return ((av as number) - (bv as number)) * dir;
      });
  }, [state.holdings, search, typeFilter, sort, total, toDisplay]);

  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  }

  async function refreshPrices() {
    if (!state.holdings.length) return;
    setRefreshing(true);
    try {
      await Promise.all(
        state.holdings.map(async (h) => {
          if (h.manualPrice != null) return;
          const q = await fetchCurrentQuote(h);
          if (q.price)
            updateHolding(h.id, {
              currentPrice: q.price,
              priceCurrency: q.currency ?? h.priceCurrency ?? "USD",
              lastPriceAt: Date.now(),
            });
        })
      );
      toast.success("Prices refreshed");
    } catch {
      toast.error("Failed to refresh some prices");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("holdings.title")}
        description={`${state.holdings.length} ${t("holdings.positionsCount")} · ${maskMoney(total, currency, privacy)}`}
        actions={
          <>
            <Button variant="outline" onClick={refreshPrices} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {t("holdings.refresh")}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> {t("holdings.addHolding")}
            </Button>
          </>
        }
      />

      <Card className="border-border/60">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search symbol or name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-xs"
            />
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="stock">Stocks</SelectItem>
                <SelectItem value="etf">ETFs</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="metal">Metals</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No holdings match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-10"></TableHead>
                    <SortHead label="Symbol" k="symbol" sort={sort} onClick={toggleSort} />
                    <TableHead>Name</TableHead>
                    <SortHead label="Type" k="type" sort={sort} onClick={toggleSort} />
                    <SortHead label="Quantity" k="quantity" sort={sort} onClick={toggleSort} className="text-right" />
                    <SortHead label="Price" k="currentPrice" sort={sort} onClick={toggleSort} className="text-right" />
                    <SortHead label="Value" k="marketValue" sort={sort} onClick={toggleSort} className="text-right" />
                    <SortHead label="%" k="pct" sort={sort} onClick={toggleSort} className="text-right" />
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: h.color }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{h.symbol}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {h.name}
                      </TableCell>
                      <TableCell>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {h.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {maskNumber(h.quantity, privacy, 6)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(h.currentPrice, h.priceCurrency || "USD")}
                        {h.manualPrice != null && (
                          <span className="ml-1 text-[10px] text-muted-foreground">man</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {maskMoney(h.marketValue, currency, privacy)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {h.pct.toFixed(2)}%
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setTxHoldingId(h.id);
                                setTxOpen(true);
                              }}
                            >
                              <ArrowUpRight className="mr-2 h-4 w-4 text-success" /> Add buy
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setTxHoldingId(h.id);
                                setTxOpen(true);
                              }}
                            >
                              <ArrowDownRight className="mr-2 h-4 w-4 text-destructive" /> Add sell
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(h);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                removeHolding(h.id);
                                toast.success(`Removed ${h.symbol}`);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                Page {page + 1} of {pageCount}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <HoldingsCharts />
      <TransactionsPanel />

      <HoldingDialog open={open} onOpenChange={setOpen} editing={editing} />
      <TransactionDialog
        open={txOpen}
        onOpenChange={(b) => { setTxOpen(b); if (!b) setTxHoldingId(undefined); }}
        defaultHoldingId={txHoldingId}
      />
    </>
  );
}

function SortHead({
  label,
  k,
  sort,
  onClick,
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground",
          sort.key === k && "text-foreground"
        )}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </TableHead>
  );
}

// Mark referenced for tree-shaking pleasure
void formatPct;
