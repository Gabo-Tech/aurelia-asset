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
const TARGET_WAIT_MS = 4500;

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

function isVisibleElement(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  return el.getClientRects().length > 0;
}

function getVisibleElement(selector: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll(selector)).find(isVisibleElement) ?? null
  );
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

async function waitForVisibleEl(
  selector: string,
  timeoutMs = TARGET_WAIT_MS,
): Promise<HTMLElement | null> {
  if (typeof document === "undefined") return null;
  const started = performance.now();
  return new Promise((resolve) => {
    let raf = 0;
    const done = (el: HTMLElement | null) => {
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(el);
    };
    const check = () => {
      const el = getVisibleElement(selector);
      if (el) {
        done(el);
        return;
      }
      if (performance.now() - started >= timeoutMs) {
        done(null);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    const timeout = window.setTimeout(() => done(null), timeoutMs);
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    check();
  });
}

async function waitForPath(path: string, timeoutMs = 2500) {
  const started = performance.now();
  while (window.location.pathname !== path && performance.now() - started < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
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
  navigate: (path: string) => void | Promise<unknown>;
  labels: { next: string; prev: string; done: string; skip: string; progress: string };
  onClose?: () => void;
}): Driver {
  const { steps, navigate, labels, onClose } = opts;

  const mobile = isMobileViewport();

  const materializeStep = (def: TourStepDef): DriveStep => {
    const el = def.selector ? getVisibleElement(def.selector) : null;
    const popover = def.popover ? { ...def.popover } : undefined;
    if (el && popover) {
      const requested =
        (popover.side as "top" | "bottom" | "left" | "right" | undefined) ??
        "bottom";
      popover.side = pickBestSide(el, requested);
      const rect = el.getBoundingClientRect();
      const shouldStartAlign = mobile && rect.width > window.innerWidth * 0.8;
      popover.align = shouldStartAlign ? "start" : (popover.align ?? "center");
    }
    return {
      ...def,
      element: el ?? undefined,
      popover,
    };
  };

  const materializeSteps = () => steps.map(materializeStep);

  const prepareStep = async (idx: number): Promise<boolean> => {
    const def = steps[idx];
    if (!def) return false;
    if (def.route && window.location.pathname !== def.route) {
      await Promise.resolve(navigate(def.route));
      await waitForPath(def.route);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }

    if (!def.selector) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return true;
    }

    const el = await waitForVisibleEl(def.selector);
    if (!el) return false;
    await waitForStableRect(el);
    scrollElementIntoSafeView(el);
    await waitForScrollSettled();

    return Boolean(getVisibleElement(def.selector));
  };

  const d = driver({
    showProgress: true,
    allowClose: true,
    allowKeyboardControl: false,
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
      if (popover.footerButtons.querySelector(".driver-skip-btn")) return;
      const skip = document.createElement("button");
      skip.innerText = labels.skip;
      skip.className = "driver-skip-btn";
      skip.onclick = () => d.destroy();
      popover.footerButtons.appendChild(skip);
    },
    onDestroyed: () => {
      onClose?.();
    },
    onCloseClick: () => d.destroy(),
    onDoneClick: () => d.destroy(),
    steps: materializeSteps(),
  });

  const originalDrive = d.drive.bind(d);
  let moving = false;

  const showStep = async (requestedIdx: number, direction: 1 | -1 = 1) => {
    if (moving) return;
    moving = true;
    try {
      let idx = requestedIdx;
      while (idx >= 0 && idx < steps.length) {
        const ready = await prepareStep(idx);
        if (ready) {
          d.setSteps(materializeSteps());
          const current = d.getActiveIndex();
          if (!d.isActive() || current === undefined) originalDrive(idx);
          else if (idx === current + 1) d.moveNext();
          else if (idx === current - 1) d.movePrevious();
          else d.moveTo(idx);
          requestAnimationFrame(() => d.refresh());
          return;
        }
        idx += direction;
      }
      if (direction > 0) d.destroy();
    } finally {
      moving = false;
    }
  };

  d.setConfig({
    ...d.getConfig(),
    onNextClick: (_el, _step, ctx) => {
      const idx = ctx.state.activeIndex ?? 0;
      if (idx >= steps.length - 1) d.destroy();
      else void showStep(idx + 1, 1);
    },
    onPrevClick: (_el, _step, ctx) => {
      const idx = ctx.state.activeIndex ?? 0;
      if (idx <= 0) return;
      void showStep(idx - 1, -1);
    },
  });

  d.drive = (stepIndex = 0) => {
    void showStep(stepIndex, 1);
  };

  return d;
}

