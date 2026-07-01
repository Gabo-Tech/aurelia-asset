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

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

function hasStickyOrFixedAncestor(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    const pos = getComputedStyle(cur as HTMLElement).position;
    if (pos === "fixed" || pos === "sticky") return true;
    cur = cur.parentElement;
  }
  return false;
}

/** Scroll respecting sticky mobile header (top) and bottom nav. */
function scrollElementIntoSafeView(el: HTMLElement) {
  if (hasStickyOrFixedAncestor(el)) return; // already pinned - don't scroll
  const rect = el.getBoundingClientRect();
  const mobile = isMobileViewport();
  const topInset = mobile ? 72 : 24; // sticky header
  const bottomInset = mobile ? 96 : 24; // bottom nav
  const viewportH = window.innerHeight;
  const safeTop = topInset;
  const safeBottom = viewportH - bottomInset;
  const inView = rect.top >= safeTop && rect.bottom <= safeBottom;
  if (inView) return;
  const targetY =
    window.scrollY + rect.top - Math.max(topInset + 16, (viewportH - rect.height) / 2);
  window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
}

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

  const mobile = isMobileViewport();

  const d = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: mobile ? 0.55 : 0.6,
    stagePadding: mobile ? 10 : 6,
    stageRadius: 12,
    smoothScroll: false, // we handle scrolling ourselves with safe insets
    popoverOffset: mobile ? 16 : 12,
    disableActiveInteraction: true,
    nextBtnText: labels.next,
    prevBtnText: labels.prev,
    doneBtnText: labels.done,
    progressText: labels.progress,
    onPopoverRender: (popover) => {
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
        const idx = ctx.state.activeIndex ?? 0;
        const def = steps[idx] as TourStepDef | undefined;
        if (!def) return;
        const needsNav = def.route && window.location.pathname !== def.route;
        if (needsNav) {
          navigate(def.route!);
        }
        if (def.selector) {
          const el = await waitForEl(def.selector, needsNav ? 4000 : 2500);
          if (!el) {
            const isLast = idx >= steps.length - 1;
            if (isLast) d.destroy();
            else d.moveNext();
            return;
          }
          await new Promise((r) => window.setTimeout(r, 60));
          const fresh = document.querySelector(def.selector) as HTMLElement | null;
          if (fresh) {
            scrollElementIntoSafeView(fresh);
            await new Promise((r) => window.setTimeout(r, 200));
            try {
              // Re-position the active step's popover against the freshly
              // mounted element without turning it into a one-off highlight
              // (which would drop the prev/next controls).
              (d as unknown as { refresh?: () => void }).refresh?.();
            } catch {
              /* noop */
            }
          }
        } else if (needsNav) {
          // Center popover on a new route: wait a beat for the page to swap.
          await new Promise((r) => window.setTimeout(r, 120));
          try {
            d.highlight({ popover: def.popover });
          } catch {
            /* noop */
          }
        }
      },
    })),
  });

  return d;
}
