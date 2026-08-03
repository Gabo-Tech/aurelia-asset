# Aurelia Asset — Web build

Marketing site, landing page, and admin/sponsors panel for [financetracker.putopulse.org](https://financetracker.putopulse.org).

The **finance tracker app** for mobile/desktop is the React Native project at the repository root. This `web/` package is a separate Vite + TanStack Start build.

## Develop

```bash
cd web
npm ci
npm run dev
```

## Build / deploy

```bash
cd web
npm run build
```

Deploy `.output` (or your Nitro target) as before. Env vars: see `.env.example`.

## Note

Tauri native bindings were moved to `../archive/src-tauri` and are no longer used for shipping the tracker. Optional historical desktop builds can still be explored from that archive; the supported native path is React Native at the repo root.
