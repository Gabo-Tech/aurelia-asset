import { DEFAULT_STATE } from "../types";

const STORAGE_KEY = "ept_state_v1";

function getSettings() {
  if (typeof window === "undefined") return DEFAULT_STATE.settings;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE.settings;
    return { ...DEFAULT_STATE.settings, ...(JSON.parse(raw).settings ?? {}) };
  } catch {
    return DEFAULT_STATE.settings;
  }
}

export function proxied(url: string) {
  const s = getSettings();
  if (!s.useCorsProxy) return url;
  const proxy = s.corsProxy || "https://corsproxy.io/?";
  return proxy + encodeURIComponent(url);
}

export function getFinnhubKey() {
  return getSettings().finnhubKey;
}

export async function fetchJson<T>(url: string, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}
