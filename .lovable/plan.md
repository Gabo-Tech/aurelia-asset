## Goal

Add a detailed, step-by-step onboarding tour that walks users through every page of the app (Dashboard, Holdings, Performance, Cashflow, Settings) and explains each major functionality. Fully translated into the 6 supported languages (EN, ES, PT, NL, DE, CA).

## Library choice

Use **Driver.js v1** (`driver.js`):
- Lightweight (~5KB gzipped), zero dependencies
- MIT licensed, actively maintained
- Built-in multi-step tours, highlighting, popovers, keyboard nav, progress, custom buttons
- Easy theming via CSS variables so it matches our dark/light palette
- Works with SPA route changes (we drive it manually between steps)

Alternative considered: Shepherd.js (heavier, Tippy-based) and Intro.js (AGPL/commercial split). Driver.js wins on weight + license.

## UX flow

1. **Auto-start once**: on first visit after onboarding, show a welcome modal ("Take the tour?" / "Skip"). Persisted in localStorage (`tour:completed:v1`) so it never auto-shows again.
2. **Manual restart**: a "Take the tour" button in Settings → Help, plus a small `?` (HelpCircle) icon in the top header next to the language switcher available on every page.
3. **Cross-page tour**: the tour is a single sequence that navigates between routes using `useNavigate`. Between routes it waits for the target selector to mount (small `waitForEl` helper with timeout) before showing the next popover.
4. **Skippable + resumable**: user can close anytime; we save the last completed step index so "Resume tour" appears if they bailed out.
5. **Mobile**: on small viewports we shorten popover text and skip steps that target desktop-only elements (sidebar items). Mobile gets its own step list pointing at the bottom nav.

## Tour content (sections)

Each step = highlighted element + title + description. Steps grouped per page:

- **Welcome** (centered modal): what the app does, privacy note (local-only encrypted storage).
- **Shell**: sidebar nav, currency switcher, privacy/eye toggle, theme toggle, language switcher.
- **Dashboard**: net worth vs portfolio value vs liquidity stat cards, allocation pie, breakdown list, top asset card.
- **Holdings**: add holding button, horizon (short/long term), search + type filter, table sort, row actions (edit, add transaction, refresh price), transactions panel (filters, totals, export).
- **Performance**: period selector, asset legend toggles, portfolio chart, fullscreen + PNG export, returns-by-asset table.
- **Cashflow**: add entry form (recurring vs one-off, percent amounts), categories manager, Sankey flow (drag to reorder, label modes, color customization), entries panel (filters, edit, PDF export), credit cards + loans + transfers.
- **Settings**: currency, language, theme, CORS proxy, export/import (encrypted), GitHub repo link, restart tour.
- **Wrap-up** (centered): link to landing page Downloads and "Made by GABO" footer.

Approx. 35-45 steps total. Each step ≤ 2 short sentences to stay scannable.

## i18n

All step titles and descriptions live in a new namespace `tour.*` inside each `src/i18n/locales/{en,es,pt,nl,de,ca}.ts`. No hardcoded strings inside the tour module.

Keys structure:
```
tour: {
  start: "Take the tour",
  skip: "Skip",
  next: "Next",
  prev: "Back",
  done: "Done",
  welcomeTitle: "...",
  welcomeBody: "...",
  steps: {
    sidebar: { title, body },
    currency: { title, body },
    ... (one per step)
  }
}
```

## Files to add / modify

**New**
- `src/lib/tour/driver.ts` - thin wrapper around Driver.js (init, theme, waitForSelector, navigateThenHighlight, persistence helpers).
- `src/lib/tour/steps.ts` - exports `buildTourSteps(t, navigate, isMobile)` returning the ordered step list with `element` selectors + i18n keys.
- `src/components/tour-launcher.tsx` - the HelpCircle button (header) + auto-start logic on mount, listens for a custom `"app:start-tour"` event so Settings can trigger it.
- `src/components/tour-welcome-dialog.tsx` - first-visit welcome modal.

**Modified**
- `src/components/app-shell.tsx` - add `data-tour="..."` attributes to sidebar items, currency switcher, privacy toggle, theme toggle, language switcher, bottom-nav items; mount `<TourLauncher />` in header.
- `src/routes/dashboard.tsx`, `holdings.tsx`, `performance.tsx`, `cashflow.tsx`, `settings.tsx` - add `data-tour="..."` hooks on the elements the tour targets (no UI changes). Settings gets a "Restart tour" button.
- `src/styles.css` - small block overriding Driver.js CSS variables to match our palette (popover bg, border, accent, overlay opacity) for both light and dark.
- `src/i18n/locales/{en,es,pt,nl,de,ca}.ts` - add the `tour` namespace, fully translated.
- `package.json` - add `driver.js`.

## Technical notes

- Driver.js is client-only; we import it inside an effect / event handler to avoid SSR issues.
- `waitForEl(selector, timeoutMs=2000)` uses a `MutationObserver` to wait for cross-route navigations to render the target before showing the next popover.
- Selectors use `data-tour` attributes only (no class/id coupling) so future refactors don't break the tour.
- Persistence keys: `tour:completed:v1` (bool), `tour:lastStep:v1` (number). Stored via the existing `secure-storage` wrapper so it's encrypted like the rest.
- Bundle impact: ~6 KB gzipped + step strings (loaded on demand via dynamic import of `steps.ts` when the user actually starts the tour).

## Out of scope

- Video/animated demos
- Per-feature tooltips outside the tour
- Analytics on which step users drop off (no telemetry in this app)
