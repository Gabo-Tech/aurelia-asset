import type { Holding, HoldingTransaction } from "@/lib/types";

export type Lot = {
  date: string;
  quantity: number;
  pricePerUnit: number;
  fees: number;
  currency?: string;
};

export type HoldingCostBasis = {
  holdingId: string;
  remainingLots: Lot[];
  /** Remaining quantity after FIFO sells. */
  quantity: number;
  /** Cost of remaining lots (incl. proportional fees). */
  costBasis: number;
  /** Market value at currentPrice. */
  marketValue: number;
  unrealizedGain: number;
  realizedGain: number;
};

/** FIFO cost basis from buy/sell transactions. Opening quantity (no txs) uses current/manual price. */
export function computeHoldingCostBasis(
  holding: Holding,
  transactions: HoldingTransaction[],
): HoldingCostBasis {
  const txs = transactions
    .filter((t) => t.holdingId === holding.id)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const lots: Lot[] = [];
  let realizedGain = 0;

  if (txs.length === 0) {
    const qty = Number(holding.quantity) || 0;
    const px = Number(holding.manualPrice ?? holding.currentPrice) || 0;
    if (qty > 0) {
      lots.push({
        date: "1970-01-01",
        quantity: qty,
        pricePerUnit: px,
        fees: 0,
        currency: holding.priceCurrency,
      });
    }
  } else {
    const opening = Number(holding.openingQuantity) || 0;
    if (opening > 0) {
      lots.push({
        date: "1970-01-01",
        quantity: opening,
        pricePerUnit: Number(holding.manualPrice ?? holding.currentPrice) || 0,
        fees: 0,
        currency: holding.priceCurrency,
      });
    }
    for (const t of txs) {
      const qty = Math.abs(Number(t.quantity) || 0);
      const px = Number(t.pricePerUnit) || 0;
      const fees = Number(t.fees) || 0;
      if (t.kind === "buy") {
        lots.push({
          date: t.date.slice(0, 10),
          quantity: qty,
          pricePerUnit: px,
          fees,
          currency: t.currency || holding.priceCurrency,
        });
      } else {
        let remaining = qty;
        const proceeds = qty * px - fees;
        let costRemoved = 0;
        while (remaining > 1e-12 && lots.length) {
          const lot = lots[0];
          const take = Math.min(lot.quantity, remaining);
          const lotCost = lot.pricePerUnit * take + (lot.fees * take) / Math.max(lot.quantity, 1e-12);
          costRemoved += lotCost;
          lot.quantity -= take;
          lot.fees = Math.max(0, lot.fees - (lot.fees * take) / Math.max(take + lot.quantity, 1e-12));
          remaining -= take;
          if (lot.quantity <= 1e-12) lots.shift();
        }
        realizedGain += proceeds - costRemoved;
      }
    }
  }

  const quantity = lots.reduce((s, l) => s + l.quantity, 0);
  const costBasis = lots.reduce(
    (s, l) => s + l.pricePerUnit * l.quantity + l.fees,
    0,
  );
  const marketValue = quantity * (Number(holding.currentPrice) || 0);
  return {
    holdingId: holding.id,
    remainingLots: lots,
    quantity,
    costBasis,
    marketValue,
    unrealizedGain: marketValue - costBasis,
    realizedGain,
  };
}

export function computePortfolioCostBasis(
  holdings: Holding[],
  transactions: HoldingTransaction[],
): {
  costBasis: number;
  marketValue: number;
  unrealizedGain: number;
  realizedGain: number;
  byHolding: HoldingCostBasis[];
} {
  const byHolding = holdings.map((h) => computeHoldingCostBasis(h, transactions));
  return {
    byHolding,
    costBasis: byHolding.reduce((s, h) => s + h.costBasis, 0),
    marketValue: byHolding.reduce((s, h) => s + h.marketValue, 0),
    unrealizedGain: byHolding.reduce((s, h) => s + h.unrealizedGain, 0),
    realizedGain: byHolding.reduce((s, h) => s + h.realizedGain, 0),
  };
}

/** Realized gains from sells whose date falls in [from, to] (ISO date strings). */
export function realizedGainsInRange(
  holdings: Holding[],
  transactions: HoldingTransaction[],
  from: string,
  to: string,
): number {
  // Re-run FIFO but only accumulate realized when sell date in range.
  let total = 0;
  for (const h of holdings) {
    const txs = transactions
      .filter((t) => t.holdingId === h.id)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const lots: Lot[] = [];
    const opening = txs.length ? Number(h.openingQuantity) || 0 : Number(h.quantity) || 0;
    if (opening > 0 && txs.length) {
      lots.push({
        date: "1970-01-01",
        quantity: opening,
        pricePerUnit: Number(h.manualPrice ?? h.currentPrice) || 0,
        fees: 0,
      });
    } else if (!txs.length && opening > 0) {
      continue;
    }
    for (const t of txs) {
      const qty = Math.abs(Number(t.quantity) || 0);
      const px = Number(t.pricePerUnit) || 0;
      const fees = Number(t.fees) || 0;
      if (t.kind === "buy") {
        lots.push({ date: t.date.slice(0, 10), quantity: qty, pricePerUnit: px, fees });
      } else {
        let remaining = qty;
        let costRemoved = 0;
        while (remaining > 1e-12 && lots.length) {
          const lot = lots[0];
          const take = Math.min(lot.quantity, remaining);
          costRemoved += lot.pricePerUnit * take + (lot.fees * take) / Math.max(lot.quantity, 1e-12);
          lot.quantity -= take;
          remaining -= take;
          if (lot.quantity <= 1e-12) lots.shift();
        }
        const day = t.date.slice(0, 10);
        if (day >= from && day <= to) {
          total += qty * px - fees - costRemoved;
        }
      }
    }
  }
  return total;
}

export function costBasisToTaxCsv(
  holdings: Holding[],
  transactions: HoldingTransaction[],
  year: number,
): string {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const rows = [["symbol", "name", "sellDate", "quantity", "proceeds", "costBasis", "realizedGain"]];
  for (const h of holdings) {
    const txs = transactions
      .filter((t) => t.holdingId === h.id)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    const lots: Lot[] = [];
    const opening = Number(h.openingQuantity) || 0;
    if (opening > 0) {
      lots.push({
        date: "1970-01-01",
        quantity: opening,
        pricePerUnit: Number(h.manualPrice ?? h.currentPrice) || 0,
        fees: 0,
      });
    }
    for (const t of txs) {
      const qty = Math.abs(Number(t.quantity) || 0);
      const px = Number(t.pricePerUnit) || 0;
      const fees = Number(t.fees) || 0;
      if (t.kind === "buy") {
        lots.push({ date: t.date.slice(0, 10), quantity: qty, pricePerUnit: px, fees });
      } else {
        let remaining = qty;
        let costRemoved = 0;
        while (remaining > 1e-12 && lots.length) {
          const lot = lots[0];
          const take = Math.min(lot.quantity, remaining);
          costRemoved += lot.pricePerUnit * take;
          lot.quantity -= take;
          remaining -= take;
          if (lot.quantity <= 1e-12) lots.shift();
        }
        const day = t.date.slice(0, 10);
        if (day >= from && day <= to) {
          const proceeds = qty * px - fees;
          rows.push([
            h.symbol,
            h.name,
            day,
            String(qty),
            proceeds.toFixed(2),
            costRemoved.toFixed(2),
            (proceeds - costRemoved).toFixed(2),
          ]);
        }
      }
    }
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
