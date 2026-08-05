import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { usePortfolioSummary } from "@/hooks/use-portfolio-summary";
import { useStore, useMoney } from "@/lib/store";
import { pathMatches } from "@/components/shell/nav-config";
import type { ResolvedNavItem } from "@/components/shell/nav-config";

export function useMobileHeader(nav: ResolvedNavItem[], brand: string) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useTranslation();
  const { state } = useStore();
  const { mask, currency } = useMoney();
  const { netWorth, portfolioTotal, net30, holdingsCount } = usePortfolioSummary();

  const name = state.settings.displayName?.trim();

  if (pathMatches(pathname, "/dashboard")) {
    const title = name
      ? t("dashboard.greetingNamed", { name, defaultValue: `Hi ${name}` })
      : t("dashboard.greetingShort", { defaultValue: "Hi there" });
    return {
      title,
      subtitle: t("dashboard.headerNetWorth", {
        value: mask(netWorth, currency),
        defaultValue: `${mask(netWorth, currency)} net worth`,
      }),
    };
  }

  if (pathMatches(pathname, "/cashflow")) {
    const netLabel =
      net30 >= 0
        ? t("dashboard.net30Positive", {
            value: mask(Math.abs(net30), currency),
            defaultValue: `+${mask(Math.abs(net30), currency)} last 30 days`,
          })
        : t("dashboard.net30Negative", {
            value: mask(Math.abs(net30), currency),
            defaultValue: `-${mask(Math.abs(net30), currency)} last 30 days`,
          });
    return {
      title: t("nav.cashflow"),
      subtitle: netLabel,
    };
  }

  if (pathMatches(pathname, "/holdings")) {
    return {
      title: t("nav.holdings"),
      subtitle: t("holdings.headerSubtitle", {
        count: holdingsCount,
        value: mask(portfolioTotal, currency),
        defaultValue: `${holdingsCount} positions · ${mask(portfolioTotal, currency)}`,
      }),
    };
  }

  const match = nav.find((n) => pathMatches(pathname, n.to));
  return {
    title: match?.label || brand,
    subtitle: undefined as string | undefined,
  };
}
