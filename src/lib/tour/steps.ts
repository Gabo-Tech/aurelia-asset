import type { TFunction } from "i18next";
import type { TourStepDef } from "./driver";

export type TourStepOptions = {
  assistantEnabled: boolean;
};

async function activatePlanTab(tab: string) {
  const el = document.querySelector<HTMLElement>(`[data-tour-tab="${tab}"]`);
  el?.click();
  await new Promise((r) => window.setTimeout(r, 180));
}

async function expandCashflowBreakdown() {
  const content = document.querySelector('[data-tour="cf-breakdown"]');
  // Collapsible content is hidden when closed (no client rects / not visible).
  const alreadyOpen =
    content instanceof HTMLElement &&
    content.getClientRects().length > 0 &&
    getComputedStyle(content).display !== "none";
  if (alreadyOpen) return;
  const trigger = document.querySelector<HTMLElement>('[data-tour="cf-breakdown-trigger"]');
  trigger?.click();
  await new Promise((r) => window.setTimeout(r, 200));
}

export function buildTourSteps(
  t: TFunction,
  isMobile: boolean,
  opts: TourStepOptions = { assistantEnabled: true },
): TourStepDef[] {
  const tk = (k: string) => t(`tour.steps.${k}.title`);
  const bk = (k: string) => t(`tour.steps.${k}.body`);

  const step = (
    key: string,
    selector: string | undefined,
    route?: string,
    side: "top" | "bottom" | "left" | "right" = "bottom",
    prepare?: () => void | Promise<void>,
  ): TourStepDef => ({
    element: selector,
    selector,
    route,
    prepare,
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

  // Prefer popover below the highlight so we scroll the block toward the upper
  // half and park the modal under it (works on both mobile and desktop).
  const pageSide: "top" | "bottom" = "bottom";
  const contentTopSide: "top" | "bottom" = "bottom";

  const steps: TourStepDef[] = [
    center("welcome", "/dashboard"),

    // Shell
    !isMobile
      ? step("sidebar", '[data-tour="sidebar-nav"]', "/dashboard", "right")
      : step("mobileNav", '[data-tour="bottom-nav"]', "/dashboard", "top"),
    step("tourLauncher", '[data-tour="tour-launcher"]', undefined, "bottom"),
    step("theme", '[data-tour="theme-toggle"]', undefined, "bottom"),
    step("privacy", '[data-tour="privacy-toggle"]', undefined, "bottom"),

    // Dashboard
    step("dashStats", '[data-tour="dash-stats"]', "/dashboard", pageSide),
    step("dashQuickActions", '[data-tour="dash-quick-actions"]', "/dashboard", pageSide),
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

    // Cashflow (top-to-bottom page order)
    step("cfSummary", '[data-tour="cf-summary"]', "/cashflow", pageSide),
    step("cfAdd", '[data-tour="cf-add"]', "/cashflow", pageSide),
    step("cfCards", '[data-tour="cf-cards"]', "/cashflow", contentTopSide),
    step("cfSankey", '[data-tour="cf-sankey"]', "/cashflow", contentTopSide),
    step(
      "cfBreakdown",
      '[data-tour="cf-breakdown"]',
      "/cashflow",
      contentTopSide,
      expandCashflowBreakdown,
    ),
    step("cfEntries", '[data-tour="cf-entries"]', "/cashflow", contentTopSide),

    // Planning
    step("planTabs", '[data-tour="plan-tabs"]', "/planning", pageSide),
    step("planForecast", '[data-tour="plan-forecast"]', "/planning", contentTopSide, () =>
      activatePlanTab("forecast"),
    ),
    step("planBudgets", '[data-tour="plan-budgets"]', "/planning", contentTopSide, () =>
      activatePlanTab("budgets"),
    ),
    step("planGoals", '[data-tour="plan-goals"]', "/planning", contentTopSide, () =>
      activatePlanTab("goals"),
    ),
    step("planLoans", '[data-tour="plan-loans"]', "/planning", contentTopSide, () =>
      activatePlanTab("loans"),
    ),
  ];

  // Assistant: full steps when enabled; otherwise a single Settings tip later.
  if (opts.assistantEnabled) {
    steps.push(
      center("assistantIntro", "/assistant"),
      step("assistantChat", '[data-tour="assistant-chat"]', "/assistant", contentTopSide),
      step("assistantInput", '[data-tour="assistant-input"]', "/assistant", "top"),
    );
  }

  // Settings
  steps.push(
    step("setApi", '[data-tour="settings-api"]', "/settings", pageSide),
    step("settingsAi", '[data-tour="settings-ai"]', "/settings", pageSide),
    step("setLanguage", '[data-tour="settings-language"]', "/settings", pageSide),
    step("setData", '[data-tour="settings-data"]', "/settings", contentTopSide),
  );

  steps.push(center("finish", "/dashboard"));

  return steps;
}
