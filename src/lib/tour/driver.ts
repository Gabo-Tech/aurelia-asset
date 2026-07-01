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

const RESERVED_POPOVER = 200; // px reserved so popover never overlaps target

function getInsets() {
  const mobile = isMobileViewport();
  return {
    top: mobile ? 72 : 24,
    bottom: mobile ? 96 : 24,
    side: mobile ? 12 : 24,
  };
}

/** Scroll respecting sticky mobile header (top) and bottom nav. */
function scrollElementIntoSafeView(el: HTMLElement) {
  if (hasStickyOrFixedAncestor(el)) return;
  const rect = el.getBoundingClientRect();
  const { top: topInset, bottom: bottomInset } = getInsets();
  const viewportH = window.innerHeight;
  const safeTop = topInset + RESERVED_POPOVER / 2;
  const safeBottom = viewportH - bottomInset - RESERVED_POPOVER / 2;
  const inView = rect.top >= safeTop && rect.bottom <= safeBottom;
  if (inView) return;
  const targetY =
    window.scrollY +
    rect.top -
    Math.max(topInset + 16, (viewportH - rect.height) / 2);
  window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
}

/** Pick the side (top/bottom/left/right) with the most free space around el. */
function pickBestSide(
  el: HTMLElement,
  preferred: "top" | "bottom" | "left" | "right",
): "top" | "bottom" | "left" | "right" {
  const rect = el.getBoundingClientRect();
  const { top: ti, bottom: bi, side: si } = getInsets();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const space = {
    top: rect.top - ti,
    bottom: vh - bi - rect.bottom,
    left: rect.left - si,
    right: vw - si - rect.right,
  };
  if (space[preferred] >= RESERVED_POPOVER) return preferred;
  const ordered = (Object.keys(space) as Array<keyof typeof space>).sort(
    (a, b) => space[b] - space[a],
  );
  return ordered[0];
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

/** Wait until the element's rect stops changing (layout has settled). */
async function waitForStableRect(el: HTMLElement, timeoutMs = 1500) {
  const start = performance.now();
  let last = el.getBoundingClientRect();
  let stableFrames = 0;
  while (performance.now() - start < timeoutMs) {
    await new Promise((r) => window.setTimeout(r, 100));
    const cur = el.getBoundingClientRect();
    const same =
      Math.abs(cur.top - last.top) < 1 &&
      Math.abs(cur.left - last.left) < 1 &&
      Math.abs(cur.width - last.width) < 1 &&
      Math.abs(cur.height - last.height) < 1;
    if (same) {
      stableFrames++;
      if (stableFrames >= 2) return;
    } else {
      stableFrames = 0;
      last = cur;
    }
  }
}

/** Wait for scroll position to stop changing. */
async function waitForScrollSettled(timeoutMs = 800) {
  const start = performance.now();
  let last = window.scrollY;
  let stable = 0;
  while (performance.now() - start < timeoutMs) {
    await new Promise((r) => window.setTimeout(r, 80));
    const cur = window.scrollY;
    if (Math.abs(cur - last) < 1) {
      stable++;
      if (stable >= 2) return;
    } else {
      stable = 0;
      last = cur;
    }
  }
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

  // Track per-step listeners so we can clean them up.
  let cleanupCurrent: (() => void) | null = null;
  const runCleanup = () => {
    try {
      cleanupCurrent?.();
    } catch {
      /* noop */
    }
    cleanupCurrent = null;
  };

  const safeRefresh = (d: Driver, idx: number) => {
    try {
      const anyD = d as unknown as {
        refresh?: () => void;
        moveTo?: (i: number) => void;
      };
      if (typeof anyD.refresh === "function") anyD.refresh();
      else if (typeof anyD.moveTo === "function") anyD.moveTo(idx);
    } catch {
      /* noop */
    }
  };

  const applyDynamicPlacement = (
    d: Driver,
    idx: number,
    el: HTMLElement,
    def: TourStepDef,
  ) => {
    const requested =
      (def.popover?.side as "top" | "bottom" | "left" | "right" | undefined) ??
      "bottom";
    const best = pickBestSide(el, requested);
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const shouldStartAlign = mobile && rect.width > vw * 0.8;
    const nextAlign = shouldStartAlign ? "start" : (def.popover?.align ?? "center");

    // Mutate the step's popover in-place so refresh() picks it up.
    const s = steps[idx];
    if (s?.popover) {
      s.popover.side = best;
      s.popover.align = nextAlign as "start" | "center" | "end";
    }
    safeRefresh(d, idx);
  };

  const d = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: mobile ? 0.55 : 0.6,
    stagePadding: mobile ? 10 : 6,
    stageRadius: 12,
    smoothScroll: false,
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
    onDeselected: () => {
      runCleanup();
    },
    onDestroyed: () => {
      runCleanup();
      onClose?.();
    },
    steps: steps.map((s) => ({
      ...s,
      onHighlightStarted: async (_el, _step, ctx) => {
        runCleanup();
        const idx = ctx.state.activeIndex ?? 0;
        const def = steps[idx] as TourStepDef | undefined;
        if (!def) return;
        const needsNav = def.route && window.location.pathname !== def.route;
        if (needsNav) navigate(def.route!);

        if (!def.selector) {
          if (needsNav) {
            await new Promise((r) => window.setTimeout(r, 120));
            safeRefresh(d, idx);
          }
          return;
        }

        const el = (await waitForEl(
          def.selector,
          needsNav ? 4000 : 2500,
        )) as HTMLElement | null;
        if (!el) {
          const isLast = idx >= steps.length - 1;
          if (isLast) d.destroy();
          else d.moveNext();
          return;
        }

        // Wait for layout to stabilize (charts/tables mount late).
        await waitForStableRect(el);
        scrollElementIntoSafeView(el);
        await waitForScrollSettled();

        applyDynamicPlacement(d, idx, el, def);

        // Keep popover attached while element resizes or viewport changes.
        let raf = 0;
        const debounced = () => {
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const fresh = document.querySelector(def.selector!) as HTMLElement | null;
            if (fresh) applyDynamicPlacement(d, idx, fresh, def);
            else safeRefresh(d, idx);
          });
        };
        const ro = new ResizeObserver(debounced);
        try {
          ro.observe(el);
        } catch {
          /* noop */
        }
        window.addEventListener("resize", debounced);
        window.addEventListener("orientationchange", debounced);
        window.addEventListener("scroll", debounced, { passive: true });
        cleanupCurrent = () => {
          if (raf) cancelAnimationFrame(raf);
          ro.disconnect();
          window.removeEventListener("resize", debounced);
          window.removeEventListener("orientationchange", debounced);
          window.removeEventListener("scroll", debounced);
        };
      },
    })),
  });

  return d;
}
