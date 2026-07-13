import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ResponsiveDialog } from "@/components/design/responsive-dialog";
import { hapticTap, pathMatches, type ResolvedNavItem } from "./nav-config";

type BottomTabBarProps = {
  pathname: string;
  nav: ResolvedNavItem[];
};

const NARROW = 360;

export function BottomTabBar({ pathname, nav }: BottomTabBarProps) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < NARROW);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const useOverflow = narrow && nav.length > 5;

  const { visible, overflow } = useMemo(() => {
    if (!useOverflow) return { visible: nav, overflow: [] as ResolvedNavItem[] };
    const primary = nav.filter((n) => n.tier === "primary");
    const secondary = nav.filter((n) => n.tier === "secondary");
    // Keep at most 4 primary + More
    const vis = primary.slice(0, 4);
    const rest = [...primary.slice(4), ...secondary];
    return { visible: vis, overflow: rest };
  }, [nav, useOverflow]);

  const overflowActive = overflow.some((n) => pathMatches(pathname, n.to));

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/50 glass pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
        data-tour="bottom-nav"
      >
        <div
          className="grid px-1 pt-1"
          style={{
            gridTemplateColumns: `repeat(${visible.length + (overflow.length ? 1 : 0)}, minmax(0, 1fr))`,
          }}
        >
          {visible.map((item) => {
            const active = pathMatches(pathname, item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                onClick={() => hapticTap()}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 min-h-[52px] min-w-0 px-0.5 py-1.5 text-[10px] font-medium transition-colors active-press",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary/15",
                  )}
                >
                  <Icon
                    className={cn("h-5 w-5 shrink-0 transition-transform", active && "scale-105")}
                  />
                </span>
                <span className="max-w-full truncate leading-tight">{item.shortLabel}</span>
              </Link>
            );
          })}
          {overflow.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                hapticTap();
                setMoreOpen(true);
              }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 min-h-[52px] min-w-0 px-0.5 py-1.5 text-[10px] font-medium transition-colors active-press",
                overflowActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-12 items-center justify-center rounded-full transition-colors",
                  overflowActive && "bg-primary/15",
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
              </span>
              <span className="leading-tight">{t("nav.short.more", { defaultValue: "More" })}</span>
            </button>
          ) : null}
        </div>
      </nav>

      <ResponsiveDialog
        open={moreOpen}
        onOpenChange={setMoreOpen}
        title={t("nav.more", { defaultValue: "More" })}
        showClose
      >
        <div className="grid gap-1 pb-2">
          {overflow.map((item) => {
            const active = pathMatches(pathname, item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => {
                  hapticTap();
                  setMoreOpen(false);
                }}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors active-press",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </ResponsiveDialog>
    </>
  );
}
