import type { TFunction } from "i18next";
import type { TourStepDef } from "./driver";

export function buildTourSteps(t: TFunction, isMobile: boolean): TourStepDef[] {
  const tk = (k: string) => t(`tour.steps.${k}.title`);
  const bk = (k: string) => t(`tour.steps.${k}.body`);

  const step = (
    key: string,
    selector: string | undefined,
    route?: string,
    side: "top" | "bottom" | "left" | "right" | "over" = "bottom",
  ): TourStepDef => ({
    element: selector,
    selector,
    route,
    popover: {
      title: tk(key),
      description: bk(key),
      side,
      align: "center",
    },
  });

  const center = (key: string, route?: string): TourStepDef => ({
    route,
    popover: {
      title: tk(key),
      description: bk(key),
    },
  });

  const steps: TourStepDef[] = [
    center("welcome", "/dashboard"),
    // Shell
    !isMobile
      ? step("sidebar", '[data-tour="sidebar-nav"]', "/dashboard", "right")
      : step("mobileNav", '[data-tour="bottom-nav"]', "/dashboard", "top"),
    step("theme", '[data-tour="theme-toggle"]', "/dashboard", "bottom"),
    step("privacy", '[data-tour="privacy-toggle"]', "/dashboard", "bottom"),

    // Dashboard
    step("dashStats", '[data-tour="dash-stats"]', "/dashboard", "bottom"),
    step("dashAllocation", '[data-tour="dash-allocation"]', "/dashboard", "top"),
    step("dashBreakdown", '[data-tour="dash-breakdown"]', "/dashboard", "top"),

    // Holdings
    step("holdingsAdd", '[data-tour="holdings-add"]', "/holdings", "bottom"),
    step("holdingsFilters", '[data-tour="holdings-filters"]', "/holdings", "bottom"),
    step("holdingsTable", '[data-tour="holdings-table"]', "/holdings", "top"),
    step("holdingsCharts", '[data-tour="holdings-charts"]', "/holdings", "top"),
    step("holdingsTx", '[data-tour="holdings-tx"]', "/holdings", "top"),

    // Performance
    step("perfPeriod", '[data-tour="perf-period"]', "/performance", "bottom"),
    step("perfAssets", '[data-tour="perf-assets"]', "/performance", "bottom"),
    step("perfChart", '[data-tour="perf-chart"]', "/performance", "top"),
    step("perfReturns", '[data-tour="perf-returns"]', "/performance", "top"),

    // Cashflow
    step("cfAdd", '[data-tour="cf-add"]', "/cashflow", "bottom"),
    step("cfCategories", '[data-tour="cf-categories"]', "/cashflow", "bottom"),
    step("cfRecurring", '[data-tour="cf-recurring"]', "/cashflow", "bottom"),
    step("cfSankey", '[data-tour="cf-sankey"]', "/cashflow", "top"),
    step("cfEntries", '[data-tour="cf-entries"]', "/cashflow", "top"),
    step("cfCards", '[data-tour="cf-cards"]', "/cashflow", "top"),
    step("cfLoans", '[data-tour="cf-loans"]', "/cashflow", "top"),
    step("cfTransfers", '[data-tour="cf-transfers"]', "/cashflow", "top"),
    step("cfExport", '[data-tour="cf-export"]', "/cashflow", "top"),

    // Settings
    step("setCurrency", '[data-tour="set-currency"]', "/settings", "bottom"),
    step("setLanguage", '[data-tour="set-language"]', "/settings", "bottom"),
    step("setProxy", '[data-tour="set-proxy"]', "/settings", "bottom"),
    step("setData", '[data-tour="set-data"]', "/settings", "top"),
    step("setTour", '[data-tour="set-tour"]', "/settings", "top"),

    center("finish", "/dashboard"),
  ];

  // Filter out steps whose selector is missing on mobile (where some are hidden)
  return steps;
}
