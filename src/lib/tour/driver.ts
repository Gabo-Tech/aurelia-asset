import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const COMPLETED_KEY = "tour:completed:v2";

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

type Side = "top" | "bottom" | "left" | "right";

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

/** Realistic popover height budget so we never leave too little room. */
function getPopoverHeightBudget() {
  return isMobileViewport() ? 300 : 220;
}

const POPOVER_GAP = 12;
const MIN_CLEARANCE = 8;
const TARGET_WAIT_MS = 2000;

function getInsets() {
  const mobile = isMobileViewport();
  return {
    top: mobile ? 72 : 24,
    bottom: mobile ? 96 : 24,
    side: mobile ? 12 : 24,
  };
}

/**
 * Scroll so a contiguous popover band exists on `side` inside the safe viewport
 * (below sticky header / above bottom nav). Tall targets are pinned so the
 * highlight top (or bottom) stays visible and the opposite band is free.
 */
function scrollElementIntoSafeView(el: HTMLElement, side: Side) {
  if (hasStickyOrFixedAncestor(el)) return;
  if (side !== "top" && side !== "bottom") return;

  const rect = el.getBoundingClientRect();
  const { top: topInset, bottom: bottomInset } = getInsets();
  const vh = window.innerHeight;
  const popoverH = getPopoverHeightBudget();
  const gap = POPOVER_GAP;

  let targetY: number | null = null;

  if (side === "bottom") {
    // Popover sits under the target — keep target bottom above the popover band.
    const maxBottom = vh - bottomInset - popoverH - gap;
    const availableForTarget = maxBottom - topInset;
    if (rect.height > availableForTarget) {
      // Pin target top to safe top; bottom band reserved for popover.
      targetY = window.scrollY + rect.top - topInset;
    } else if (rect.bottom > maxBottom || rect.top < topInset) {
      // Full target visible with room below for the popover.
      targetY = window.scrollY + rect.bottom - maxBottom;
    }
  } else {
    // Popover sits above the target — keep target top below the popover band.
    const minTop = topInset + popoverH + gap;
    const availableForTarget = vh - bottomInset - minTop;
    if (rect.height > availableForTarget) {
      // Pin target bottom to safe bottom; top band reserved for popover.
      targetY = window.scrollY + rect.bottom - (vh - bottomInset);
    } else if (rect.top < minTop || rect.bottom > vh - bottomInset) {
      targetY = window.scrollY + rect.top - minTop;
    }
  }

  if (targetY == null) return;
  window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
}

/** Visible intersection of element with the safe viewport. */
function visibleTargetRect(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const { top: ti, bottom: bi } = getInsets();
  const vh = window.innerHeight;
  const top = Math.max(rect.top, ti);
  const bottom = Math.min(rect.bottom, vh - bi);
  return {
    top,
    bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: Math.max(0, bottom - top),
  };
}

/** Pick the side with enough room for the popover; prefer requested when possible. */
function pickBestSide(el: HTMLElement, preferred: Side): Side {
  const rect = el.getBoundingClientRect();
  const { top: ti, bottom: bi, side: si } = getInsets();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const need = getPopoverHeightBudget();
  const space = {
    top: rect.top - ti,
    bottom: vh - bi - rect.bottom,
    left: rect.left - si,
    right: vw - si - rect.right,
  };

  // Wide (near full-bleed) targets: only top/bottom make sense.
  if (rect.width > vw * 0.55) {
    if (preferred === "top" || preferred === "bottom") {
      if (space[preferred] >= need) return preferred;
      return space.top >= space.bottom ? "top" : "bottom";
    }
    return space.top >= space.bottom ? "top" : "bottom";
  }

  if (space[preferred] >= need) return preferred;

  // Prefer vertical sides first when height budget is the constraint.
  const vertical: Array<"top" | "bottom"> = ["top", "bottom"];
  vertical.sort((a, b) => space[b] - space[a]);
  if (space[vertical[0]] >= need * 0.6) return vertical[0];

  const ordered = (Object.keys(space) as Side[]).sort((a, b) => space[b] - space[a]);
  return ordered[0];
}

function rectsOverlap(a: DOMRect | { top: number; bottom: number; left: number; right: number }, b: DOMRect) {
  return !(a.bottom + MIN_CLEARANCE <= b.top || b.bottom + MIN_CLEARANCE <= a.top || a.right <= b.left || b.right <= a.left);
}

/**
 * If the rendered popover overlaps the highlight (or sits with no gap),
 * nudge it into the larger free band above/below the visible target.
 */
function nudgePopoverOffTarget(target: HTMLElement) {
  const pop = document.querySelector(".driver-popover") as HTMLElement | null;
  if (!pop) return;

  const tVis = visibleTargetRect(target);
  if (tVis.height < 1) return;

  const pRect = pop.getBoundingClientRect();
  if (!rectsOverlap(tVis, pRect)) {
    // Also fix "opposite side of screen" — popover far from target with huge gap
    // is OK if it's adjacent; only nudge when overlapping.
    return;
  }

  const { top: ti, bottom: bi, side: si } = getInsets();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const popH = pRect.height || getPopoverHeightBudget();
  const popW = Math.min(pRect.width || vw - si * 2, vw - si * 2);

  const spaceAbove = tVis.top - ti;
  const spaceBelow = vh - bi - tVis.bottom;
  const placeAbove = spaceAbove >= spaceBelow && spaceAbove >= popH * 0.5;

  let top: number;
  if (placeAbove) {
    top = Math.max(ti, tVis.top - POPOVER_GAP - popH);
  } else {
    top = Math.min(vh - bi - popH, tVis.bottom + POPOVER_GAP);
  }

  // Keep horizontally centered on mobile full-width popovers; otherwise clamp to target.
  let left: number;
  if (isMobileViewport() && popW > vw * 0.8) {
    left = (vw - popW) / 2;
  } else {
    left = Math.min(Math.max(si, tVis.left + (tVis.width - popW) / 2), vw - si - popW);
  }

  pop.style.position = "fixed";
  pop.style.top = `${Math.round(top)}px`;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.right = "auto";
  pop.style.bottom = "auto";
  pop.style.transform = "none";
  pop.style.margin = "0";

  // Hide arrow when we manually place — it often points the wrong way after nudge.
  const arrow = pop.querySelector(".driver-popover-arrow") as HTMLElement | null;
  if (arrow) arrow.style.display = "none";
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
  return Array.from(document.querySelectorAll(selector)).find(isVisibleElement) ?? null;
}

export async function waitForEl(selector: string, timeoutMs = 2500): Promise<Element | null> {
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
  /** Run after route navigation and before waiting for the selector. */
  prepare?: () => void | Promise<void>;
};

export function createTour(opts: {
  steps: TourStepDef[];
  navigate: (path: string) => void | Promise<unknown>;
  labels: { next: string; prev: string; done: string; skip: string; progress: string };
  onClose?: () => void;
}): Driver {
  const { steps, navigate, labels, onClose } = opts;

  const mobile = isMobileViewport();

  const driverSteps: DriveStep[] = steps.map((def) => ({
    ...def,
    // Never fall back to document.body — missing targets skip via prepareStep.
    // Non-null: prepareStep only advances when the selector is visible.
    element: def.selector ? () => getVisibleElement(def.selector!)! : undefined,
    popover: def.popover ? { ...def.popover } : undefined,
  }));

  /** Pick side first, assign to step, optionally re-pick after scroll. */
  const applySide = (idx: number, preferred: Side): Side => {
    const def = steps[idx];
    const step = driverSteps[idx];
    const el = def?.selector ? getVisibleElement(def.selector) : null;
    const popover = step?.popover;
    if (!el || !popover) return preferred;
    const side = pickBestSide(el, preferred);
    popover.side = side;
    const rect = el.getBoundingClientRect();
    const shouldStartAlign = mobile && rect.width > window.innerWidth * 0.8;
    popover.align = shouldStartAlign ? "start" : (popover.align ?? "center");
    return side;
  };

  const syncPopoverContent = (idx: number) => {
    const popover = driverSteps[idx]?.popover;
    const title = document.querySelector(".driver-popover-title");
    const description = document.querySelector(".driver-popover-description");
    const progress = document.querySelector(".driver-popover-progress-text");
    if (title && popover?.title) title.textContent = popover.title;
    if (description && popover?.description) {
      description.textContent = popover.description;
    }
    if (progress) {
      progress.textContent = labels.progress
        .replace("{{current}}", String(idx + 1))
        .replace("{{total}}", String(steps.length));
    }
  };

  const enforceNoOverlap = (idx: number) => {
    const def = steps[idx];
    if (!def?.selector) return;
    const el = getVisibleElement(def.selector);
    if (!el) return;
    nudgePopoverOffTarget(el);
  };

  const prepareStep = async (idx: number): Promise<boolean> => {
    const def = steps[idx];
    if (!def) return false;
    let navigated = false;
    if (def.route && window.location.pathname !== def.route) {
      await Promise.resolve(navigate(def.route));
      await waitForPath(def.route);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      navigated = true;
    }

    if (def.prepare) {
      await Promise.resolve(def.prepare());
      navigated = true;
    }

    if (!def.selector) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return true;
    }

    const el = navigated
      ? await waitForVisibleEl(def.selector, TARGET_WAIT_MS)
      : getVisibleElement(def.selector);
    if (!el) return false;
    await waitForStableRect(el);

    const preferred =
      (def.popover?.side as Side | undefined) ??
      (driverSteps[idx]?.popover?.side as Side | undefined) ??
      "bottom";

    // 1) Decide side → 2) scroll for that side → 3) re-pick after scroll
    let side = applySide(idx, preferred);
    scrollElementIntoSafeView(el, side);
    await waitForScrollSettled();
    side = applySide(idx, side);

    return Boolean(getVisibleElement(def.selector));
  };

  const d = driver({
    showProgress: true,
    allowClose: true,
    allowKeyboardControl: false,
    overlayOpacity: mobile ? 0.85 : 0.88,
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
      if (!popover.footerButtons.querySelector(".driver-skip-btn")) {
        const skip = document.createElement("button");
        skip.innerText = labels.skip;
        skip.className = "driver-skip-btn";
        skip.onclick = () => d.destroy();
        popover.footerButtons.appendChild(skip);
      }
      const idx = d.getActiveIndex() ?? 0;
      // After driver places the popover, correct any overlap.
      requestAnimationFrame(() => enforceNoOverlap(idx));
    },
    onDestroyed: () => {
      onClose?.();
    },
    onCloseClick: () => d.destroy(),
    onDoneClick: () => d.destroy(),
    steps: driverSteps,
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
          const current = d.getActiveIndex();
          if (!d.isActive() || current === undefined) originalDrive(idx);
          else if (idx === current + 1) d.moveNext();
          else if (idx === current - 1) d.movePrevious();
          else d.moveTo(idx);
          syncPopoverContent(idx);
          const revealAndSync = () => {
            d.refresh();
            syncPopoverContent(idx);
            // Nudge after refresh so driver doesn't leave us overlapping.
            enforceNoOverlap(idx);
          };
          requestAnimationFrame(revealAndSync);
          // Second pass: refresh can re-overlap; nudge again without another refresh.
          window.setTimeout(() => {
            syncPopoverContent(idx);
            enforceNoOverlap(idx);
          }, 80);
          window.setTimeout(() => {
            syncPopoverContent(idx);
            enforceNoOverlap(idx);
          }, 220);
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
