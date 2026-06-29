import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const COMPLETED_KEY = "tour:completed:v1";

export function isTourCompleted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(COMPLETED_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTourCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPLETED_KEY, "1");
  } catch {
    /* noop */
  }
}

export function resetTourCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(COMPLETED_KEY);
  } catch {
    /* noop */
  }
}

export const resetTourCompletion = resetTourCompleted;

export async function waitForEl(
  selector: string,
  timeoutMs = 2500,
): Promise<Element | null> {
  if (typeof document === "undefined") return null;
  const existing = document.querySelector(selector);
  if (existing) return existing;
  return new Promise((resolve) => {
    const t = window.setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        window.clearTimeout(t);
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

export type TourStepDef = DriveStep & {
  route?: string;
  selector?: string;
};

export function createTour(opts: {
  steps: TourStepDef[];
  navigate: (path: string) => void;
  labels: { next: string; prev: string; done: string; skip: string; progress: string };
  onClose?: () => void;
}): Driver {
  const { steps, navigate, labels, onClose } = opts;

  const d = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 10,
    smoothScroll: true,
    nextBtnText: labels.next,
    prevBtnText: labels.prev,
    doneBtnText: labels.done,
    progressText: labels.progress,
    onPopoverRender: (popover) => {
      // Append a small skip link in the footer
      const skip = document.createElement("button");
      skip.innerText = labels.skip;
      skip.className = "driver-skip-btn";
      skip.onclick = () => d.destroy();
      popover.footerButtons.appendChild(skip);
    },
    onDestroyed: () => {
      onClose?.();
    },
    steps: steps.map((s) => ({
      ...s,
      onHighlightStarted: async (_el, _step, ctx) => {
        const def = steps[ctx.state.activeIndex ?? 0] as TourStepDef | undefined;
        if (!def) return;
        if (def.route && window.location.pathname !== def.route) {
          navigate(def.route);
        }
        if (def.selector) {
          await waitForEl(def.selector);
        }
      },
    })),
  });

  return d;
}
