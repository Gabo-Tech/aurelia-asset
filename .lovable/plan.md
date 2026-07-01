## Goal
Fix tour popovers so on desktop, tablet, and phone they consistently anchor to the correct element after the page finishes rendering, controls (Prev/Next) never disappear, and the popover never overlaps the highlighted element.

## Root causes
1. `refresh()` is called once ~200 ms after navigation, but many target pages (Holdings, Performance, Cashflow) render data in later frames (query hydration, sankey/chart mount). The popover positions against the old layout and looks misplaced.
2. Some steps use `contentTopSide = "top"` unconditionally; on desktop tall elements (charts, tables) get covered because there's no room above. Popovers can also cover the target when the safe scroll leaves the element flush against the viewport edge.
3. `refresh()` in the current driver.js build has cases where it re-renders as a standalone highlight, dropping footer buttons when the element reference changes between calls.
4. Sticky/fixed ancestors skip scrolling entirely, so header-anchored steps sometimes leave the popover off-screen on mobile.

## Fix plan (single file: `src/lib/tour/driver.ts`, plus small tweak in `src/lib/tour/steps.ts`)

### `driver.ts`
- Keep the same selectors (no changes to `steps.ts` selectors).
- Replace the single delayed `refresh()` with a **stabilization loop**:
  - After `waitForEl`, poll the element's `getBoundingClientRect()` every 100 ms until it's stable for 2 consecutive frames or 1.5 s elapses (covers late chart/table mount).
  - Then `scrollElementIntoSafeView` and wait for scroll to settle (poll `window.scrollY` similarly).
  - Then call `d.refresh()` once. If `refresh` is unavailable at runtime, fall back to `d.moveTo(idx)` which preserves multi-step context (keeps Prev/Next).
- Guarantee controls stay: never call `d.highlight()` mid-step. Use only `refresh()` / `moveTo(activeIndex)`.
- Add a `ResizeObserver` + `window` `resize`/`orientationchange` listener bound to the active element for the lifetime of the step; each change triggers a debounced `refresh()`. Disconnect on `onDeselected`.
- Safe-view scrolling:
  - Remove the "skip if sticky ancestor" early-return; instead, if sticky, just skip scrolling but still run refresh (so popover positions correctly).
  - Ensure `safeBottom - safeTop` accounts for popover height (~ 180 px reserved) so the popover never overlaps the element.
- Auto side selection: compute available space around the element (top/bottom/left/right minus insets and reserved popover height). Override `popover.side` at runtime when the requested side has < 200 px of space; pick the side with the most space. This prevents the popover from covering the highlighted element on any viewport.
- Alignment: on mobile force `align: "start"` when the element is wider than 80% of viewport, so popover doesn't overhang.

### `steps.ts`
- No selector changes.
- Change `contentTopSide` from hardcoded `"top"` to `"auto"` sentinel (`"bottom"` default), and let the driver's auto-side logic pick the best side per viewport. Keep `pageSide` as a hint but treated as preferred, not forced.

## Verification
- Run Playwright headless at 3 viewports (390×844 phone, 820×1180 tablet, 1440×900 desktop). Start the tour, step through every step, screenshot each. Assert popover bounding rect does not intersect the highlighted element rect, and that Prev/Next buttons exist in the DOM at every step.

## Out of scope
- No changes to selectors, translations, or step order.
- No visual redesign of the popover.
