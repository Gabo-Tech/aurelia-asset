import { fetchWithFallback } from "./client";
import { getCache, setCache } from "./cache";
import type { PricePoint } from "../types";

// Binance is rate-limit friendly and CORS-permissive from the browser. It's
// our crypto fallback when CoinGecko fails or rate-limits us. We pair the
// symbol against USDT (closest free USD proxy).
function pair(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // A few well-known mappings where the binance ticker differs from the
  // common symbol.
  const remap: Record<string, string> = { IOTA: "IOTA", MIOTA: "IOTA" };
  return (remap[s] ?? s) + "USDT";
}

export async function getBinanceQuote(symbol: string): Promise<number | null> {
  try {
    const data = await fetchWithFallback<{ price?: string }>(
      `https://api.binance.com/api/v3/ticker/price?symbol=${pair(symbol)}`,
      { preferDirect: true },
    );
    const p = parseFloat(data.price ?? "");
    return isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

export async function getBinanceHistory(symbol: string): Promise<PricePoint[]> {
  const sym = pair(symbol);
  const key = `bn:hist:${sym}`;
  const cached = getCache<{ t: number; p: number }[]>(key);
  if (cached) return cached.map((x) => ({ date: new Date(x.t), price: x.p }));
  try {
    // Binance returns at most 1000 candles per call. 1000 daily candles
    // (~2.7 years) is plenty for the periods we render.
    const data = await fetchWithFallback<unknown[]>(
      `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1d&limit=1000`,
      { preferDirect: true },
    );
    const points: PricePoint[] = [];
    for (const row of data) {
      if (!Array.isArray(row)) continue;
      const t = Number(row[0]);
      const close = parseFloat(String(row[4]));
      if (!isFinite(t) || !isFinite(close)) continue;
      points.push({ date: new Date(t), price: close });
    }
    if (points.length) {
      setCache(
        key,
        points.map((x) => ({ t: x.date.getTime(), p: x.price })),
        24 * 60 * 60 * 1000,
      );
    }
    return points;
  } catch {
    return [];
  }
}
