import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  ArrowLeftRight,
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
import logoAsset from "@/assets/logo.png.asset.json";

const navItems = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { to: "/holdings", key: "holdings", icon: Wallet },
  { to: "/performance", key: "performance", icon: TrendingUp },
  { to: "/cashflow", key: "cashflow", icon: ArrowLeftRight },
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
  const { hydrated } = useStore();
  const fxReady = useFxReady();
  const ready = hydrated && fxReady && !isNavigating;
  const { t } = useTranslation();
  const nav = navItems.map((n) => ({ ...n, label: t(`nav.${n.key}`) }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1400px] flex-col md:flex-row 2xl:max-w-[1600px] 3xl:max-w-[1840px] 4xl:max-w-[2200px]">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:flex md:w-64 md:flex-col 2xl:w-72 3xl:w-80 border-r border-border/60 bg-sidebar min-h-screen sticky top-0">
          <div className="flex items-center gap-2 px-6 py-7">
            <img src={logoAsset.url} alt="Logo" className="h-9 w-9 rounded-xl object-contain" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-tight">{t("shell.brand")}</div>
              <div className="text-xs text-muted-foreground">{t("shell.brandTagline")}</div>
            </div>
            <ThemeToggle />
            <PrivacyToggle />
          </div>
          <nav className="flex-1 px-3 space-y-1">
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
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border/60 bg-sidebar/95 backdrop-blur sticky top-0 z-20">
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <img src={logoAsset.url} alt="Logo" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            <div className="truncate font-semibold text-sm">{t("shell.brand")} {t("shell.brandTagline")}</div>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <PrivacyToggle />
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-12 flex flex-col">
          <div className="flex-1 px-4 sm:px-8 2xl:px-12 3xl:px-16 py-6 sm:py-10">{ready ? children : <PageLoader />}</div>
          <footer className="hidden md:flex mt-8 border-t border-border/60 px-4 sm:px-8 py-4 flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground/80">
            <span>{t("shell.footerNote")}</span>
            <SponsorBanner variant="inline" />
          </footer>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/60 bg-sidebar/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
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
                  "relative flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full bg-primary" />
                )}
                <Icon className={cn("h-5 w-5", active && "scale-110 transition-transform")} />
                <span>{item.label}</span>
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

