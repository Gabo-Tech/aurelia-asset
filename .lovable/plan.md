## Sponsor banner placement

Mirror Threadly's pattern: keep the sidebar card AND add an inline sponsor strip at the bottom of every page, just above the existing "Local-only · data stays in your browser" footer line. Visible on both desktop and mobile.

### Changes

**`src/components/app-shell.tsx`**
- Inside `<main>`, after `{children}`, add a page-bottom footer block:
  - A thin top border, centered layout, small muted text
  - Left/center: existing tagline "Local-only · data stays in your browser" (moved from the sidebar bottom into this shared footer so mobile also sees it)
  - Right (or wrapping below on mobile): `<SponsorBanner variant="inline" />`
- Keep the sidebar `<SponsorBanner variant="card" />` as-is for desktop.
- Remove the duplicated tagline at the bottom of the desktop sidebar (now lives in the shared page footer) — or keep it; will keep sidebar tagline removed to avoid duplication.
- Ensure mobile bottom-nav (`pb-24`) padding still clears the new footer; adjust spacing if needed.

### Result
- Desktop: sponsor card in sidebar + inline sponsor pill in page footer.
- Mobile: inline sponsor pill in page footer (above the fixed bottom nav).
- No changes to admin panel, data layer, or rotation logic.
