import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Camera, X } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  filename?: string;
  className?: string;
  /** Extra controls rendered to the left of the screenshot/fullscreen buttons. */
  extras?: ReactNode;
};

/**
 * Wraps any chart with a Fullscreen + Screenshot toolbar.
 * In fullscreen mode the chart is rendered into a portal that covers the viewport,
 * so it works on mobile (no native fullscreen API needed).
 */
export function ChartFrame({ children, filename = "chart", className, extras }: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const fullCaptureRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [shooting, setShooting] = useState(false);

  // Lock body scroll while fullscreen
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
    const node = full ? fullCaptureRef.current : captureRef.current;
    if (!node) return;
    setShooting(true);
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--card") ||
        getComputedStyle(document.body).backgroundColor;
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: bg.trim() || undefined,
        style: { padding: "16px" },
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

  const Toolbar = (
    <div className="flex items-center gap-1.5">
      {extras}
      <button
        type="button"
        onClick={screenshot}
        disabled={shooting}
        title="Save as PNG"
        aria-label="Save chart as PNG"
        className="grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
      >
        <Camera className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setFull((f) => !f)}
        title={full ? "Exit fullscreen" : "Fullscreen"}
        aria-label={full ? "Exit fullscreen" : "Fullscreen"}
        className="grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
  );

  return (
    <>
      <div className={cn("relative", className)}>
        <div className="absolute right-0 -top-12 sm:-top-11 z-10">{Toolbar}</div>
        <div ref={captureRef}>{children}</div>
      </div>

      {full &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex flex-col bg-background">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 sm:px-5">
              <div className="text-sm font-medium truncate">{filename}</div>
              <div className="flex items-center gap-1.5">
                {extras}
                <button
                  type="button"
                  onClick={screenshot}
                  disabled={shooting}
                  title="Save as PNG"
                  aria-label="Save chart as PNG"
                  className="grid h-9 w-9 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setFull(false)}
                  title="Close"
                  aria-label="Close fullscreen"
                  className="grid h-9 w-9 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div
              ref={fullCaptureRef}
              className="flex-1 min-h-0 p-3 sm:p-6 bg-background"
            >
              <div className="h-full w-full">{children}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
