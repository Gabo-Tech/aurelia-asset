import { DEFAULT_STATE, type Settings } from "../types";

// Only proxies surfaced in the Settings UI are used. Adding undisclosed
// fallbacks would silently leak portfolio queries to services the user
// never consented to.
const FALLBACK_PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
];


// In-memory snapshot pushed by the store after decrypting state from disk.
// We can't read encrypted localStorage synchronously, so the store keeps
// this projection in sync.
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
  const proxy = s.corsProxy || FALLBACK_PROXIES[0];
  return proxy + encodeURIComponent(url);
}

/** Build the candidate URL chain: direct first if proxy disabled, then all known proxies. */
function candidateUrls(url: string): string[] {
  const s = getSettings();
  const chain: string[] = [];
  if (!s.useCorsProxy) chain.push(url);
  const primary = s.corsProxy || FALLBACK_PROXIES[0];
  const ordered = [primary, ...FALLBACK_PROXIES.filter((p) => p !== primary)];
  for (const p of ordered) chain.push(p + encodeURIComponent(url));
  return chain;
}

export function getFinnhubKey() {
  return getSettings().finnhubKey;
}

export async function fetchJson<T>(url: string, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Try the original URL through every available proxy in sequence. */
export async function fetchJsonWithFallback<T>(rawUrl: string): Promise<T> {
  let lastErr: unknown;
  for (const candidate of candidateUrls(rawUrl)) {
    try {
      return await fetchJson<T>(candidate, 0);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
