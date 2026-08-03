import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AppCard, AppCardContent, AppCardHeader, AppCardTitle } from "./app-card";

type MetricHeroCardProps = {
  label: string;
  value: string;
  sub?: ReactNode;
  className?: string;
  onClick?: () => void;
};

export function MetricHeroCard({ label, value, sub, className, onClick }: MetricHeroCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <AppCard
      elevated
      pressable={!!onClick}
      className={cn("relative overflow-hidden sm:col-span-2", className)}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
      <Comp
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn(
          "relative w-full text-left",
          onClick &&
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl",
        )}
      >
        <AppCardHeader className="pb-1">
          <AppCardTitle>{label}</AppCardTitle>
        </AppCardHeader>
        <AppCardContent>
          <div className="font-display text-3xl sm:text-4xl xl:text-5xl tracking-tight break-words tabular-nums text-foreground">
            {value}
          </div>
          {sub ? <div className="mt-2 text-sm text-muted-foreground">{sub}</div> : null}
        </AppCardContent>
      </Comp>
    </AppCard>
  );
}
