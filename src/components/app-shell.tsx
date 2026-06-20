import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
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
import { usePrivacy } from "@/lib/store";
import { SponsorBanner } from "./sponsor-banner";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/holdings", label: "Holdings", icon: Wallet },
  { to: "/performance", label: "Performance", icon: TrendingUp },
  { to: "/cashflow", label: "Cashflow", icon: ArrowLeftRight },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function PrivacyToggle({ className }: { className?: string }) {
  const { privacy, toggle } = usePrivacy();
  return (
    <button
      type="button"
      onClick={toggle}
      title={privacy ? "Show values" : "Hide values"}
      aria-label={privacy ? "Show values" : "Hide values"}
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1400px] flex-col md:flex-row">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border/60 bg-sidebar min-h-screen sticky top-0">
          <div className="flex items-center gap-2 px-6 py-7">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-tight">Elegant</div>
              <div className="text-xs text-muted-foreground">Portfolio Tracker</div>
            </div>
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
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border/60 bg-sidebar sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="font-semibold text-sm">Elegant Portfolio</div>
          </div>
          <PrivacyToggle />
        </header>

        {/* Main */}
        <main className="flex-1 min-w-0 pb-24 md:pb-12 flex flex-col">
          <div className="flex-1 px-4 sm:px-8 py-6 sm:py-10">{children}</div>
          <footer className="mt-8 border-t border-border/60 px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground/80">
            <span>Local-only · data stays in your browser</span>
            <SponsorBanner variant="inline" />
          </footer>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/60 bg-sidebar/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {nav.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
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
    <div className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl sm:text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
