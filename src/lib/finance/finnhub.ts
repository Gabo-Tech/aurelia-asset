import { fetchJson, fetchWithFallback, getFinnhubKey } from "./client";
import type { PricePoint } from "../types";

function call<T>(rawUrl: string, hasUserKey: boolean): Promise<T> {
  // With a user key, try direct first. Native apps have no CORS wall.
  if (hasUserKey) return fetchJson<T>(rawUrl);
  return fetchWithFallback<T>(rawUrl, { preferDirect: true });
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
  toUnix: number,
): Promise<PricePoint[] | null> {
  const key = getFinnhubKey();
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
    symbol,
  )}&resolution=D&from=${fromUnix}&to=${toUnix}${key ? `&token=${key}` : ""}`;
  try {
    const data = await call<{ c?: number[]; t?: number[] }>(url, !!key);
    if (!data.c || !data.t) return null;
    return data.t.map((t, i) => ({ date: new Date(t * 1000), price: data.c![i]! }));
  } catch {
    return null;
  }
}
