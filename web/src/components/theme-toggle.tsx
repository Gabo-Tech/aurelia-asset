import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const LABELS = {
  light: "Switch to dark mode",
  dark: "Switch to system theme",
  system: "Switch to light mode",
} as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, toggle } = useTheme();
  const label = LABELS[preference];
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors active-press",
        className,
      )}
      data-tour="theme-toggle"
    >
      {preference === "light" ? (
        <Sun className="h-4 w-4" />
      ) : preference === "dark" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Monitor className="h-4 w-4" />
      )}
    </button>
  );
}
