import type { LucideIcon } from "lucide-react";

export type NavTier = "primary" | "secondary";

export type NavItemDef = {
  to: string;
  key: string;
  icon: LucideIcon;
  tier: NavTier;
};

export type ResolvedNavItem = NavItemDef & {
  label: string;
  shortLabel: string;
};

export function pathMatches(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}

export function pageTitleForPath(
  pathname: string,
  nav: ResolvedNavItem[],
  fallback: string,
): string {
  const match = nav.find((n) => pathMatches(pathname, n.to));
  return match?.label || fallback;
}

export function hapticTap() {
  try {
    navigator.vibrate?.(10);
  } catch {
    /* ignore */
  }
}
