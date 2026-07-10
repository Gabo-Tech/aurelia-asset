# Security Policy

## Reporting a vulnerability

Please report security issues privately to GABO via
https://solutions.gabo.rocks (contact form) rather than opening a public
GitHub issue.

Include:
- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- Affected version / commit
- Your name or handle if you want credit in the fix notes

You can expect an initial response within 7 days. Fixes for confirmed
issues are typically shipped within 30 days, faster for critical
findings.

## Scope

In scope:
- The web app and its server routes (`src/routes/api/**`)
- The Tauri native wrappers
- The admin panel (`/admin`)
- Local data storage and encryption

Out of scope:
- Vulnerabilities in third-party data providers (Finnhub, Yahoo, Stooq,
  CoinGecko, Binance) themselves
- Social-engineering attacks against the author or users
- Issues requiring physical access to an unlocked device

## Hardening already in place

- Sensitive values in `localStorage` are AES-GCM 256-bit encrypted with
  a non-extractable key stored in IndexedDB
- Admin endpoints use timing-safe password compare and per-IP rate
  limiting
- The same-origin finance proxy enforces an HTTPS host allow-list and a
  response size cap
- JSON imports are validated with Zod
- No third-party CORS proxy is used without being disclosed in Settings
- State exports redact user Finnhub API keys
- `.env` and local secrets are gitignored; server secrets belong in the host's secret store only

## Threat model notes

**Web vs desktop:** The web app runs in a browser sandbox. Tauri builds add a
native shell with minimal permissions (save dialog for exports, optional local
AI backends). Neither mode protects against malware on the device or a user who
leaves an unlocked session unattended.

**Client-side encryption:** AES-GCM encryption in the browser protects stored
data from casual inspection of `localStorage`. It does not protect against XSS
in the same origin, browser extensions with storage access, or forensic access
to an unlocked profile. See [`PRIVACY.md`](./PRIVACY.md) for details.

**AI model paths (native):** Users choose local model file paths in Settings.
Only enable local AI features if you trust the model files you download.

Thanks for helping keep users safe.
