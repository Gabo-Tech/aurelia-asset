import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  ArrowLeftRight,
  Target,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { useStore, useFxReady } from "@/lib/store";
import { SponsorBanner } from "./sponsor-banner";
import { PageLoader } from "./page-loader";
import { AiModelSetupDialog } from "./ai-model-setup-dialog";
import { usePrefetchPortfolioHistory } from "@/hooks/use-portfolio-history";
import { githubSourceUrl } from "@/lib/site-config";
import { DesktopSidebar } from "./shell/desktop-sidebar";
import { MobileHeader } from "./shell/mobile-header";
import { BottomTabBar } from "./shell/bottom-tab-bar";
import { pageTitleForPath, type NavItemDef } from "./shell/nav-config";
import { cn } from "@/lib/utils";

const navItems: NavItemDef[] = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard, tier: "primary" },
  { to: "/holdings", key: "holdings", icon: Wallet, tier: "primary" },
  { to: "/performance", key: "performance", icon: TrendingUp, tier: "primary" },
  { to: "/cashflow", key: "cashflow", icon: ArrowLeftRight, tier: "primary" },
  { to: "/planning", key: "planning", icon: Target, tier: "primary" },
  { to: "/assistant", key: "assistant", icon: Sparkles, tier: "secondary" },
  { to: "/settings", key: "settings", icon: SettingsIcon, tier: "secondary" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNavigating = useRouterState({
    select: (s) => s.isLoading || s.isTransitioning || s.status === "pending",
  });
  const { hydrated, state } = useStore();
  usePrefetchPortfolioHistory(state.holdings, hydrated);
  const fxReady = useFxReady();
  const ready = hydrated && fxReady && !isNavigating;
  const assistantEnabled = state.settings.aiAssistantEnabled !== false;
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const nav = navItems
    .filter((item) => item.key !== "assistant" || assistantEnabled)
    .map((n) => ({
      ...n,
      label: mounted ? t(`nav.${n.key}`) : "",
      shortLabel: mounted ? t(`nav.short.${n.key}`) : "",
    }));

  const brand = mounted ? t("shell.brand") : "";
  const brandTagline = mounted ? t("shell.brandTagline") : "";
  const pageTitle = pageTitleForPath(pathname, nav, brand);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1400px] flex-col lg:flex-row 2xl:max-w-[1600px] 3xl:max-w-[1840px] 4xl:max-w-[2200px]">
        <DesktopSidebar pathname={pathname} nav={nav} brand={brand} brandTagline={brandTagline} />

        <MobileHeader pageTitle={pageTitle} />

        <main className="flex-1 min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12 flex flex-col min-h-[100dvh] lg:min-h-screen">
          <div
            className={cn(
              "flex-1 flex flex-col min-h-0 px-4 sm:px-8 2xl:px-12 3xl:px-16 py-4 sm:py-10",
              ready && "animate-in fade-in slide-in-from-bottom-2 duration-200",
            )}
          >
            {ready ? children : <PageLoader />}
          </div>
          <footer className="hidden lg:flex mt-8 border-t border-border/60 px-4 sm:px-8 py-4 flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground/80">
            <span>{mounted ? t("shell.footerNote") : ""}</span>
            <div className="flex items-center gap-4">
              <a
                href={githubSourceUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                {mounted ? t("shell.sourceCode") : ""}
              </a>
              <SponsorBanner variant="inline" />
            </div>
          </footer>
        </main>
      </div>

      <BottomTabBar pathname={pathname} nav={nav} />
      <AiModelSetupDialog />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  /** Hide title on mobile when shell header already shows it */
  hideTitleOnMobile = true,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  hideTitleOnMobile?: boolean;
}) {
  return (
    <div className="mb-5 sm:mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className={cn("min-w-0", hideTitleOnMobile && "hidden lg:block")}>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {description && hideTitleOnMobile ? (
        <p className="text-sm text-muted-foreground lg:hidden -mt-1 mb-0">{description}</p>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}
