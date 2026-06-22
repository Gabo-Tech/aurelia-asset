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

const ASPECT_RATIOS: { label: string; value: string; ratio: number | null }[] = [
  { label: "Free", value: "free", ratio: null },
  { label: "16:9", value: "16:9", ratio: 16 / 9 },
  { label: "4:3", value: "4:3", ratio: 4 / 3 },
  { label: "3:2", value: "3:2", ratio: 3 / 2 },
  { label: "1:1", value: "1:1", ratio: 1 },
  { label: "9:16", value: "9:16", ratio: 9 / 16 },
  { label: "21:9", value: "21:9", ratio: 21 / 9 },
];

export function ChartFrame({ children, filename = "chart", title, className, extras }: Props) {
  const inlineRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [aspect, setAspect] = useState<string>("free");

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
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: bg,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      const suffix = full && aspect !== "free" ? `-${aspect.replace(":", "x")}` : "";
      a.download = `${filename}${suffix}-${new Date().toISOString().slice(0, 10)}.png`;
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

  const activeRatio = ASPECT_RATIOS.find((a) => a.value === aspect) ?? ASPECT_RATIOS[0];

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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 sm:px-5">
              <div className="truncate text-sm font-medium">{title ?? filename}</div>
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">Aspect</span>
                  <select
                    value={aspect}
                    onChange={(e) => setAspect(e.target.value)}
                    className="h-8 rounded-md border border-border/60 bg-card px-2 text-xs text-foreground"
                  >
                    {ASPECT_RATIOS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
                {extras}
                <ToolButton onClick={screenshot} icon={Camera} label="Save as PNG" disabled={shooting} />
                <ToolButton onClick={() => setFull(false)} icon={X} label="Close fullscreen" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6 grid place-items-center">
              <div
                ref={fullRef}
                style={
                  activeRatio.ratio
                    ? {
                        aspectRatio: String(activeRatio.ratio),
                        width: "min(100%, calc((100vh - 120px) * " + activeRatio.ratio + "))",
                        maxHeight: "calc(100vh - 120px)",
                      }
                    : { width: "100%", height: "calc(100vh - 90px)", resize: "both", overflow: "auto" }
                }
                className="bg-background [&>div]:!h-full [&>div]:!max-h-full [&>div]:!w-full"
              >
                {children}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
