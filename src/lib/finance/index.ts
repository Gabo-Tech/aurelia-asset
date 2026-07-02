import type { Holding, PricePoint, SearchResult } from "../types";
import { searchCrypto, getCryptoPrice, getCryptoHistory } from "./coingecko";
import { searchYahoo, getYahooQuote, getYahooHistory } from "./yahoo";
import { finnhubQuote, finnhubHistory } from "./finnhub";
import { getStooqHistory, getStooqQuote, searchStooq } from "./stooq";
import { getBinanceHistory, getBinanceQuote } from "./binance";
import { getCache, getCacheStale, setCache, bustCache } from "./cache";

// Resolve a missing coinGeckoId from the ticker symbol so older holdings
// (added before we started saving the id) still get proper history + price.
async function resolveCoinGeckoId(symbol: string): Promise<string | null> {
  if (!symbol) return null;
  const key = `cg:resolve:${symbol.toUpperCase()}`;
  const cached = getCache<string | null>(key);
  if (cached !== undefined) return cached;
  try {
    const results = await searchCrypto(symbol);
    const upper = symbol.toUpperCase();
    const hit =
      results.find((r) => r.symbol.toUpperCase() === upper && r.coinGeckoId)
        ?.coinGeckoId ?? null;
    setCache(key, hit, 24 * 60 * 60 * 1000);
    return hit;
  } catch {
    return null;
  }
}

export async function searchAssets(
  query: string,
  mode: "crypto" | "stock"
): Promise<SearchResult[]> {
  if (mode === "crypto") return searchCrypto(query);
  try {
    const yahoo = await searchYahoo(query);
    if (yahoo.length) return yahoo;
  } catch {}
  return searchStooq(query);
}

export type FetchedQuote = { price: number; currency?: string };

/** Run providers in order, return the first one that yields a finite price. */
async function firstQuote(
  chain: Array<() => Promise<FetchedQuote | null>>,
  fallback: FetchedQuote,
): Promise<FetchedQuote> {
  for (const fn of chain) {
    try {
      const q = await fn();
      if (q && isFinite(q.price) && q.price > 0) return q;
    } catch {}
  }
  return fallback;
}

export async function fetchCurrentQuote(h: Holding): Promise<FetchedQuote> {
  if (h.manualPrice != null) return { price: h.manualPrice, currency: h.priceCurrency };
  if (h.type === "other") {
    const last = h.customHistory?.length
      ? h.customHistory[h.customHistory.length - 1].p
      : undefined;
    return { price: last ?? h.currentPrice ?? 0, currency: h.priceCurrency };
  }
  const fallback: FetchedQuote = {
    price: h.currentPrice ?? 0,
    currency: h.priceCurrency,
  };
  if (h.type === "crypto") {
    return firstQuote(
      [
        async () => {
          const id = h.coinGeckoId || (await resolveCoinGeckoId(h.symbol));
          return id ? { price: await getCryptoPrice(id), currency: "USD" } : null;
        },
        async () => {
          const p = await getBinanceQuote(h.symbol);
          return p != null ? { price: p, currency: "USD" } : null;
        },
      ],
      fallback,
    );
  }
  return firstQuote(
    [
      async () => {
        const p = await finnhubQuote(h.symbol);
        return p != null ? { price: p, currency: "USD" } : null;
      },
      async () => {
        const q = await getYahooQuote(h.symbol);
        return q.price ? { price: q.price, currency: q.currency ?? h.priceCurrency } : null;
      },
      async () => {
        const p = await getStooqQuote(h.symbol);
        return p != null ? { price: p, currency: h.priceCurrency ?? "USD" } : null;
      },
    ],
    fallback,
  );
}

/** Back-compat: price only. */
export async function fetchCurrentPrice(h: Holding): Promise<number> {
  return (await fetchCurrentQuote(h)).price;
}

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

// --- max-history caching ---------------------------------------------------
// Daily history rarely changes for past dates, so we fetch the full series
// once per asset and slice it in memory for every period switch. This makes
// the short ranges (1M / 3M / 6M) reliable even when the upstream APIs are
// rate-limiting us, because they're served from cache.

const MAX_HIST_KEY = (h: Holding) => `mh:${h.type}:${h.coinGeckoId || h.symbol}`;
const MAX_HIST_TTL = 24 * 60 * 60 * 1000;
const intraDay = new Map<string, Promise<PricePoint[]>>();
const maxHistInflight = new Map<string, Promise<PricePoint[]>>();

async function fetchFromChain(
  chain: Array<() => Promise<PricePoint[]>>,
): Promise<PricePoint[]> {
  for (const fn of chain) {
    try {
      const data = await fn();
      if (data.length) return data;
    } catch {}
  }
  return [];
}

async function fetchMaxHistory(h: Holding): Promise<PricePoint[]> {
  const key = MAX_HIST_KEY(h);
  const fresh = getCache<{ t: number; p: number }[]>(key);
  if (fresh) return fresh.map((x) => ({ date: new Date(x.t), price: x.p }));
  const existing = maxHistInflight.get(key);
  if (existing) return existing;

  const job = (async (): Promise<PricePoint[]> => {
    if (h.type === "other") {
      return (h.customHistory ?? []).map((x) => ({
        date: new Date(x.t),
        price: x.p,
      }));
    }
    const chain: Array<() => Promise<PricePoint[]>> =
      h.type === "crypto"
        ? [
            async () => {
              const id = h.coinGeckoId || (await resolveCoinGeckoId(h.symbol));
              return id ? await getCryptoHistory(id, "max") : [];
            },
            async () => await getBinanceHistory(h.symbol),
          ]
        : [
            async () => {
              const to = Math.floor(Date.now() / 1000);
              const from = to - 10 * 365 * 86400;
              return (await finnhubHistory(h.symbol, from, to)) ?? [];
            },
            async () => await getYahooHistory(h.symbol, "max"),
            async () => await getStooqHistory(h.symbol),
          ];
    const data = await fetchFromChain(chain);
    if (data.length) {
      setCache(
        key,
        data.map((x) => ({ t: x.date.getTime(), p: x.price })),
        MAX_HIST_TTL,
      );
    } else {
      // Fall back to whatever we previously had (even if expired) so the UI
      // isn't empty just because the API is currently rate-limited.
      const stale = getCacheStale<{ t: number; p: number }[]>(key);
      if (stale) return stale.map((x) => ({ date: new Date(x.t), price: x.p }));
    }
    return data;
  })().finally(() => {
    maxHistInflight.delete(key);
  });

  maxHistInflight.set(key, job);
  return job;
}

function sliceByDays(points: PricePoint[], days: number): PricePoint[] {
  if (!points.length || days >= 36500) return points;
  const cutoff = Date.now() - days * 86400000;
  return points.filter((p) => p.date.getTime() >= cutoff);
}

function sliceYtd(points: PricePoint[]): PricePoint[] {
  const start = new Date(new Date().getFullYear(), 0, 1).getTime();
  return points.filter((p) => p.date.getTime() >= start);
}

async function fetchIntraday(h: Holding): Promise<PricePoint[]> {
  const key = `intra:${h.type}:${h.coinGeckoId || h.symbol}`;
  const existing = intraDay.get(key);
  if (existing) return existing;
  const cached = getCache<{ t: number; p: number }[]>(key);
  if (cached) return cached.map((x) => ({ date: new Date(x.t), price: x.p }));
  const job = (async (): Promise<PricePoint[]> => {
    let data: PricePoint[] = [];
    try {
      if (h.type === "crypto") {
        const id = h.coinGeckoId || (await resolveCoinGeckoId(h.symbol));
        if (id) data = await getCryptoHistory(id, 1);
      } else if (h.type !== "crypto" && h.type !== "other") {
        data = await getYahooHistory(h.symbol, "1d");
      }
    } catch {}
    if (data.length) {
      setCache(
        key,
        data.map((x) => ({ t: x.date.getTime(), p: x.price })),
        5 * 60 * 1000,
      );
    }
    return data;
  })().finally(() => {
    intraDay.delete(key);
  });
  intraDay.set(key, job);
  return job;
}

export async function fetchHistorical(h: Holding, period: PeriodId): Promise<PricePoint[]> {
  if (h.type === "other") {
    const hist = (h.customHistory ?? []).map((x) => ({
      date: new Date(x.t),
      price: x.p,
    }));
    if (period === "Max") return hist;
    if (period === "YTD") return sliceYtd(hist);
    const p = PERIODS.find((x) => x.id === period)!;
    return sliceByDays(hist, p.days);
  }
  if (period === "1D") {
    const intra = await fetchIntraday(h);
    if (intra.length) return intra;
  }
  const full = await fetchMaxHistory(h);
  if (!full.length) return [];
  if (period === "Max") return full;
  if (period === "YTD") return sliceYtd(full);
  const p = PERIODS.find((x) => x.id === period)!;
  return sliceByDays(full, p.days);
}

/** Drop every cached price history (max + intraday + per-provider). */
export function clearPriceHistoryCache() {
  bustCache("mh:");
  bustCache("intra:");
  bustCache("yh:hist:");
  bustCache("cg:hist:");
  bustCache("st:hist:");
  bustCache("bn:hist:");
}

export type PortfolioHistoryPoint = {
  date: number;
  total: number;
  perAsset: Record<string, number>;
  perAssetPrice: Record<string, number>;
};

export async function fetchPortfolioHistory(
  holdings: Holding[],
  period: PeriodId
): Promise<PortfolioHistoryPoint[]> {
  if (!holdings.length) return [];
  const series = await Promise.all(
    holdings.map(async (h) => ({ h, points: await fetchHistorical(h, period) }))
  );
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
    const perAssetPrice: Record<string, number> = {};
    let total = 0;
    for (const { h, map } of filled) {
      const price = map.get(day) ?? 0;
      const v = price * h.quantity;
      perAssetPrice[h.id] = price;
      perAsset[h.id] = v;
      total += v;
    }
    return { date: day, total, perAsset, perAssetPrice };
  });
}
