import logoAsset from "@/assets/logo.png.asset.json";

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-5 animate-in fade-in duration-200">
      <div className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-20 w-20 animate-ping rounded-full bg-primary/30" />
        <span className="absolute inline-flex h-16 w-16 animate-pulse rounded-full bg-primary/20" />
        <img
          src={logoAsset.url}
          alt=""
          aria-hidden
          className="relative h-12 w-12 rounded-xl object-contain drop-shadow-[0_0_18px_hsl(var(--primary)/0.55)]"
        />
      </div>
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
