import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Holding } from "@/lib/types";
import {
  fetchPortfolioHistory,
  PERIODS,
  type PeriodId,
  type PortfolioHistoryPoint,
} from "@/lib/finance";

const MAX_TTL = 24 * 60 * 60 * 1000;
const INTRA_TTL = 5 * 60 * 1000;

function holdingsKey(holdings: Holding[]) {
  return holdings
    .map((h) => `${h.id}:${h.symbol}:${h.coinGeckoId ?? ""}:${h.quantity}`)
    .join("|");
}

/** Full ("Max") history for every holding, fetched once and shared. */
export function usePortfolioMaxHistory(holdings: Holding[]) {
  const key = holdingsKey(holdings);
  return useQuery({
    queryKey: ["portfolio-history-max", key],
    queryFn: () => fetchPortfolioHistory(holdings, "Max"),
    enabled: holdings.length > 0,
    staleTime: MAX_TTL,
    gcTime: MAX_TTL,
  });
}

/** Intraday granularity for the 1D view. */
export function usePortfolioIntraday(holdings: Holding[], enabled: boolean) {
  const key = holdingsKey(holdings);
  return useQuery({
    queryKey: ["portfolio-history-1d", key],
    queryFn: () => fetchPortfolioHistory(holdings, "1D"),
    enabled: enabled && holdings.length > 0,
    staleTime: INTRA_TTL,
    gcTime: INTRA_TTL,
  });
}

function sliceMax(
  points: PortfolioHistoryPoint[] | undefined,
  period: PeriodId,
): PortfolioHistoryPoint[] | undefined {
  if (!points) return undefined;
  if (period === "Max") return points;
  if (period === "YTD") {
    const start = new Date(new Date().getFullYear(), 0, 1).getTime();
    return points.filter((d) => d.date >= start);
  }
  const p = PERIODS.find((x) => x.id === period);
  if (!p || p.days >= 36500) return points;
  const cutoff = Date.now() - p.days * 86400000;
  return points.filter((d) => d.date >= cutoff);
}

/**
 * Shared portfolio history for any period. Fetches Max once and filters
 * locally on every period switch. Uses intraday only for 1D.
 */
export function usePortfolioHistory(holdings: Holding[], period: PeriodId) {
  const max = usePortfolioMaxHistory(holdings);
  const intra = usePortfolioIntraday(holdings, period === "1D");
  const data = useMemo(
    () => (period === "1D" ? intra.data : sliceMax(max.data, period)),
    [max.data, intra.data, period],
  );
  return {
    data,
    isLoading: period === "1D" ? intra.isLoading : max.isLoading,
    isError: period === "1D" ? intra.isError : max.isError,
  };
}

/** Prefetch the Max series so the first chart open is instant. */
export function usePrefetchPortfolioHistory(holdings: Holding[], enabled: boolean) {
  const qc = useQueryClient();
  const key = holdingsKey(holdings);
  useMemo(() => {
    if (!enabled || !holdings.length) return;
    void qc.prefetchQuery({
      queryKey: ["portfolio-history-max", key],
      queryFn: () => fetchPortfolioHistory(holdings, "Max"),
      staleTime: MAX_TTL,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
}
