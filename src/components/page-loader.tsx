import { ASSETS } from "@/lib/site-config";

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-6 animate-in fade-in duration-200">
      <div className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-20 w-20 rounded-full bg-primary/15 blur-xl" />
        <img
          src={ASSETS.logo}
          alt=""
          aria-hidden
          className="relative h-12 w-12 rounded-xl object-contain animate-logo-breathe drop-shadow-[0_0_18px_color-mix(in_srgb,var(--primary)_55%,transparent)]"
        />
      </div>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/2 rounded-full bg-primary/60 skeleton-shimmer" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
