import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AppCard, AppCardContent } from "./app-card";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <AppCard className={cn("border-dashed", className)}>
      <AppCardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center sm:py-16">
        {icon ? <div className="text-muted-foreground/80">{icon}</div> : null}
        <div className="text-base font-semibold tracking-tight">{title}</div>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
        {actionLabel && actionTo ? (
          <Button asChild className="mt-2">
            <Link to={actionTo}>{actionLabel}</Link>
          </Button>
        ) : null}
        {actionLabel && onAction && !actionTo ? (
          <Button type="button" className="mt-2" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </AppCardContent>
    </AppCard>
  );
}
