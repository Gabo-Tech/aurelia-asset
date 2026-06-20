import { getCache, setCache } from "./cache";

/** USD-based rates: `rates[X]` = how many X per 1 USD. */
export type FxRates = Record<string, number>;

const CACHE_KEY = "fx:usd-rates";
const TTL = 6 * 60 * 60 * 1000; // 6h

/** Free, no-key endpoint. USD-based. Returns { rates: { EUR: 0.92, ... } }. */
const PRIMARY = "https://open.er-api.com/v6/latest/USD";
/** Fallback (also free / no key). */
const FALLBACK = "https://api.exchangerate-api.com/v4/latest/USD";

let inflight: Promise<FxRates> | null = null;

export async function getFxRates(): Promise<FxRates> {
  const cached = getCache<FxRates>(CACHE_KEY);
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetchRates(PRIMARY);
      setCache(CACHE_KEY, r, TTL);
      return r;
    } catch {
      try {
        const r = await fetchRates(FALLBACK);
        setCache(CACHE_KEY, r, TTL);
        return r;
      } catch {
        return { USD: 1 } as FxRates;
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function fetchRates(url: string): Promise<FxRates> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { rates?: FxRates };
  if (!data.rates || typeof data.rates !== "object") throw new Error("Bad payload");
  return { USD: 1, ...data.rates };
}

/** Convert `amount` from `from` currency to `to` currency using USD-base rates. */
export function convert(
  amount: number,
  from: string | undefined,
  to: string,
  rates: FxRates,
): number {
  if (!isFinite(amount)) return 0;
  const f = (from || "USD").toUpperCase();
  const t = (to || "USD").toUpperCase();
  if (f === t) return amount;
  const fr = rates[f];
  const tr = rates[t];
  if (!fr || !tr) return amount; // fail soft: show raw
  // amount in USD = amount / fr, then * tr
  return (amount / fr) * tr;
}
