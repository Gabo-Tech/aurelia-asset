import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Camera, X } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  filename?: string;
  title?: string;
  className?: string;
  /** Extra controls rendered to the left of the screenshot/fullscreen buttons. */
  extras?: ReactNode;
};

/**
 * Wraps a chart with a Fullscreen + Screenshot toolbar. In fullscreen mode
 * the chart is moved into a portal that covers the viewport (works on mobile
 * — no native fullscreen API required). Children only mount in one place at
 * a time, so chart state isn't duplicated.
 */
export function ChartFrame({ children, filename = "chart", title, className, extras }: Props) {
  const inlineRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [shooting, setShooting] = useState(false);

  // Lock body scroll while fullscreen, support ESC to close.
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  async function screenshot() {
    const node = full ? fullRef.current : inlineRef.current;
    if (!node) return;
    setShooting(true);
    try {
      // Use the current card background for a clean export.
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: bg,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast.success("Screenshot saved");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't capture screenshot");
    } finally {
      setShooting(false);
    }
  }

  const ToolButton = ({
    onClick,
    icon: Icon,
    label,
    disabled,
  }: {
    onClick: () => void;
    icon: typeof Camera;
    label: string;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
    >
      <Icon className="h-4 w-4" />
    </button>
  );

  return (
    <>
      <div className={cn("relative", className)}>
        <div className="mb-2 flex items-center justify-end gap-1.5">
          {extras}
          <ToolButton onClick={screenshot} icon={Camera} label="Save as PNG" disabled={shooting} />
          <ToolButton onClick={() => setFull(true)} icon={Maximize2} label="Fullscreen" />
        </div>
        {!full && <div ref={inlineRef}>{children}</div>}
        {full && (
          <div className="grid h-96 place-items-center text-xs text-muted-foreground">
            Chart is open in fullscreen
          </div>
        )}
      </div>

      {full &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex flex-col bg-background">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 sm:px-5">
              <div className="truncate text-sm font-medium">{title ?? filename}</div>
              <div className="flex items-center gap-1.5">
                {extras}
                <ToolButton onClick={screenshot} icon={Camera} label="Save as PNG" disabled={shooting} />
                <ToolButton onClick={() => setFull(false)} icon={X} label="Close fullscreen" />
              </div>
            </div>
            <div
              ref={fullRef}
              className="min-h-0 flex-1 bg-background p-3 sm:p-6 [&>div]:!h-full [&>div]:!max-h-full"
            >
              {children}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
