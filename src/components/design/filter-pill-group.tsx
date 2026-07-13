import { cn } from "@/lib/utils";

type Pill = {
  id: string;
  label: string;
  color?: string;
  active?: boolean;
};

type FilterPillGroupProps = {
  pills: Pill[];
  onToggle: (id: string) => void;
  onShowAll?: () => void;
  onHideAll?: () => void;
  showAllLabel?: string;
  hideAllLabel?: string;
  className?: string;
};

export function FilterPillGroup({
  pills,
  onToggle,
  onShowAll,
  onHideAll,
  showAllLabel = "Show all",
  hideAllLabel = "Hide all",
  className,
}: FilterPillGroupProps) {
  if (pills.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {pills.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onToggle(p.id)}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active-press",
            p.active !== false
              ? "border-transparent bg-primary/10 text-foreground hover:bg-primary/20"
              : "border-border bg-transparent text-muted-foreground opacity-60",
          )}
        >
          {p.color ? (
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          ) : null}
          <span>{p.label}</span>
        </button>
      ))}
      {(onShowAll || onHideAll) && (
        <div className="ml-auto flex items-center gap-2">
          {onShowAll ? (
            <button
              type="button"
              onClick={onShowAll}
              className="min-h-9 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              {showAllLabel}
            </button>
          ) : null}
          {onShowAll && onHideAll ? <span className="text-muted-foreground">·</span> : null}
          {onHideAll ? (
            <button
              type="button"
              onClick={onHideAll}
              className="min-h-9 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              {hideAllLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
