import { fetchJson } from "./client";
import { getCache, setCache } from "./cache";
import type { PricePoint, SearchResult } from "../types";

const BASE = "https://api.coingecko.com/api/v3";

export async function searchCrypto(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const key = `cg:search:${query.toLowerCase()}`;
  const cached = getCache<SearchResult[]>(key);
  if (cached) return cached;
  const data = await fetchJson<{ coins?: Array<{ id: string; symbol: string; name: string }> }>(
    `${BASE}/search?query=${encodeURIComponent(query)}`
  );
  const results: SearchResult[] = (data.coins ?? []).slice(0, 10).map((c) => ({
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    type: "crypto",
    coinGeckoId: c.id,
  }));
  setCache(key, results, 10 * 60 * 1000);
  return results;
}

export async function getCryptoPrice(coinId: string): Promise<number> {
  const key = `cg:price:${coinId}`;
  const cached = getCache<number>(key);
  if (cached) return cached;
  const data = await fetchJson<Record<string, { usd: number }>>(
    `${BASE}/simple/price?ids=${coinId}&vs_currencies=usd`
  );
  const p = data[coinId]?.usd ?? 0;
  setCache(key, p, 5 * 60 * 1000);
  return p;
}

export async function getCryptoHistory(
  coinId: string,
  days: string | number
): Promise<PricePoint[]> {
  const key = `cg:hist:${coinId}:${days}`;
  const cached = getCache<{ t: number; p: number }[]>(key);
  if (cached) return cached.map((x) => ({ date: new Date(x.t), price: x.p }));
  // Note: do NOT pass `interval=daily` - it's an Enterprise-only param on
  // CoinGecko and makes the free tier return no data for short ranges.
  // Without it, the server auto-picks granularity (5m for days=1,
  // hourly for 2-90, daily >90).
  const data = await fetchJson<{ prices: [number, number][] }>(
    `${BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
  );
  const points = (data.prices ?? []).map(([t, p]) => ({ date: new Date(t), price: p }));
  setCache(
    key,
    points.map((x) => ({ t: x.date.getTime(), p: x.price })),
    60 * 60 * 1000
  );
  return points;
}
