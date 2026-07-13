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
import {
  Plus,
  MoreVertical,
  RefreshCw,
  ArrowUpDown,
  Trash2,
  Pencil,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
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
import { SITE_URL } from "@/lib/site-config";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

export const Route = createFileRoute("/holdings")({
  head: () => {
    const title = i18n.t("holdings.metaTitle");
    const desc = i18n.t("holdings.metaDesc");
    const url = `${SITE_URL}/holdings`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
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
        if (!h.symbol.toLowerCase().includes(q) && !h.name.toLowerCase().includes(q)) return false;
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
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        return ((av as number) - (bv as number)) * dir;
      });
  }, [state.holdings, search, typeFilter, sort, total, toDisplay]);

  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
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
        }),
      );
      toast.success(t("holdings.refreshed"));
    } catch {
      toast.error(t("holdings.refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }

  const {
    bindRef,
    pull,
    refreshing: pullingRefresh,
    handlers,
  } = usePullToRefresh({
    onRefresh: refreshPrices,
    disabled: refreshing || !state.holdings.length,
  });

  return (
    <div ref={bindRef} {...handlers} className="relative">
      {(pull > 8 || pullingRefresh) && (
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center"
          style={{ height: Math.max(pull, pullingRefresh ? 40 : 0) }}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <Loader2 className={cn("h-4 w-4", (pullingRefresh || pull > 40) && "animate-spin")} />
            {pullingRefresh ? t("holdings.refresh") : null}
          </div>
        </div>
      )}
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
              data-tour="holdings-add"
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

      <Card className="border-border/60 rounded-2xl shadow-sm">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div
            className="sticky top-14 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl bg-background/90 px-1 py-2 backdrop-blur lg:static lg:bg-transparent lg:backdrop-blur-none"
            data-tour="holdings-filters"
          >
            <Input
              placeholder={t("more.hSearch")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-xs h-11 rounded-xl"
            />
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-40 h-11 rounded-xl">
                <SelectValue placeholder={t("more.hType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("more.hAllTypes")}</SelectItem>
                <SelectItem value="stock">{t("more.hTypeStock")}</SelectItem>
                <SelectItem value="etf">{t("more.hTypeEtf")}</SelectItem>
                <SelectItem value="crypto">{t("more.hTypeCrypto")}</SelectItem>
                <SelectItem value="metal">{t("more.hTypeMetal")}</SelectItem>
                <SelectItem value="other">{t("more.hTypeOther")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground" data-tour="holdings-table">
              {t("more.hNoMatch")}
            </div>
          ) : (
            <div data-tour="holdings-table">
              {/* Mobile card list */}
              <div className="space-y-2 md:hidden">
                {paged.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 active-press shadow-sm"
                  >
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: h.color }}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setEditing(h);
                        setOpen(true);
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold">{h.symbol}</span>
                        <span className="tabular-nums font-medium shrink-0">
                          {maskMoney(h.marketValue, currency, privacy)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{h.name}</span>
                        <span className="tabular-nums shrink-0">{h.pct.toFixed(1)}%</span>
                      </div>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0"
                          aria-label={`Actions for ${h.name || h.symbol}`}
                        >
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
                            toast.success(t("holdings.removed", { symbol: h.symbol }));
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-10"></TableHead>
                      <SortHead
                        label={t("more.hSymbol")}
                        k="symbol"
                        sort={sort}
                        onClick={toggleSort}
                      />
                      <TableHead>{t("more.hName")}</TableHead>
                      <SortHead label={t("more.hType")} k="type" sort={sort} onClick={toggleSort} />
                      <SortHead
                        label={t("more.hQuantity")}
                        k="quantity"
                        sort={sort}
                        onClick={toggleSort}
                        className="text-right"
                      />
                      <SortHead
                        label={t("more.hPrice")}
                        k="currentPrice"
                        sort={sort}
                        onClick={toggleSort}
                        className="text-right"
                      />
                      <SortHead
                        label={t("more.hValue")}
                        k="marketValue"
                        sort={sort}
                        onClick={toggleSort}
                        className="text-right"
                      />
                      <SortHead
                        label="%"
                        k="pct"
                        sort={sort}
                        onClick={toggleSort}
                        className="text-right"
                      />
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
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {t("more.hManual")}
                            </span>
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Actions for ${h.name || h.symbol}`}
                              >
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
                                <ArrowDownRight className="mr-2 h-4 w-4 text-destructive" /> Add
                                sell
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
                                  toast.success(t("holdings.removed", { symbol: h.symbol }));
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
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                Page {page + 1} of {pageCount}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
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

      <div data-tour="holdings-charts">
        <HoldingsCharts />
      </div>
      <TransactionsPanel />

      <HoldingDialog open={open} onOpenChange={setOpen} editing={editing} />
      <TransactionDialog
        open={txOpen}
        onOpenChange={(b) => {
          setTxOpen(b);
          if (!b) setTxHoldingId(undefined);
        }}
        defaultHoldingId={txHoldingId}
      />
    </div>
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
          sort.key === k && "text-foreground",
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
