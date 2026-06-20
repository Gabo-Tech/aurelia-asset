import type { Holding, PricePoint, SearchResult } from "../types";
import { searchCrypto, getCryptoPrice, getCryptoHistory } from "./coingecko";
import { searchYahoo, getYahooQuote, getYahooHistory } from "./yahoo";
import { finnhubQuote, finnhubHistory } from "./finnhub";

export async function searchAssets(
  query: string,
  mode: "crypto" | "stock"
): Promise<SearchResult[]> {
  if (mode === "crypto") return searchCrypto(query);
  return searchYahoo(query);
}

export async function fetchCurrentPrice(h: Holding): Promise<number> {
  if (h.manualPrice != null) return h.manualPrice;
  if (h.type === "crypto" && h.coinGeckoId) {
    try {
      return await getCryptoPrice(h.coinGeckoId);
    } catch {
      return h.currentPrice ?? 0;
    }
  }
  // Custom holding (no market data) — use latest user-supplied history point
  if (h.type === "other") {
    const last = h.customHistory?.length
      ? h.customHistory[h.customHistory.length - 1].p
      : undefined;
    return last ?? h.currentPrice ?? 0;
  }
  try {
    const p = await getYahooQuote(h.symbol);
    if (p) return p;
  } catch {}
  const fb = await finnhubQuote(h.symbol);
  return fb ?? h.currentPrice ?? 0;
}

// Map UI period -> {cryptoDays, yahooRange, approxDays}
export const PERIODS = [
  { id: "1D", label: "1D", cgDays: 1, yhRange: "1d", days: 1 },
  { id: "7D", label: "7D", cgDays: 7, yhRange: "5d", days: 7 },
  { id: "1M", label: "1M", cgDays: 30, yhRange: "1mo", days: 30 },
  { id: "3M", label: "3M", cgDays: 90, yhRange: "3mo", days: 90 },
  { id: "6M", label: "6M", cgDays: 180, yhRange: "6mo", days: 180 },
  { id: "YTD", label: "YTD", cgDays: 365, yhRange: "ytd", days: 365 },
  { id: "1Y", label: "1Y", cgDays: 365, yhRange: "1y", days: 365 },
  { id: "5Y", label: "5Y", cgDays: 1825, yhRange: "5y", days: 1825 },
  { id: "10Y", label: "10Y", cgDays: 3650, yhRange: "10y", days: 3650 },
  { id: "Max", label: "Max", cgDays: "max" as const, yhRange: "max", days: 36500 },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

export async function fetchHistorical(h: Holding, period: PeriodId): Promise<PricePoint[]> {
  const p = PERIODS.find((x) => x.id === period)!;
  if (h.type === "crypto" && h.coinGeckoId) {
    try {
      return await getCryptoHistory(h.coinGeckoId, p.cgDays);
    } catch {
      return [];
    }
  }
  try {
    const data = await getYahooHistory(h.symbol, p.yhRange);
    if (data.length) return data;
  } catch {}
  const to = Math.floor(Date.now() / 1000);
  const from = to - p.days * 86400;
  const fb = await finnhubHistory(h.symbol, from, to);
  return fb ?? [];
}

export type PortfolioHistoryPoint = {
  date: number;
  total: number;
  perAsset: Record<string, number>;
};

export async function fetchPortfolioHistory(
  holdings: Holding[],
  period: PeriodId
): Promise<PortfolioHistoryPoint[]> {
  if (!holdings.length) return [];
  const series = await Promise.all(
    holdings.map(async (h) => ({ h, points: await fetchHistorical(h, period) }))
  );
  // Build date union (day-bucket)
  const dayKeys = new Set<number>();
  for (const s of series) {
    for (const pt of s.points) {
      const d = new Date(pt.date);
      d.setUTCHours(0, 0, 0, 0);
      dayKeys.add(d.getTime());
    }
  }
  if (!dayKeys.size) return [];
  const days = Array.from(dayKeys).sort((a, b) => a - b);

  // For each holding, build sorted points and forward-fill
  const filled = series.map(({ h, points }) => {
    const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
    const map = new Map<number, number>();
    let j = 0;
    let last = sorted[0]?.price ?? h.currentPrice ?? 0;
    for (const day of days) {
      while (j < sorted.length && sorted[j].date.getTime() <= day + 86400000 - 1) {
        last = sorted[j].price;
        j++;
      }
      map.set(day, last);
    }
    return { h, map };
  });

  return days.map((day) => {
    const perAsset: Record<string, number> = {};
    let total = 0;
    for (const { h, map } of filled) {
      const v = (map.get(day) ?? 0) * h.quantity;
      perAsset[h.id] = v;
      total += v;
    }
    return { date: day, total, perAsset };
  });
}
