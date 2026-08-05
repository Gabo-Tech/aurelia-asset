import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/lib/store";
import { ASSETS } from "@/lib/site-config";

export function PrivacyToggle({ className }: { className?: string }) {
  const { privacy, toggle } = usePrivacy();
  const { t } = useTranslation();
  const label = privacy ? t("shell.showValues") : t("shell.hideValues");
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={privacy}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors active-press",
        privacy && "text-primary hover:text-primary",
        className,
      )}
      data-tour="privacy-toggle"
    >
      {privacy ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

type MobileHeaderProps = {
  title: string;
  subtitle?: string;
};

export function MobileHeader({ title, subtitle }: MobileHeaderProps) {
  return (
    <header className="lg:hidden sticky top-0 z-20 flex items-center gap-2 border-b border-border/50 glass px-3 py-2">
      <Link
        to="/dashboard"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl active-press"
        aria-label="Home"
      >
        <img src={ASSETS.logo} alt="" className="h-8 w-8 rounded-lg object-contain" />
      </Link>
      <div className="min-w-0 flex-1 text-center px-1">
        <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="truncate font-display text-xs tabular-nums text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      <PrivacyToggle className="shrink-0" />
    </header>
  );
}
