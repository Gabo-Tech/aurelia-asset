import { cn } from "@/lib/utils";

type SettingsSectionNavProps = {
  items: { id: string; label: string }[];
  className?: string;
};

export function SettingsSectionNav({ items, className }: SettingsSectionNavProps) {
  return (
    <nav
      className={cn(
        "lg:hidden sticky top-14 z-10 -mx-1 mb-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      aria-label="Settings sections"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="shrink-0 rounded-full border border-border/60 bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-primary/30 active-press"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
