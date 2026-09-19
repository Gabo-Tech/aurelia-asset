import { useEffect, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO, subMonths } from "date-fns";
import { useTranslation } from "react-i18next";
import { ChartFrame } from "@/components/chart-frame";
import { useStore, useMoney } from "@/lib/store";
import { usePortfolioSummary } from "@/hooks/use-portfolio-summary";
import { formatMoney } from "@/lib/format";

export function NetWorthTimeline() {
  const { t } = useTranslation();
  const { state, recordNetWorthSnapshot } = useStore();
  const { currency, privacy, MASK } = useMoney();
  const summary = usePortfolioSummary();

  useEffect(() => {
    if (!summary) return;
    recordNetWorthSnapshot({
      portfolio: summary.portfolioTotal,
      liquidity: summary.cashflowBalance,
      debt: summary.cardDebt,
      netWorth: summary.netWorth,
      currency: summary.currency,
    });
  }, [
    summary.portfolioTotal,
    summary.cashflowBalance,
    summary.cardDebt,
    summary.netWorth,
    summary.currency,
    recordNetWorthSnapshot,
  ]);

  const data = useMemo(() => {
    const from = format(subMonths(new Date(), 24), "yyyy-MM-dd");
    return (state.netWorthSnapshots ?? [])
      .filter((s) => s.date >= from)
      .map((s) => ({
        date: s.date,
        label: format(parseISO(s.date), "MMM d"),
        netWorth: s.netWorth,
        portfolio: s.portfolio,
        liquidity: s.liquidity,
        debt: s.debt,
      }));
  }, [state.netWorthSnapshots]);

  if (data.length < 2) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
        {t("dashboard.netWorthTimeline.empty", {
          defaultValue:
            "Net-worth timeline will fill in as you use the app. Today’s snapshot is saved automatically.",
        })}
      </div>
    );
  }

  return (
    <ChartFrame
      filename="net-worth"
      title={t("dashboard.netWorthTimeline.title", { defaultValue: "Net worth over time" })}
    >
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              width={56}
              tickFormatter={(v) =>
                privacy ? "••" : formatMoney(Number(v), currency).replace(/\.00$/, "")
              }
            />
            <Tooltip
              formatter={(value: number) =>
                privacy ? MASK : formatMoney(Number(value), currency)
              }
              labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              name={t("dashboard.netWorth", { defaultValue: "Net worth" })}
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
