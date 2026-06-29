import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createTour,
  isTourCompleted,
  markTourCompleted,
} from "@/lib/tour/driver";
import { buildTourSteps } from "@/lib/tour/steps";

function useIsMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

async function startTour(
  t: ReturnType<typeof useTranslation>["t"],
  navigate: (path: string) => void,
) {
  const isMobile = useIsMobile();
  const steps = buildTourSteps(t, isMobile);
  const tour = createTour({
    steps,
    navigate,
    labels: {
      next: t("tour.next"),
      prev: t("tour.prev"),
      done: t("tour.done"),
      skip: t("tour.skip"),
      progress: t("tour.progress"),
    },
    onClose: () => markTourCompleted(),
  });
  tour.drive();
}

export function TourLauncher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const autoStarted = useRef(false);

  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (typeof window === "undefined") return;
    if (isTourCompleted()) return;
    // Delay to let the first page render
    const id = window.setTimeout(() => {
      startTour(t, (path) => navigate({ to: path as never }));
    }, 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onStart() {
      startTour(t, (path) => navigate({ to: path as never }));
    }
    window.addEventListener("app:start-tour", onStart);
    window.addEventListener("tour:start", onStart);
    return () => {
      window.removeEventListener("app:start-tour", onStart);
      window.removeEventListener("tour:start", onStart);
    };
  }, [t, navigate]);

  return (
    <button
      type="button"
      onClick={() => startTour(t, (path) => navigate({ to: path }))}
      title={t("tour.start")}
      aria-label={t("tour.start")}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors",
        className,
      )}
      data-tour="tour-launcher"
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  );
}
