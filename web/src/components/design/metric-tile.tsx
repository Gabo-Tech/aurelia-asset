import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AppCard, AppCardContent, AppCardHeader, AppCardTitle } from "./app-card";

type MetricTileProps = {
  label: string;
  value: string;
  sub?: ReactNode;
  icon?: ReactNode;
  /** Semantic tone for the value */
  tone?: "default" | "success" | "destructive";
  className?: string;
  onClick?: () => void;
};

export function MetricTile({
  label,
  value,
  sub,
  icon,
  tone = "default",
  className,
  onClick,
}: MetricTileProps) {
  return (
    <AppCard pressable={!!onClick} className={cn(className)} onClick={onClick}>
      <AppCardHeader className="pb-1 flex-row items-start justify-between gap-2">
        <AppCardTitle>{label}</AppCardTitle>
        {icon ? <span className="text-muted-foreground shrink-0">{icon}</span> : null}
      </AppCardHeader>
      <AppCardContent>
        <div
          className={cn(
            "text-2xl sm:text-3xl font-semibold tracking-tight break-words tabular-nums",
            tone === "success" && "text-success",
            tone === "destructive" && "text-destructive",
          )}
        >
          {value}
        </div>
        {sub ? <p className="mt-2 text-xs text-muted-foreground">{sub}</p> : null}
      </AppCardContent>
    </AppCard>
  );
}
