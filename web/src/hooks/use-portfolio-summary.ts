import { useMemo } from "react";
import { useStore, useMoney } from "@/lib/store";
import {
  expandCashflows,
  valuesByEntry,
  liquidityImpact,
  cardDebtImpact,
} from "@/routes/cashflow";

export function usePortfolioSummary() {
  const { state } = useStore();
  const { toDisplay, mask, currency } = useMoney();
  const { holdings, cashflows } = state;
  const cards = state.creditCards ?? [];

  const portfolioTotal = useMemo(
    () =>
      holdings.reduce(
        (s, h) => s + toDisplay(h.quantity * h.currentPrice, h.priceCurrency),
        0,
      ),
    [holdings, toDisplay],
  );

  const cashflowBalance = useMemo(() => {
    const expanded = expandCashflows(cashflows, new Date());
    const values = valuesByEntry(expanded, toDisplay);
    let bal = 0;
    for (const e of expanded) {
      bal += liquidityImpact(e, values.get(e.id) ?? 0);
    }
    return bal;
  }, [cashflows, toDisplay]);

  const cardDebt = useMemo(() => {
    const expanded = expandCashflows(cashflows, new Date());
    const values = valuesByEntry(expanded, toDisplay);
    let total = 0;
    for (const e of expanded) {
      const v = values.get(e.id) ?? 0;
      for (const c of cards) total += cardDebtImpact(e, c.id, v);
    }
    return total;
  }, [cashflows, toDisplay, cards]);

  const netWorth = useMemo(
    () => portfolioTotal + cashflowBalance - cardDebt,
    [portfolioTotal, cashflowBalance, cardDebt],
  );

  const net30 = useMemo(() => {
    const now = new Date();
    const cutoff = now.getTime() - 30 * 86400000;
    const expanded = expandCashflows(cashflows, now);
    const values = valuesByEntry(expanded, toDisplay);
    let bal = 0;
    for (const e of expanded) {
      if (new Date(e.date).getTime() < cutoff) continue;
      bal += liquidityImpact(e, values.get(e.id) ?? 0);
    }
    return bal;
  }, [cashflows, toDisplay]);

  return {
    portfolioTotal,
    cashflowBalance,
    cardDebt,
    netWorth,
    net30,
    holdingsCount: holdings.length,
    mask,
    currency,
  };
}
