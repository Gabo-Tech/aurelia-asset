import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Camera, X } from "lucide-react";
import { toPng } from "html-to-image";
import { useTranslation } from "react-i18next";
import { saveExportFile } from "@/lib/export";
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

export function ChartFrame({ children, filename = "chart", title, className, extras }: Props) {
  const { t } = useTranslation();
  const inlineRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [shooting, setShooting] = useState(false);

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
      const outName = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
      const res = await fetch(dataUrl);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const method = await saveExportFile(outName, { bytes });
      if (method === "cancelled") return;
      toast.success(t("chart.screenshotSaved", { defaultValue: "Screenshot saved" }));
    } catch (e) {
      console.error(e);
      toast.error(t("chart.screenshotFailed", { defaultValue: "Couldn't capture screenshot" }));
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
          <ToolButton onClick={() => setFull(true)} icon={Maximize2} label="Open in modal" />
        </div>
        {!full && <div ref={inlineRef}>{children}</div>}
        {full && (
          <div className="grid h-96 place-items-center text-xs text-muted-foreground">
            Chart is open in a modal
          </div>
        )}
      </div>

      {full &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setFull(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(900px, 90vw)",
                height: "min(620px, 85vh)",
                resize: "both",
                overflow: "hidden",
                minWidth: 360,
                minHeight: 280,
                maxWidth: "95vw",
                maxHeight: "92vh",
              }}
              className="relative flex flex-col rounded-lg border border-border/60 bg-card shadow-2xl"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 sm:px-4">
                <div className="truncate text-sm font-medium">{title ?? filename}</div>
                <div className="flex items-center gap-1.5">
                  {extras}
                  <ToolButton onClick={screenshot} icon={Camera} label="Save as PNG" disabled={shooting} />
                  <ToolButton onClick={() => setFull(false)} icon={X} label="Close" />
                </div>
              </div>
              <div
                ref={fullRef}
                className="chart-viewport min-h-0 flex-1 overflow-hidden p-3 sm:p-4 [&>div]:!w-full"
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
