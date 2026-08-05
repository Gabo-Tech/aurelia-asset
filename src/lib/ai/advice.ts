/**
 * Personalised financial guidance from the user's real data.
 *
 * Used by the NLU engine for deterministic advice and referenced in the LLM
 * system prompt. A responsibility disclaimer is prepended by the orchestrator
 * on the first advice request only.
 */

import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n-t";
import type { FinanceContext } from "./context";

const ADVICE_HINT =
  /\b(advice|tips?|financial advice|money advice|saving tips?|save money|reduce (spending|expenses)|cut (back|costs|spending)|how (can|do|should) i (save|improve|earn|make more)|should i invest|invest more|am i saving enough|too much cash|sitting on cash|what should i do with my money|help me (save|invest|improve)|increase (my )?income|grow my (money|wealth)|build wealth|improve my finances|better job|side (hustle|gig|income)|personal finance|coach me|analyse my (finances|spending|money)|analyze my (finances|spending|money)|where (can|should) i (cut|save)|financial health|money tips|finanzberatung|spartipps?|geldtipps?|wie kann ich sparen|einkommen erh[oö]hen|besser(en)? job|consejo financiero|consejos? de ahorro|c[oó]mo (puedo|debo) ahorrar|aumentar (mis )?ingresos|conselho financeiro|conselhos?|como (posso|devo) poupar|aumentar (o )?rendimento|financieel advies|spaartips?|hoe kan ik sparen|inkomen verhogen|consell financer|consells? d'?estalvi|com (puc|he de) estalviar|augmentar (els )?ingressos|gib mir (tipps?|beratung)|dame consejo|d[aá]-me conselho|geef me advies|dona'?m consell)\b/i;

/** True when the user is asking for financial guidance (not just a spending query). */
export function isAdviceRequest(text: string): boolean {
  return ADVICE_HINT.test(text.trim().toLowerCase());
}

function money(ctx: FinanceContext, n: number): string {
  return formatMoney(n, ctx.currency);
}

function pct(n: number): number {
  return Math.round(n * 100);
}

/**
 * Build 3–6 concrete suggestions from the user's numbers.
 * Disclaimer is added separately by `provider.ts` when needed.
 */
export function buildFinancialAdvice(ctx: FinanceContext): string {
  const tips: string[] = [];
  const { month, budget, wealth: w, goals } = ctx;

  const hasData =
    month.totalIncome > 0 ||
    month.totalExpense > 0 ||
    w.portfolioTotal > 0 ||
    w.liquidityBalance !== 0;

  if (!hasData) {
    return t("assistant.backend.advice.empty");
  }

  tips.push(t("assistant.backend.advice.intro"));

  // Cashflow & savings
  if (month.net < 0) {
    tips.push(
      t("assistant.backend.advice.overspending", {
        amount: money(ctx, -month.net),
        category:
          month.topExpenseCategories[0]?.name ?? t("assistant.backend.advice.unknownCategory"),
      }),
    );
  } else if (month.net > 0) {
    tips.push(
      t("assistant.backend.advice.netPositive", {
        amount: money(ctx, month.net),
      }),
    );
  }

  if (w.savingsRate != null && month.totalIncome > 0) {
    if (w.savingsRate < 0.15) {
      tips.push(
        t("assistant.backend.advice.lowSavings", {
          rate: pct(w.savingsRate),
          amount: money(
            ctx,
            Math.max(month.totalIncome * 0.15 - month.net, 0) || month.totalIncome * 0.05,
          ),
        }),
      );
    } else if (w.savingsRate >= 0.2) {
      tips.push(
        t("assistant.backend.advice.strongSavings", {
          rate: pct(w.savingsRate),
        }),
      );
    }
  }

  if (month.totalIncome > 0 && month.totalExpense / month.totalIncome > 0.9) {
    tips.push(
      t("assistant.backend.advice.lowIncome", {
        pct: pct(month.totalExpense / month.totalIncome),
      }),
    );
  } else if (month.totalIncome > 0 && month.totalExpense / month.totalIncome > 0.75) {
    tips.push(
      t("assistant.backend.advice.tightCashflow", {
        pct: pct(month.totalExpense / month.totalIncome),
      }),
    );
  }

  if (month.totalIncome > 0 && month.net > 0 && month.net < month.totalIncome * 0.1) {
    tips.push(t("assistant.backend.advice.growIncome"));
  }

  // Second-largest category if meaningful
  const second = month.topExpenseCategories[1];
  if (second && month.totalExpense > 0) {
    const share = second.amount / month.totalExpense;
    if (share >= 0.15) {
      tips.push(
        t("assistant.backend.advice.secondCategory", {
          name: second.name,
          pct: pct(share),
          amount: money(ctx, second.amount),
        }),
      );
    }
  }

  const top = month.topExpenseCategories[0];
  if (top && month.totalExpense > 0) {
    const share = top.amount / month.totalExpense;
    if (share >= 0.25) {
      tips.push(
        t("assistant.backend.advice.topCategory", {
          name: top.name,
          pct: pct(share),
          amount: money(ctx, top.amount),
          savings: money(ctx, top.amount * 0.1),
        }),
      );
    }
  }

  if (ctx.loans.length) {
    const costly = [...ctx.loans].sort((a, b) => b.apr - a.apr)[0];
    if (costly && costly.apr >= 6) {
      tips.push(
        t("assistant.backend.advice.highAprLoan", {
          name: costly.name,
          apr: costly.apr,
          principal: money(ctx, costly.principal),
        }),
      );
    }
  }

  // Wealth allocation
  const monthlyBurn = month.totalExpense > 0 ? month.totalExpense : 1;
  const emergencyTarget = monthlyBurn * 6;

  if (ctx.holdings.length === 0 && w.liquidityBalance > monthlyBurn * 3) {
    tips.push(t("assistant.backend.advice.startInvesting"));
  }

  if (w.cardDebt > monthlyBurn * 0.5) {
    tips.push(
      t("assistant.backend.advice.highDebt", {
        debt: money(ctx, w.cardDebt),
      }),
    );
  }

  if (w.liquidityBalance > emergencyTarget && w.netWorth > 0) {
    const months = Math.round(w.liquidityBalance / monthlyBurn);
    const reserve = money(ctx, emergencyTarget);
    const investable = money(ctx, Math.max(w.liquidityBalance - emergencyTarget, 0));
    tips.push(
      t("assistant.backend.advice.excessCash", {
        liquidity: money(ctx, w.liquidityBalance),
        months,
        reserve,
        investable,
      }),
    );
  }

  const liquidWealth = w.liquidityBalance + w.cashLikeHoldings;
  const totalWealth = Math.max(w.netWorth, liquidWealth + w.investedTotal, 1);
  if (
    liquidWealth > w.investedTotal &&
    liquidWealth > monthlyBurn * 3 &&
    w.investedTotal < liquidWealth * 0.5
  ) {
    tips.push(
      t("assistant.backend.advice.lowInvestment", {
        pct: pct(liquidWealth / totalWealth),
        liquidity: money(ctx, liquidWealth),
        invested: money(ctx, w.investedTotal),
      }),
    );
  } else if (w.investedTotal > 0 && w.investedTotal >= liquidWealth) {
    tips.push(
      t("assistant.backend.advice.balancedAllocation", {
        invested: money(ctx, w.investedTotal),
        liquid: money(ctx, liquidWealth),
      }),
    );
  }

  // Budget
  if (budget) {
    const over = budget.lines.filter((l) => l.limit > 0 && l.spent > l.limit);
    if (over.length) {
      tips.push(
        t("assistant.backend.advice.overBudget", {
          categories: over.map((l) => l.label).join(", "),
        }),
      );
    } else if (budget.totalLimit > 0) {
      tips.push(
        t("assistant.backend.advice.onTrack", {
          plan: budget.planName,
          limit: money(ctx, budget.totalLimit),
        }),
      );
    }
  }

  // Goals
  for (const g of goals.slice(0, 2)) {
    if (g.target <= 0) continue;
    const progress = g.current / g.target;
    if (progress >= 0.75) {
      tips.push(
        t("assistant.backend.advice.goalOnTrack", {
          name: g.name,
          pct: pct(progress),
          current: money(ctx, g.current),
          target: money(ctx, g.target),
        }),
      );
    } else if (progress > 0 && progress < 0.5) {
      const remaining = g.target - g.current;
      tips.push(
        t("assistant.backend.advice.goalBehind", {
          name: g.name,
          pct: pct(progress),
          current: money(ctx, g.current),
          target: money(ctx, g.target),
          monthly: money(ctx, remaining / 12),
        }),
      );
    }
  }

  if (tips.length <= 1) {
    tips.push(t("assistant.backend.advice.keepTracking"));
  }

  // Keep advice scannable: intro + up to 5 tips.
  const body = tips[0] === t("assistant.backend.advice.intro") ? tips.slice(0, 6) : tips.slice(0, 5);
  return body.map((line) => `• ${line}`).join("\n");
}

/** Prepend the one-time responsibility disclaimer. */
export function withAdviceDisclaimer(reply: string): string {
  return `${t("assistant.backend.advice.disclaimer")}\n\n${reply}`;
}
