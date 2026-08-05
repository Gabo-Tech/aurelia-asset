import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/components/shell/nav-config";

type FabProps = {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  as?: "button" | "a";
  className?: string;
};

export function Fab({ label, icon, onClick, className }: FabProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        hapticTap();
        onClick?.();
      }}
      className={cn(
        "lg:hidden fixed z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-primary/30 transition-transform active:scale-95",
        "right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {icon}
    </button>
  );
}
