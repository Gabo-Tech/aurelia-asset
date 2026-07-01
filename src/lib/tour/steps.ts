import type { TFunction } from "i18next";
import type { TourStepDef } from "./driver";

export function buildTourSteps(t: TFunction, isMobile: boolean): TourStepDef[] {
  const tk = (k: string) => t(`tour.steps.${k}.title`);
  const bk = (k: string) => t(`tour.steps.${k}.body`);

  const step = (
    key: string,
    selector: string | undefined,
    route?: string,
    side: "top" | "bottom" | "left" | "right" = "bottom",
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

  // On mobile the sticky header sits at top and the bottom nav sits at bottom,
  // so top-bar controls read best with a "bottom" popover, and page content
  // reads best with "top" (popover above the element, away from bottom nav).
  // These are hints only - driver.ts picks the best side dynamically per
  // viewport based on available space, and never lets the popover overlap
  // the highlighted element.
  const pageSide: "top" | "bottom" = isMobile ? "top" : "bottom";
  const contentTopSide: "top" | "bottom" = "bottom";

  const steps: TourStepDef[] = [
    center("welcome", "/dashboard"),
    // Shell
    !isMobile
      ? step("sidebar", '[data-tour="sidebar-nav"]', "/dashboard", "right")
      : step("mobileNav", '[data-tour="bottom-nav"]', "/dashboard", "top"),
    step("theme", '[data-tour="theme-toggle"]', "/dashboard", "bottom"),
    step("privacy", '[data-tour="privacy-toggle"]', "/dashboard", "bottom"),

    // Dashboard
    step("dashStats", '[data-tour="dash-stats"]', "/dashboard", pageSide),
    step("dashAllocation", '[data-tour="dash-allocation"]', "/dashboard", contentTopSide),
    step("dashBreakdown", '[data-tour="dash-breakdown"]', "/dashboard", contentTopSide),

    // Holdings
    step("holdingsAdd", '[data-tour="holdings-add"]', "/holdings", pageSide),
    step("holdingsFilters", '[data-tour="holdings-filters"]', "/holdings", pageSide),
    step("holdingsTable", '[data-tour="holdings-table"]', "/holdings", contentTopSide),
    step("holdingsCharts", '[data-tour="holdings-charts"]', "/holdings", contentTopSide),
    step("holdingsTx", '[data-tour="holdings-tx"]', "/holdings", contentTopSide),

    // Performance
    step("perfPeriod", '[data-tour="perf-period"]', "/performance", pageSide),
    step("perfAssets", '[data-tour="perf-assets"]', "/performance", pageSide),
    step("perfChart", '[data-tour="perf-chart"]', "/performance", contentTopSide),
    step("perfReturns", '[data-tour="perf-returns"]', "/performance", contentTopSide),

    // Cashflow
    step("cfAdd", '[data-tour="cf-add"]', "/cashflow", pageSide),
    step("cfSankey", '[data-tour="cf-sankey"]', "/cashflow", contentTopSide),
    step("cfEntries", '[data-tour="cf-entries"]', "/cashflow", contentTopSide),
    step("cfCards", '[data-tour="cf-cards"]', "/cashflow", contentTopSide),

    // Settings
    step("setApi", '[data-tour="settings-api"]', "/settings", pageSide),
    step("setLanguage", '[data-tour="settings-language"]', "/settings", pageSide),
    step("setData", '[data-tour="settings-data"]', "/settings", contentTopSide),

    center("finish", "/dashboard"),
  ];

  return steps;
}
