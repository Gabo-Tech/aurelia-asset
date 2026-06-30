## Goal

Make price/history fetching resilient: chain multiple free quote providers and CORS proxies with automatic fallback, and stop re-hitting APIs for each period by caching full per-asset history locally and slicing from it.

## Part 1 - Provider fallback chain

Today: Yahoo first → Finnhub only as a last-resort quote fallback (no key by default, so it silently no-ops). Crypto: CoinGecko only. No retry across providers for history.

Add a unified resolver per asset class:

**Stocks / ETFs / metals** (`src/lib/finance/index.ts`):
quote chain → `yahoo` → `stooq` (CSV, no key, very permissive CORS) → `finnhub` (if key)
history chain → `yahoo` → `stooq` (daily CSV `d1`, gives full history in one call) → `finnhub` (if key)

**Crypto**:
quote chain → `coingecko` → `coincap` (`api.coincap.io/v2/assets/{id}`, no key) → `binance` (`api.binance.com/api/v3/ticker/price?symbol=XXXUSDT`)
history chain → `coingecko` → `coincap` (`/v2/assets/{id}/history?interval=d1`) → `binance` klines

**FX** (`src/lib/finance/fx.ts`): already has open.er-api fallback - extend with `frankfurter.app` (ECB, no key, CORS-enabled) as a 3rd link.

Resolver behavior:
- Try providers in order; on any throw or empty result, advance to next.
- On first success, return immediately (no further calls).
- Mark each provider with a short-lived "cooldown" (e.g. 60s) after a failure so a known-down provider isn't retried on the next asset in the same refresh pass.
- Expose `lastProvider` per holding (kept in memory, not persisted) so we can later surface "data from X" in the UI if desired - out of scope for this change unless you want it.

## Part 2 - CORS proxy fallback

Already partially there in `client.ts` (`fetchJsonWithFallback` walks `FALLBACK_PROXIES`). Improvements:
- Try direct first when not on `localhost` (some providers like CoinGecko/Stooq/Frankfurter work without proxy from the browser).
- On HTTP 4xx that isn't 429, don't bother trying more proxies (the URL itself is bad).
- On network error / 429 / 5xx, advance to next proxy.
- Same per-proxy cooldown idea as providers.
- Keep the disclosed proxy list (`corsproxy.io`, `allorigins.win`) - no undisclosed additions, per the prior security finding.

## Part 3 - Local "max history" cache, period-sliced reads

Today: each period button refetches that exact range, so 1D/7D/1M each cost an API call and the short ranges are the ones rate-limited hardest.

New flow in `src/lib/finance/index.ts`:

1. Introduce `fetchMaxHistory(holding)` that pulls the longest range each provider supports in one shot:
   - Yahoo: `range=max`
   - Stooq: full daily CSV (always full history)
   - CoinGecko: `days=max`
   - CoinCap: `interval=d1` from genesis
2. Persist the resulting `PricePoint[]` per holding under a versioned cache key in the existing `cache.ts` store (it already mirrors to `localStorage`). TTL: 24h for daily granularity, refreshed lazily on next access.
3. `fetchHistorical(h, period)` becomes: read full series from cache (fetch + persist on miss) → slice to the requested period window in memory. No network call for period switches once the asset is warm.
4. Intraday (`1D`) keeps a separate short-TTL path because daily granularity can't render it - falls through the same provider chain but with a `1d`/`days=1` request and a 5-min TTL.
5. Add a "Refresh history" affordance in Settings to force-evict the cache.

## Part 4 - Files touched

- `src/lib/finance/client.ts` - smarter `fetchJsonWithFallback` (direct-first, cooldowns, status-aware).
- `src/lib/finance/index.ts` - provider chains, `fetchMaxHistory`, period slicing.
- `src/lib/finance/yahoo.ts` - unchanged API, but tolerate empty results without throwing so the chain advances cleanly.
- `src/lib/finance/coingecko.ts` - same tolerance fix.
- New `src/lib/finance/stooq.ts` - CSV parser for `https://stooq.com/q/d/l/?s={symbol}&i=d`.
- New `src/lib/finance/coincap.ts` - assets + history endpoints.
- New `src/lib/finance/binance.ts` - ticker + klines fallback for crypto.
- `src/lib/finance/fx.ts` - add Frankfurter as 3rd provider.
- `src/lib/finance/cache.ts` - add a `bust(prefix)` helper for the Settings "Refresh history" button.
- `src/routes/settings.tsx` - small "Clear price cache" button.

## Out of scope

- Server-side proxy via a TanStack server route (would remove the CORS-proxy dependency entirely). Happy to add as a follow-up if you want zero reliance on public proxies.
- UI to show which provider answered.
- Replacing CoinGecko with a paid tier or adding new key-required providers (Alpha Vantage, Twelve Data, Polygon).
