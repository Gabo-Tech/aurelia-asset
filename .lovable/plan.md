## Plan

1. **Restore a stable Driver.js tour flow**
   - Remove the fragile in-step `refresh()` / dynamic mutation loop that is causing zero-size highlights and misplaced popovers.
   - Keep Driver.js in normal multi-step mode so **Back / Next / Skip** controls never disappear.

2. **Make navigation between pages reliable**
   - Before each step, navigate to the target route if needed.
   - Wait for the route content and selected `[data-tour="..."]` element to exist and have a real visible size before Driver.js highlights it.
   - If a target is not available for the current data state, skip that step cleanly instead of highlighting the page center.

3. **Use the same selectors everywhere**
   - Keep the existing `data-tour` selectors for desktop, tablet, and phone.
   - Only adjust popover side/align responsively, not the target selectors.

4. **Fix mobile and tablet placement**
   - Respect the sticky mobile header and bottom navigation.
   - Scroll targets into a safe visible area before the step is shown.
   - Place popovers on the side with enough space so they do not cover the highlighted element.

5. **Verify across desktop, tablet, and phone**
   - Run the tour through the important steps on desktop, tablet, and phone sizes.
   - Confirm highlights attach to the correct elements, popovers stay near but not over targets, and controls remain visible throughout.