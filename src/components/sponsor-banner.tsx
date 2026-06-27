import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getSponsors } from "@/lib/sponsors.functions";
import { activeSponsors, type Sponsor } from "@/lib/sponsors-types";

interface Props {
  /** Fallback contact when no active sponsors. */
  fallback?: React.ReactNode;
  /** Visual variant. `card` (default) is sidebar block; `inline` is a single-row pill. */
  variant?: "card" | "inline";
  className?: string;
}

function expandByWeight(list: Sponsor[]): Sponsor[] {
  const out: Sponsor[] = [];
  for (const s of list) {
    const n = Math.max(1, Math.min(10, s.weight || 1));
    for (let i = 0; i < n; i++) out.push(s);
  }
  return out;
}

/** Defense-in-depth: reject any href/src that is not plain http(s). */
function isSafeHttp(url: string | undefined | null): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

export function SponsorBanner({
  fallback,
  variant = "card",
  className,
}: Props) {
  const fetchSponsors = useServerFn(getSponsors);
  const { data } = useQuery({
    queryKey: ["sponsors"],
    queryFn: () => fetchSponsors(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const active = useMemo(
    () =>
      data
        ? expandByWeight(activeSponsors(data).filter((s) => isSafeHttp(s.url)))
        : [],
    [data],
  );
  const rotationMs = Math.max(3, data?.rotationSeconds ?? 20) * 1000;

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (active.length <= 1) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % active.length),
      rotationMs,
    );
    return () => clearInterval(t);
  }, [active.length, rotationMs]);

  useEffect(() => {
    setIdx(0);
  }, [active.length]);

  if (active.length === 0) {
    if (variant === "inline") {
      return (
        <div
          className={
            "rounded-md border border-dashed border-border/60 bg-card/30 px-3 py-1.5 text-center text-[11px] text-muted-foreground " +
            (className ?? "")
          }
        >
          {fallback ?? (
            <Link
              to="/admin"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              Manage sponsors →
            </Link>
          )}
        </div>
      );
    }
    return (
      <div
        className={
          "rounded-lg border border-dashed border-sidebar-border bg-sidebar-accent/30 p-3 text-center text-[11px] text-muted-foreground " +
          (className ?? "")
        }
      >
        {fallback ?? (
          <Link
            to="/admin"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            Manage sponsors →
          </Link>
        )}
      </div>
    );
  }

  const s = active[idx % active.length];
  if (variant === "inline") {
    return (
      <a
        href={s.url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={
          "group inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground " +
          (className ?? "")
        }
        aria-label={`Sponsor: ${s.name}`}
      >
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80">
          Sponsored
        </span>
        {isSafeHttp(s.logoUrl) ? (
          <img
            src={s.logoUrl}
            alt=""
            width={16}
            height={16}
            loading="lazy"
            decoding="async"
            className="h-4 w-4 flex-shrink-0 rounded object-cover"
          />
        ) : null}
        <span className="truncate font-semibold text-foreground group-hover:text-primary">
          {s.name}
        </span>
        {s.tagline ? (
          <span className="hidden truncate sm:inline">- {s.tagline}</span>
        ) : null}
      </a>
    );
  }
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={
        "group block rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-left transition hover:border-primary/50 hover:bg-sidebar-accent/70 " +
        (className ?? "")
      }
      aria-label={`Sponsor: ${s.name}`}
    >
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        Sponsored
      </div>
      <div className="flex items-center gap-2">
        {isSafeHttp(s.logoUrl) ? (
          <img
            src={s.logoUrl}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            decoding="async"
            className="h-7 w-7 flex-shrink-0 rounded object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground group-hover:text-primary">
            {s.name}
          </div>
          {s.tagline ? (
            <div className="truncate text-[11px] text-muted-foreground">
              {s.tagline}
            </div>
          ) : null}
        </div>
      </div>
    </a>
  );
}
