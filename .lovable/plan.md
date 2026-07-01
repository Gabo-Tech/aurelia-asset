# Premium Dual-Mode Design System

Overhaul the theme tokens, typography, spacing, and icon defaults to deliver an editorial, high-end feel in both dark and light modes. Purely presentational changes - no business logic touched.

## 1. Fonts (`src/routes/__root.tsx`)

Replace the current Inter-only Google Fonts link with:
- **Playfair Display** (weights 400, 500) - headings
- **Plus Jakarta Sans** (weights 400, 500, 600, 700) - body/UI

(Satoshi and Cormorant Garamond are not free on Google Fonts; Playfair Display + Plus Jakarta Sans are the closest premium free equivalents from the pair mentioned in the brief. Confirm if you'd prefer self-hosted Satoshi/Cormorant via @fontsource - I can wire that instead.)

## 2. Theme tokens (`src/styles.css`)

Rewrite `:root` (Warm Editorial / light) and `.dark` (Dark Luxury) with the exact hex values from the brief:

```text
LIGHT (Warm Editorial)              DARK (Dark Luxury)
background      #FDFBF9              #0B0B0C
card/popover    #FFFFFF              #121214
border/input    #EAE8E4              #1F1F23
foreground      #1A1A1A              #E4E4E7
muted-fg        #71717A              #A1A1AA
primary         #121212 (espresso)   #C5A880 (champagne)
primary-fg      #FDFBF9              #0B0B0C
accent          #4A5243 (olive)      #F3F3F3 (off-white)
ring            = primary            = primary
```

- Secondary/muted surfaces derive from background with a hair of contrast.
- Chart palette retuned to muted editorial tones (olive, champagne, taupe, ink, terracotta) instead of the current bright blues/greens.
- Sidebar tokens follow card/border/foreground.
- Destructive/success/warning/info desaturated to fit the editorial palette (no neon).

## 3. Radius & shadows

- `--radius: 4px` (drives sm/md/lg/xl derivatives, all sharp).
- Remove `--shadow-elevated` heavy drop shadow; replace with an almost-invisible `0 1px 0 0 <border>` hairline used only where lift is needed.

## 4. Typography & spacing base styles

In `@layer base` of `src/styles.css`:
- `body` → `font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;` with tightened default line-height.
- `h1,h2,h3,h4` → `font-family: "Playfair Display", serif; font-weight: 400; letter-spacing: 0.06em;`
- Set `--font-sans` (Plus Jakarta) and add `--font-serif` (Playfair) tokens in `@theme inline` so `font-serif` utility works.
- Add a global utility bump: default form controls, cards, and buttons pick up the 4px radius; no changes to component APIs.

Breathing room: rather than editing every component, add a base rule that doubles default vertical rhythm on prose containers, and bump `AppShell` main content padding tokens (single edit) so the whole app inherits generous negative space.

## 5. Icons

- Add a global CSS rule targeting `svg.lucide` to set `stroke-width: 1.25` in dark mode and `1.5` in light mode (via `.dark svg.lucide { stroke-width: 1.25 }` and default `svg.lucide { stroke-width: 1.5 }`).
- Icon color inherits `currentColor` which resolves to the deep charcoal (light) or soft off-white (dark) foregrounds.

## 6. Driver.js / Toaster / misc overlays

Retune the existing Driver.js popover block and add matching Sonner toast overrides to use the new tokens, sharp 4px radius, and remove heavy shadows (replace with hairline border + `0 8px 24px -16px rgba(0,0,0,0.4)` in dark, none in light).

## 7. Root shell

- Update `<meta name="theme-color">` to switch per mode (`#0B0B0C` dark, `#FDFBF9` light) via a small script tweak alongside the existing theme init.

## Files touched

- `src/styles.css` (majority of the change)
- `src/routes/__root.tsx` (fonts link + theme-color)
- `src/components/app-shell.tsx` (padding rhythm only, if needed for breathing room)

## Out of scope

- No component refactors, no copy changes, no logic changes.
- Chart libraries (Recharts / d3-sankey) inherit via CSS vars already.
