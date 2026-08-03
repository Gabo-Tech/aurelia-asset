import { Platform } from "react-native";
import { DEFAULT_STATE, type Settings } from "../types";

const DISCLOSED_PROXIES = ["https://corsproxy.io/?", "https://api.allorigins.win/raw?url="];

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

function buildAttempts(rawUrl: string, preferDirect: boolean): string[] {
  const s = getSettings();
  const out: string[] = [];
  // Native apps have no browser CORS; prefer direct. Web RN still may need proxies.
  if (preferDirect || !s.useCorsProxy || Platform.OS !== "web") out.push(rawUrl);
  if (!preferDirect && s.useCorsProxy && Platform.OS === "web") out.push(rawUrl);
  if (!s.useCorsProxy) return Array.from(new Set(out));

  if (Platform.OS === "web") {
    const primary = s.corsProxy || DISCLOSED_PROXIES[0];
    const ordered = [primary, ...DISCLOSED_PROXIES.filter((p) => p !== primary)];
    for (const p of ordered) {
      if (!isDown(p)) out.push(p + encodeURIComponent(rawUrl));
    }
    if (out.length <= 1) {
      for (const p of ordered) out.push(p + encodeURIComponent(rawUrl));
    }
  }
  return Array.from(new Set(out));
}

export function getFinnhubKey() {
  return getSettings().finnhubKey;
}

export type FetchOpts = {
  preferDirect?: boolean;
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
      if (i < retries) await new Promise<void>((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchWithFallback<T>(rawUrl: string, opts: FetchOpts = {}): Promise<T> {
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
      for (const p of DISCLOSED_PROXIES) {
        if (candidate.startsWith(p)) markDown(p);
      }
    }
  }
  throw lastErr;
}

export async function fetchJsonWithFallback<T>(rawUrl: string): Promise<T> {
  return fetchWithFallback<T>(rawUrl);
}
