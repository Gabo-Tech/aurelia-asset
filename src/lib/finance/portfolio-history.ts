import type { Holding, HoldingTransaction, PricePoint } from "../types";

export type PortfolioHistoryPoint = {
  date: number;
  total: number;
  perAsset: Record<string, number>;
  perAssetPrice: Record<string, number>;
};

export type PeriodId = "1D" | "7D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "10Y" | "Max";

const PERIOD_DAYS: Record<Exclude<PeriodId, "YTD" | "Max">, number> = {
  "1D": 1,
  "7D": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "5Y": 1825,
  "10Y": 3650,
};

export type AssetPriceSeries = {
  daily: PricePoint[];
  intraday: PricePoint[];
};

export function toUtcDayMs(value: string | number | Date) {
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** Quantity held on each portfolio date, accounting for buy/sell transactions. */
export function buildQuantityByDate(
  dates: Array<{ date: number }>,
  holdings: Array<{ id: string; quantity: number; openingQuantity?: number }>,
  transactions: Array<{ holdingId: string; kind: "buy" | "sell"; date: string; quantity: number }>,
) {
  const txsByHolding: Record<
    string,
    Array<{ day: number; kind: "buy" | "sell"; quantity: number }>
  > = {};
  for (const h of holdings) txsByHolding[h.id] = [];
  for (const t of transactions) {
    if (txsByHolding[t.holdingId]) {
      txsByHolding[t.holdingId].push({
        day: toUtcDayMs(t.date),
        kind: t.kind,
        quantity: t.quantity,
      });
    }
  }
  for (const id of Object.keys(txsByHolding)) txsByHolding[id].sort((a, b) => a.day - b.day);

  const qty: Record<string, number> = {};
  const idx: Record<string, number> = {};
  for (const h of holdings) {
    qty[h.id] = txsByHolding[h.id].length > 0 ? (h.openingQuantity ?? 0) : h.quantity;
    idx[h.id] = 0;
  }

  const byDate = new Map<number, Record<string, number>>();
  for (const d of dates) {
    const row: Record<string, number> = {};
    for (const h of holdings) {
      const list = txsByHolding[h.id];
      while (idx[h.id] < list.length && list[idx[h.id]].day <= d.date) {
        const t = list[idx[h.id]];
        qty[h.id] = Math.max(0, qty[h.id] + (t.kind === "buy" ? 1 : -1) * t.quantity);
        idx[h.id]++;
      }
      row[h.id] = qty[h.id];
    }
    byDate.set(d.date, row);
  }
  return byDate;
}

export function slicePortfolioByPeriod(
  points: PortfolioHistoryPoint[] | undefined,
  period: PeriodId,
): PortfolioHistoryPoint[] | undefined {
  if (!points) return undefined;
  if (period === "Max") return points;
  if (period === "YTD") {
    const start = new Date(new Date().getFullYear(), 0, 1).getTime();
    return points.filter((d) => d.date >= start);
  }
  const days = PERIOD_DAYS[period as Exclude<PeriodId, "YTD" | "Max">];
  if (!days || days >= 36500) return points;
  const cutoff = Date.now() - days * 86400000;
  return points.filter((d) => d.date >= cutoff);
}

function forwardFillDaily(
  holdings: Holding[],
  priceSeries: Record<string, AssetPriceSeries>,
): Array<{ h: Holding; map: Map<number, number> }> {
  const dayKeys = new Set<number>();
  for (const h of holdings) {
    for (const pt of priceSeries[h.id]?.daily ?? []) {
      const d = new Date(pt.date);
      d.setUTCHours(0, 0, 0, 0);
      dayKeys.add(d.getTime());
    }
  }
  const days = Array.from(dayKeys).sort((a, b) => a - b);
  if (!days.length) return [];

  return holdings.map((h) => {
    const sorted = [...(priceSeries[h.id]?.daily ?? [])].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
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
}

/** Build daily portfolio value series from cached per-asset prices. */
export function composePortfolioDaily(
  holdings: Holding[],
  transactions: HoldingTransaction[],
  priceSeries: Record<string, AssetPriceSeries>,
): PortfolioHistoryPoint[] {
  if (!holdings.length) return [];

  const filled = forwardFillDaily(holdings, priceSeries);
  const dayKeys = new Set<number>();
  for (const { map } of filled) {
    for (const day of map.keys()) dayKeys.add(day);
  }
  const days = Array.from(dayKeys).sort((a, b) => a - b);
  if (!days.length) return [];

  const today = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  })();
  if (days[days.length - 1] !== today) days.push(today);

  const quantities = buildQuantityByDate(
    days.map((date) => ({ date })),
    holdings,
    transactions,
  );

  return days.map((day, idx) => {
    const isLast = idx === days.length - 1;
    const perAsset: Record<string, number> = {};
    const perAssetPrice: Record<string, number> = {};
    let total = 0;
    for (const { h, map } of filled) {
      const historical = map.get(day);
      const price = isLast && h.currentPrice ? h.currentPrice : (historical ?? h.currentPrice ?? 0);
      const quantity = quantities.get(day)?.[h.id] ?? h.quantity;
      const v = price * quantity;
      perAssetPrice[h.id] = price;
      perAsset[h.id] = v;
      total += v;
    }
    return { date: day, total, perAsset, perAssetPrice };
  });
}

/** Build intraday portfolio series from cached per-asset prices (1D view). */
export function composePortfolioIntraday(
  holdings: Holding[],
  transactions: HoldingTransaction[],
  priceSeries: Record<string, AssetPriceSeries>,
): PortfolioHistoryPoint[] {
  if (!holdings.length) return [];

  const stamps = new Set<number>();
  for (const h of holdings) {
    for (const pt of priceSeries[h.id]?.intraday ?? []) {
      stamps.add(pt.date.getTime());
    }
  }
  if (!stamps.size) return [];

  const times = Array.from(stamps).sort((a, b) => a - b);
  const dayBuckets = times.map((t) => ({ date: t }));
  const quantities = buildQuantityByDate(dayBuckets, holdings, transactions);

  const filled = holdings.map((h) => {
    const sorted = [...(priceSeries[h.id]?.intraday ?? [])].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    const map = new Map<number, number>();
    let j = 0;
    let last = sorted[0]?.price ?? h.currentPrice ?? 0;
    for (const t of times) {
      while (j < sorted.length && sorted[j].date.getTime() <= t) {
        last = sorted[j].price;
        j++;
      }
      map.set(t, last);
    }
    return { h, map };
  });

  const todayStart = toUtcDayMs(Date.now());

  return times.map((t, idx) => {
    const isLast = idx === times.length - 1;
    const qtyDay = toUtcDayMs(t);
    const perAsset: Record<string, number> = {};
    const perAssetPrice: Record<string, number> = {};
    let total = 0;
    for (const { h, map } of filled) {
      const historical = map.get(t);
      const price =
        isLast && h.currentPrice && qtyDay >= todayStart
          ? h.currentPrice
          : (historical ?? h.currentPrice ?? 0);
      const quantity = quantities.get(t)?.[h.id] ?? h.quantity;
      const v = price * quantity;
      perAssetPrice[h.id] = price;
      perAsset[h.id] = v;
      total += v;
    }
    return { date: t, total, perAsset, perAssetPrice };
  });
}
