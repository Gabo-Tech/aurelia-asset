import * as React from "react";
import { cn } from "@/lib/utils";

type AppCardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Softer glass-like surface for overlays / sticky chrome */
  glass?: boolean;
  /** Extra elevation shadow */
  elevated?: boolean;
  /** Press feedback for tappable cards */
  pressable?: boolean;
};

export const AppCard = React.forwardRef<HTMLDivElement, AppCardProps>(
  ({ className, glass, elevated, pressable, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-border/40 bg-card/80 text-card-foreground",
        elevated && "shadow-elevated",
        !elevated && "shadow-none",
        glass && "glass border-border/30",
        pressable && "active-press cursor-pointer transition-colors hover:border-primary/30",
        className,
      )}
      {...props}
    />
  ),
);
AppCard.displayName = "AppCard";

export function AppCardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-4 sm:p-5", className)} {...props} />;
}

export function AppCardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-sm font-medium text-muted-foreground tracking-tight", className)}
      {...props}
    />
  );
}

export function AppCardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />;
}
