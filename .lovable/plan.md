## Plan

1. **Add a same-origin finance proxy route**
   - Create a server route such as `/api/finance-proxy` that fetches allowed finance API URLs from the app backend.
   - This avoids browser CORS completely because the frontend only calls our own app origin.

2. **Lock it down with an allowlist**
   - Only allow the finance providers the app already uses: Yahoo Finance, CoinGecko, Binance, Stooq, Finnhub, and FX providers.
   - Reject unknown hosts, non-HTTPS URLs, oversized responses, and unsupported methods.
   - Keep it read-only with `GET` only.

3. **Update the finance client fallback chain**
   - Try direct requests first for CORS-friendly APIs like CoinGecko, Binance, and FX.
   - If direct fails, use the same-origin proxy.
   - Public CORS proxies become optional legacy fallbacks only when the user explicitly enables them in Settings.

4. **Fix the 403 loop behavior**
   - Treat proxy 403/429/5xx as a failed attempt and continue to the next provider instead of repeatedly retrying the same broken proxy.
   - Keep per-provider cooldowns so a failing provider does not spam requests while typing or refreshing prices.

5. **Improve search reliability**
   - For stock/ETF search, Yahoo will go through the same-origin proxy when direct access fails.
   - Add a lightweight Stooq symbol search fallback where possible, so manual ticker discovery still works if Yahoo blocks.

6. **Keep history cache behavior**
   - Preserve the new max-history local cache so period switches slice cached data instead of repeatedly calling APIs.
   - Add stale-cache fallback when live refresh fails, so charts do not go empty just because providers are down.

## Technical details

- New route will use TanStack Start server route handlers, not external CORS services.
- The route will validate the target URL before fetching to avoid turning it into an open proxy.
- `src/lib/finance/client.ts` will route failed browser requests through `/api/finance-proxy?url=...`.
- Existing provider modules can stay mostly unchanged because they already call `fetchWithFallback`.