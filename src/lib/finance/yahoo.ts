import { fetchJson, proxied } from "./client";
import { getCache, setCache } from "./cache";
import type { AssetType, PricePoint, SearchResult } from "../types";

const SEARCH = "https://query1.finance.yahoo.com/v1/finance/search";
const QUOTE = "https://query1.finance.yahoo.com/v7/finance/quote";
const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

function mapType(t?: string, symbol?: string): AssetType {
  const s = (symbol ?? "").toUpperCase();
  if (/GC=F|SI=F|XAU|XAG|PL=F|PA=F/.test(s)) return "metal";
  switch ((t ?? "").toLowerCase()) {
    case "etf":
      return "etf";
    case "cryptocurrency":
      return "crypto";
    case "future":
      return "metal";
    case "equity":
      return "stock";
    default:
      return "other";
  }
}

export async function searchYahoo(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const key = `yh:search:${query.toLowerCase()}`;
  const cached = getCache<SearchResult[]>(key);
  if (cached) return cached;
  const data = await fetchJson<{
    quotes?: Array<{ symbol: string; shortname?: string; longname?: string; quoteType?: string }>;
  }>(proxied(`${SEARCH}?q=${encodeURIComponent(query)}`));
  const results: SearchResult[] = (data.quotes ?? []).slice(0, 10).map((q) => ({
    symbol: q.symbol,
    name: q.shortname || q.longname || q.symbol,
    type: mapType(q.quoteType, q.symbol),
  }));
  setCache(key, results, 10 * 60 * 1000);
  return results;
}

export async function getYahooQuote(symbol: string): Promise<number> {
  const key = `yh:q:${symbol}`;
  const cached = getCache<number>(key);
  if (cached) return cached;
  const data = await fetchJson<{
    quoteResponse?: { result?: Array<{ regularMarketPrice?: number }> };
  }>(proxied(`${QUOTE}?symbols=${encodeURIComponent(symbol)}`));
  const p = data.quoteResponse?.result?.[0]?.regularMarketPrice ?? 0;
  if (p) setCache(key, p, 5 * 60 * 1000);
  return p;
}

export async function getYahooHistory(
  symbol: string,
  range: string
): Promise<PricePoint[]> {
  const key = `yh:hist:${symbol}:${range}`;
  const cached = getCache<{ t: number; p: number }[]>(key);
  if (cached) return cached.map((x) => ({ date: new Date(x.t), price: x.p }));
  const data = await fetchJson<{
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }>;
    };
  }>(proxied(`${CHART}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`));
  const r = data.chart?.result?.[0];
  if (!r) return [];
  const ts = r.timestamp ?? [];
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  const points: PricePoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c != null) points.push({ date: new Date(ts[i] * 1000), price: c });
  }
  setCache(
    key,
    points.map((x) => ({ t: x.date.getTime(), p: x.price })),
    60 * 60 * 1000
  );
  return points;
}
