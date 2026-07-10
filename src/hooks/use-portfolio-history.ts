import { useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Holding, HoldingTransaction } from "@/lib/types";
import { fetchAllAssetPrices, type PeriodId, type PortfolioHistoryPoint } from "@/lib/finance";
import {
  composePortfolioDaily,
  composePortfolioIntraday,
  slicePortfolioByPeriod,
} from "@/lib/finance/portfolio-history";

const PRICE_TTL = 30 * 24 * 60 * 60 * 1000;

/** Asset identity only — quantity/price changes must not refetch history. */
function assetPriceKey(holdings: Holding[]) {
  return holdings.map((h) => `${h.id}:${h.symbol}:${h.coinGeckoId ?? ""}:${h.type}`).join("|");
}

export const ASSET_PRICES_QUERY_KEY = "asset-prices";

/** Cached full daily + intraday price series per holding. */
export function useAssetPrices(holdings: Holding[]) {
  const key = assetPriceKey(holdings);
  return useQuery({
    queryKey: [ASSET_PRICES_QUERY_KEY, key],
    queryFn: () => fetchAllAssetPrices(holdings),
    enabled: holdings.length > 0,
    staleTime: PRICE_TTL,
    gcTime: PRICE_TTL,
  });
}

function usePortfolioMaxSeries(
  holdings: Holding[],
  transactions: HoldingTransaction[],
  prices: ReturnType<typeof useAssetPrices>["data"],
): PortfolioHistoryPoint[] | undefined {
  return useMemo(() => {
    if (!prices || !holdings.length) return undefined;
    return composePortfolioDaily(holdings, transactions, prices);
  }, [holdings, transactions, prices]);
}

/**
 * Portfolio history for any period. Fetches each asset's full price history once,
 * stores it locally, and slices by period in memory. Quantities follow transactions.
 */
export function usePortfolioHistory(
  holdings: Holding[],
  transactions: HoldingTransaction[],
  period: PeriodId,
) {
  const prices = useAssetPrices(holdings);
  const maxSeries = usePortfolioMaxSeries(holdings, transactions, prices.data);

  const data = useMemo(() => {
    if (!maxSeries) return undefined;
    if (period === "1D") {
      const intra =
        prices.data && holdings.length
          ? composePortfolioIntraday(holdings, transactions, prices.data)
          : [];
      if (intra.length) return intra;
    }
    return slicePortfolioByPeriod(maxSeries, period);
  }, [maxSeries, period, holdings, transactions, prices.data]);

  return {
    data,
    isLoading: prices.isLoading,
    isError: prices.isError,
  };
}

/** Drop React Query portfolio/price caches after provider cache bust. */
export function invalidatePortfolioPriceQueries(qc: QueryClient) {
  void qc.removeQueries({ queryKey: [ASSET_PRICES_QUERY_KEY] });
  void qc.removeQueries({ queryKey: ["portfolio-history-max"] });
  void qc.removeQueries({ queryKey: ["portfolio-history-1d"] });
}

/** Prefetch per-asset price history so the first chart open is instant. */
export function usePrefetchPortfolioHistory(holdings: Holding[], enabled: boolean) {
  const qc = useQueryClient();
  const key = assetPriceKey(holdings);
  useMemo(() => {
    if (!enabled || !holdings.length) return;
    void qc.prefetchQuery({
      queryKey: [ASSET_PRICES_QUERY_KEY, key],
      queryFn: () => fetchAllAssetPrices(holdings),
      staleTime: PRICE_TTL,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
}

// Back-compat aliases (used by tests or external imports).
export const usePortfolioMaxHistory = useAssetPrices;
export function usePortfolioIntraday(_holdings: Holding[], _enabled: boolean) {
  return { data: undefined, isLoading: false, isError: false };
}
