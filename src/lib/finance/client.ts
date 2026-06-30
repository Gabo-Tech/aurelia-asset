import { DEFAULT_STATE, type Settings } from "../types";

// Only proxies surfaced in the Settings UI are used. Adding undisclosed
// fallbacks would silently leak portfolio queries to services the user
// never consented to.
const DISCLOSED_PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
];

// Per-proxy cooldowns so a known-down proxy isn't retried for every asset in
// the same refresh pass.
const COOLDOWN_MS = 60_000;
const cooldown = new Map<string, number>();

function markDown(proxy: string) {
  cooldown.set(proxy, Date.now() + COOLDOWN_MS);
}
function isDown(proxy: string) {
  const t = cooldown.get(proxy);
  return t ? t > Date.now() : false;
}

let settingsSnapshot: Settings = DEFAULT_STATE.settings;

export function setSettingsSnapshot(s: Settings) {
  settingsSnapshot = { ...DEFAULT_STATE.settings, ...s };
}

function getSettings(): Settings {
  return settingsSnapshot;
}

export function proxied(url: string) {
  const s = getSettings();
  if (!s.useCorsProxy) return url;
  const proxy = s.corsProxy || DISCLOSED_PROXIES[0];
  return proxy + encodeURIComponent(url);
}

function sameOriginProxy(rawUrl: string) {
  return `/api/finance-proxy?url=${encodeURIComponent(rawUrl)}`;
}

function isDisclosedProxyAttempt(url: string) {
  return DISCLOSED_PROXIES.some((p) => url.startsWith(p));
}

/** Build attempt chain: direct when useful, then our same-origin proxy, then optional disclosed public proxies. */
function buildAttempts(rawUrl: string, preferDirect: boolean): string[] {
  const s = getSettings();
  const out: string[] = [];
  // Try direct first when the caller hints the endpoint is CORS-friendly,
  // OR when the user has explicitly disabled public proxies.
  if (preferDirect || !s.useCorsProxy) out.push(rawUrl);
  if (typeof window !== "undefined") out.push(sameOriginProxy(rawUrl));
  // Native/static builds may not have a Start server route available, so keep
  // a direct request in the chain after the same-origin proxy attempt.
  if (!preferDirect && s.useCorsProxy) out.push(rawUrl);
  if (!s.useCorsProxy) return Array.from(new Set(out));

  const primary = s.corsProxy || DISCLOSED_PROXIES[0];
  const ordered = [primary, ...DISCLOSED_PROXIES.filter((p) => p !== primary)];
  for (const p of ordered) {
    if (!isDown(p)) out.push(p + encodeURIComponent(rawUrl));
  }
  // If everything is in cooldown, still try them (least-recently-failed first).
  if (out.length === (preferDirect || !s.useCorsProxy ? 1 : 0)) {
    for (const p of ordered) out.push(p + encodeURIComponent(rawUrl));
  }
  return Array.from(new Set(out));
}

export function getFinnhubKey() {
  return getSettings().finnhubKey;
}

export type FetchOpts = {
  /** Try the raw URL first before falling back to a proxy. */
  preferDirect?: boolean;
  /** Response type. Default JSON. */
  as?: "json" | "text";
};

async function fetchOnce(url: string, as: "json" | "text"): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: as === "json" ? "application/json" : "text/plain, */*" },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return as === "json" ? await res.json() : await res.text();
}

export async function fetchJson<T>(url: string, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchWithFallback<T>(url, { preferDirect: true });
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchWithFallback<T>(
  rawUrl: string,
  opts: FetchOpts = {},
): Promise<T> {
  const as = opts.as ?? "json";
  const attempts = buildAttempts(rawUrl, !!opts.preferDirect);
  let lastErr: unknown;
  for (const candidate of attempts) {
    try {
      const data = await fetchOnce(candidate, as);
      if (
        as === "text" &&
        typeof data === "string" &&
        /<(?:!doctype|html|body)\b/i.test(data.slice(0, 500))
      ) {
        throw new Error("Unexpected HTML response");
      }
      return data as T;
    } catch (e) {
      lastErr = e;
      // Mark a proxy as down so other callers skip it briefly.
      for (const p of DISCLOSED_PROXIES) {
        if (candidate.startsWith(p)) markDown(p);
      }
    }
  }
  throw lastErr;
}

/** Back-compat shim for existing callers. */
export async function fetchJsonWithFallback<T>(rawUrl: string): Promise<T> {
  return fetchWithFallback<T>(rawUrl);
}
