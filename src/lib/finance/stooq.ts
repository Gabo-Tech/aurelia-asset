import { fetchWithFallback } from "./client";
import { getCache, setCache } from "./cache";
import type { PricePoint } from "../types";

// Stooq serves daily OHLCV as CSV. It generally requires US tickers to be
// suffixed with `.us` (e.g. AAPL.US). We try the user's symbol first, then
// `<sym>.us` as a fallback for bare tickers.
function variants(symbol: string): string[] {
  const s = symbol.toLowerCase().trim();
  const v = [s];
  if (!s.includes(".") && !s.includes("-") && !s.includes("=")) v.push(`${s}.us`);
  return v;
}

function parseCsv(csv: string): PricePoint[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const header = lines[0].toLowerCase();
  if (!header.includes("date") || !header.includes("close")) return [];
  const cols = header.split(",");
  const dateIdx = cols.indexOf("date");
  const closeIdx = cols.indexOf("close");
  if (dateIdx < 0 || closeIdx < 0) return [];
  const out: PricePoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const d = parts[dateIdx];
    const c = parseFloat(parts[closeIdx]);
    if (!d || !isFinite(c)) continue;
    const t = Date.parse(d);
    if (!isFinite(t)) continue;
    out.push({ date: new Date(t), price: c });
  }
  return out;
}

async function fetchOne(sym: string): Promise<PricePoint[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  const csv = await fetchWithFallback<string>(url, { as: "text", preferDirect: true });
  // Stooq returns the literal string "No data" on miss.
  if (!csv || /^no data/i.test(csv.trim())) return [];
  return parseCsv(csv);
}

export async function getStooqHistory(symbol: string): Promise<PricePoint[]> {
  const key = `st:hist:${symbol.toLowerCase()}`;
  const cached = getCache<{ t: number; p: number }[]>(key);
  if (cached) return cached.map((x) => ({ date: new Date(x.t), price: x.p }));
  for (const v of variants(symbol)) {
    try {
      const points = await fetchOne(v);
      if (points.length) {
        setCache(
          key,
          points.map((x) => ({ t: x.date.getTime(), p: x.price })),
          24 * 60 * 60 * 1000,
        );
        return points;
      }
    } catch {}
  }
  return [];
}

export async function getStooqQuote(symbol: string): Promise<number | null> {
  const h = await getStooqHistory(symbol);
  return h.length ? h[h.length - 1].price : null;
}
