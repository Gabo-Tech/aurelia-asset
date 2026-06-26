# Internationalization Plan

Add multi-language support for **English (default), Spanish, Portuguese, Dutch, German, Valencià** across the whole app, including the landing page.

## Stack

- `i18next` + `react-i18next` + `i18next-browser-languagedetector`
- Translation files as TypeScript modules under `src/i18n/locales/{lang}.ts` (one object per language). No JSON loader, no async — bundled directly so SSR/landing page work without flicker.

## Files

1. `src/i18n/index.ts` — init i18next, language detector order: `localStorage('ept_lang') → navigator → 'en'`. Fallback `en`. Supported: `en, es, pt, nl, de, ca-valencia`.
2. `src/i18n/locales/en.ts` — canonical key set. Namespaces flattened into one resource per locale with sections: `common`, `nav`, `landing`, `dashboard`, `cashflow`, `holdings`, `performance`, `settings`, `admin`, `categories`, `recurrence`, `errors`.
3. `src/i18n/locales/{es,pt,nl,de,ca}.ts` — mirror of `en.ts` translated.
4. `src/i18n/use-language.ts` — small hook exposing `language`, `setLanguage(code)` which also persists to secure storage key `ept_lang` so it rides along with the export.

## Wiring

- Import `./i18n` at the top of `src/router.tsx` (runs once before any route).
- Replace hardcoded English strings in all routes/components with `t('section.key')`. Keep numeric/date formatting via `Intl.NumberFormat(language, …)` where the current `format.ts`/`mask` helpers are touched (pass `language` through where relevant; otherwise keep `en-US` defaults to avoid breaking the currency formatter).
- Landing page (`src/routes/index.tsx`) gets its full copy moved into the `landing.*` keys, including `<title>`/meta in `head()` (built from `t()` at render time).

## Settings panel

- New "Language" card in `src/routes/settings.tsx` with a `Select` listing the six languages. Writing the value calls `setLanguage()` which:
  - `i18n.changeLanguage(code)`
  - persists via existing secure storage helper under key `ept_lang`
- Default on first load: detected browser language if supported, else English.

## Export / Import

- Update `exportEnvelopeSchema` in `src/routes/settings.tsx` to add `preferences.language` (optional string, enum of supported codes).
- Export builder reads current `i18n.language` and any other `ept_*` preference keys already gathered, ensuring `ept_lang` is included.
- Import applies `preferences.language` via `i18n.changeLanguage` after restoring storage.
- Existing JSON files without the field still import (optional field, defaults preserved).

## Out of scope

- Translating user-entered content (category names, descriptions, holding labels) — those stay verbatim.
- RTL languages — none required.
- Server-side translation of server-function error messages — kept English; UI wraps them with `t('errors.generic')` where surfaced.

## Technical notes

- Translation files are plain TS objects typed against the English shape (`type Translation = typeof en`) so missing keys are a typecheck error.
- Valencià code: use `ca-valencia` (BCP-47 compatible) — i18next treats it as its own resource; fallback chain `ca-valencia → ca → en`.
- All `t()` calls memoize through react-i18next; no perf concern.
- Translation quality: I will produce idiomatic translations directly (no external API call). You can refine any wording later by editing the locale files.
