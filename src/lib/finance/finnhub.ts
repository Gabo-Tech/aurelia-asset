import { fetchJson, getFinnhubKey } from "./client";
import type { PricePoint } from "../types";

export async function finnhubQuote(symbol: string): Promise<number | null> {
  const key = getFinnhubKey();
  if (!key) return null;
  try {
    const data = await fetchJson<{ c?: number }>(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`
    );
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
  if (!key) return null;
  try {
    const data = await fetchJson<{ s?: string; t?: number[]; c?: number[] }>(
      `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
        symbol
      )}&resolution=D&from=${fromUnix}&to=${toUnix}&token=${key}`
    );
    if (data.s !== "ok" || !data.t || !data.c) return null;
    return data.t.map((t, i) => ({ date: new Date(t * 1000), price: data.c![i] }));
  } catch {
    return null;
  }
}
