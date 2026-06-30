import { fetchJson, fetchWithFallback, getFinnhubKey } from "./client";
import type { PricePoint } from "../types";

function call<T>(rawUrl: string, hasUserKey: boolean): Promise<T> {
  // With a user key, try direct first (CORS-allowed by Finnhub).
  // Without one, route through the same-origin proxy which injects the
  // server-side FINNHUB_API_KEY so the browser never sees it.
  if (hasUserKey) return fetchJson<T>(rawUrl);
  if (typeof window === "undefined") {
    return fetchWithFallback<T>(rawUrl, { preferDirect: false });
  }
  return fetch(`/api/finance-proxy?url=${encodeURIComponent(rawUrl)}`).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
}

export async function finnhubQuote(symbol: string): Promise<number | null> {
  const key = getFinnhubKey();
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}${
    key ? `&token=${key}` : ""
  }`;
  try {
    const data = await call<{ c?: number }>(url, !!key);
    return data.c ?? null;
  } catch {
    return null;
  }
}

export async function finnhubHistory(
  symbol: string,
  fromUnix: number,
  toUnix: number
): Promise<PricePoint[] | null> {
  const key = getFinnhubKey();
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
    symbol
  )}&resolution=D&from=${fromUnix}&to=${toUnix}${key ? `&token=${key}` : ""}`;
  try {
    const data = await call<{ s?: string; t?: number[]; c?: number[] }>(url, !!key);
    if (data.s !== "ok" || !data.t || !data.c) return null;
    return data.t.map((t, i) => ({ date: new Date(t * 1000), price: data.c![i] }));
  } catch {
    return null;
  }
}
