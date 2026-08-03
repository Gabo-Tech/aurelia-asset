import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-5 animate-in fade-in duration-200", className)}>
      <Skeleton className="h-8 w-40 skeleton-shimmer" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-36 rounded-2xl sm:col-span-2 skeleton-shimmer" />
        <Skeleton className="h-36 rounded-2xl skeleton-shimmer" />
        <Skeleton className="h-36 rounded-2xl skeleton-shimmer" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-11 shrink-0 rounded-xl skeleton-shimmer" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-80 rounded-2xl lg:col-span-3 skeleton-shimmer" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-2 skeleton-shimmer" />
      </div>
    </div>
  );
}

export function ChartSkeleton({
  className,
  height = "h-80",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-4", className)}>
      <Skeleton className="mb-4 h-5 w-32 skeleton-shimmer" />
      <Skeleton className={cn("w-full rounded-xl skeleton-shimmer", height)} />
    </div>
  );
}

export function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <Skeleton className="h-10 w-full rounded-xl skeleton-shimmer" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl skeleton-shimmer" />
      ))}
    </div>
  );
}

export function ChatSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4 p-4", className)}>
      <div className="flex justify-start">
        <Skeleton className="h-16 w-2/3 rounded-2xl skeleton-shimmer" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-12 w-1/2 rounded-2xl skeleton-shimmer" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-20 w-3/4 rounded-2xl skeleton-shimmer" />
      </div>
    </div>
  );
}
