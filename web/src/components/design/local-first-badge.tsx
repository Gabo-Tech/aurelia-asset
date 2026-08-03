import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type LocalFirstBadgeProps = {
  label?: string;
  className?: string;
};

export function LocalFirstBadge({ label = "On-device", className }: LocalFirstBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground",
        className,
      )}
      title="Your data stays encrypted on this device"
    >
      <Lock className="h-3 w-3 text-primary" />
      {label}
    </span>
  );
}
