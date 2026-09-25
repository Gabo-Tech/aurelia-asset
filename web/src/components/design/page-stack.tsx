import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page sections below the header. Mobile uses `--stack-page` (16px); `sm+` uses `--stack-section` (24px). */
export function PageStack({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[var(--stack-page)] sm:gap-[var(--stack-section)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
