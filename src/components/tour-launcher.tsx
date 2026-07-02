import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createTour,
  markTourCompleted,
} from "@/lib/tour/driver";

import type { Driver } from "driver.js";
import { buildTourSteps } from "@/lib/tour/steps";

let activeTour: Driver | null = null;
let activeTourPending = false;

function detectMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

async function startTour(
  t: ReturnType<typeof useTranslation>["t"],
  navigate: (path: string) => void,
) {
  if (activeTourPending || activeTour?.isActive()) return;
  activeTourPending = true;
  const isMobile = detectMobile();
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
    onClose: () => {
      activeTour = null;
      activeTourPending = false;
      markTourCompleted();
    },
  });
  activeTour = tour;
  tour.drive();
  window.setTimeout(() => {
    activeTourPending = false;
  }, 800);
}

export function TourLauncher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const autoStarted = useRef(false);

  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    // Tour only starts when the user clicks the tour button.
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
      onClick={() => startTour(t, (path) => navigate({ to: path as never }))}
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
