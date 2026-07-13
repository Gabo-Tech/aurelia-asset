import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import { TourLauncher } from "@/components/tour-launcher";
import { SponsorBanner } from "@/components/sponsor-banner";
import { ASSETS } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { PrivacyToggle } from "./mobile-header";
import { pathMatches, type ResolvedNavItem } from "./nav-config";

type DesktopSidebarProps = {
  pathname: string;
  nav: ResolvedNavItem[];
  brand: string;
  brandTagline: string;
};

export function DesktopSidebar({ pathname, nav, brand, brandTagline }: DesktopSidebarProps) {
  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col 2xl:w-72 3xl:w-80 border-r border-border/60 bg-sidebar min-h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 py-6">
        <img src={ASSETS.logo} alt="" className="h-9 w-9 rounded-xl object-contain" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold tracking-tight">{brand}</div>
          <div className="text-xs text-muted-foreground">{brandTagline}</div>
        </div>
        <ThemeToggle className="h-9 w-9" />
        <TourLauncher />
        <PrivacyToggle className="h-9 w-9" />
      </div>
      <nav className="flex-1 space-y-1 px-3" data-tour="sidebar-nav">
        {nav.map((item) => {
          const active = pathMatches(pathname, item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors active-press",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg transition-colors",
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pb-4">
        <SponsorBanner variant="card" />
      </div>
    </aside>
  );
}
