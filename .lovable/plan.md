## Goal

Rewrite the landing page copy as a professional copywriter would: speak directly to the visitor ("Your…", "You get…", "See where your money…"), lead every feature with the user benefit (not the mechanic), and highlight the tracker's most differentiating capabilities. Keep the current page structure and components intact — this is a pure copy pass through the i18n strings.

## Voice & rules

- Second person, present tense, active verbs. Warm, confident, minimal.
- Every feature bullet: benefit-first sentence, then a short "how" clause.
- No jargon dumps, no exclamation points, no emoji.
- Keep headings short enough to fit current layout (H1 ≤ 60 chars, feature titles ≤ ~34 chars).
- Preserve all i18n keys — only values change. No component or route edits.

## Sections rewritten (English source of truth)

1. **Hero** — sharpen the promise, keep the "Your …" pattern.
   - `hero.titleStart`: "Your money,"
   - `hero.titleHighlight`: "finally in one calm place"
   - `hero.subtitle`: benefit-led — see everything you own, understand where your cash goes, and plan what's next, all without an account.
   - `hero.badge`, CTAs tightened.

2. **Social proof strip** — swap the four chips for outcome-oriented phrases (e.g. "You keep your data", "Works on any device", "Every currency you use", "Open source you can audit").

3. **Features (6 cards)** — reframe each around a benefit the visitor gets. Cover the tracker's strongest capabilities beyond what's currently listed:
   - All holdings unified (stocks, ETFs, crypto, metals, cash, custom).
   - Live prices with your own Finnhub key optional.
   - Sankey cashflow with drag-to-reorder, monthly reset, period selector.
   - Planning suite: budgets, savings goals, 24-month forecast, loan amortization.
   - Credit cards & installments tied to cashflow.
   - Recurring + one-off, percentage entries (taxes), multi-currency conversion.
   - Private by design: local, AES-GCM encrypted storage, export anytime.
   - Native apps for every platform + PWA in the browser.
   - Six languages incl. Valencià.
   Because there are only 6 card slots, pick the 6 highest-value benefits and fold the rest into the subheading and the FAQ.

4. **How it works (3 steps)** — rewrite as visitor actions with the payoff: "Open it", "Add what you own and what you spend", "See the full picture update in real time".

5. **Comparison table** — keep rows, rewrite labels so each row reads as a benefit the visitor gets ("You keep your data", "You pay nothing, ever", …). Column headers stay.

6. **FAQ** — rewrite the 4 existing Q&As in the same voice and add coverage of the newer features via the answers (encryption, native apps, live prices, planning) without adding new keys.

7. **Final CTA + footer tagline + meta** — tighten to a single promise: "Take control of your money in 60 seconds." Update `meta.title` / `meta.description` / `meta.keywords` for SEO with the new positioning while staying within Google's length limits.

8. **Downloads section** — keep as-is (already benefit-clear); only refresh `heading` / `subheading` to match the new voice.

## Localization

Apply the same rewrite, faithfully translated and equally benefit-led, to all six locale files so the site stays consistent:

- `src/i18n/locales/en.ts` (source)
- `src/i18n/locales/es.ts`
- `src/i18n/locales/pt.ts`
- `src/i18n/locales/de.ts`
- `src/i18n/locales/nl.ts`
- `src/i18n/locales/ca.ts` (Valencià)

Only the `landing.*` subtree is touched in each file. No key additions or removals, so no component changes are needed and existing translations for the rest of the app stay intact.

## Out of scope

- No layout, component, or route changes.
- No new images or assets.
- No changes to dashboard/holdings/cashflow/planning/settings copy.
