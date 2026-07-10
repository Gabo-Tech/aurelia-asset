import { Link, useRouterState } from "@tanstack/react-router";
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
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrivacy, useStore, useFxReady } from "@/lib/store";
import { SponsorBanner } from "./sponsor-banner";
import { ThemeToggle } from "./theme-toggle";
import { PageLoader } from "./page-loader";
import { TourLauncher } from "./tour-launcher";
import { usePrefetchPortfolioHistory } from "@/hooks/use-portfolio-history";
import { ASSETS, githubSourceUrl } from "@/lib/site-config";

const navItems = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { to: "/holdings", key: "holdings", icon: Wallet },
  { to: "/performance", key: "performance", icon: TrendingUp },
  { to: "/cashflow", key: "cashflow", icon: ArrowLeftRight },
  { to: "/planning", key: "planning", icon: Target },
  { to: "/assistant", key: "assistant", icon: Sparkles },
  { to: "/settings", key: "settings", icon: SettingsIcon },
] as const;

function PrivacyToggle({ className }: { className?: string }) {
  const { privacy, toggle } = usePrivacy();
  const { t } = useTranslation();
  const label = privacy ? t("shell.showValues") : t("shell.hideValues");
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={privacy}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors",
        privacy && "text-primary hover:text-primary",
        className,
      )}
      data-tour="privacy-toggle"
    >
      {privacy ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1400px] flex-col lg:flex-row 2xl:max-w-[1600px] 3xl:max-w-[1840px] 4xl:max-w-[2200px]">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col 2xl:w-72 3xl:w-80 border-r border-border/60 bg-sidebar min-h-screen sticky top-0">
          <div className="flex items-center gap-2 px-6 py-7">
            <img src={ASSETS.logo} alt="Logo" className="h-9 w-9 rounded-xl object-contain" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-tight">{brand}</div>
              <div className="text-xs text-muted-foreground">{brandTagline}</div>
            </div>
            <ThemeToggle />
            <TourLauncher />
            <PrivacyToggle />
          </div>
          <nav className="flex-1 px-3 space-y-1" data-tour="sidebar-nav">
            {nav.map((item) => {
              const active =
                pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="px-3 pb-4">
            <SponsorBanner variant="card" />
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border/60 bg-sidebar/95 backdrop-blur sticky top-0 z-20">
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <img src={ASSETS.logo} alt="Logo" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            <div className="truncate font-semibold text-sm">{brand} {brandTagline}</div>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <TourLauncher />
            <PrivacyToggle />
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12 flex flex-col min-h-[100dvh] lg:min-h-screen">
          <div className="flex-1 flex flex-col min-h-0 px-4 sm:px-8 2xl:px-12 3xl:px-16 py-6 sm:py-10">{ready ? children : <PageLoader />}</div>
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

      {/* Mobile bottom nav */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/60 bg-sidebar/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
        data-tour="bottom-nav"
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        >
          {nav.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] min-w-0 px-0.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full bg-primary" />
                )}
                <Icon className={cn("h-5 w-5 shrink-0", active && "scale-110 transition-transform")} />
                <span className="max-w-full truncate leading-tight">{item.shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 sm:mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}

