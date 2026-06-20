type Entry<T> = { value: T; expires: number };

const mem = new Map<string, Entry<unknown>>();

function lsKey(key: string) {
  return `ept_cache::${key}`;
}

export function getCache<T>(key: string): T | null {
  const now = Date.now();
  const m = mem.get(key) as Entry<T> | undefined;
  if (m && m.expires > now) return m.value;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lsKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (parsed.expires > now) {
      mem.set(key, parsed as Entry<unknown>);
      return parsed.value;
    }
    window.localStorage.removeItem(lsKey(key));
  } catch {}
  return null;
}

export function setCache<T>(key: string, value: T, ttlMs: number) {
  const entry: Entry<T> = { value, expires: Date.now() + ttlMs };
  mem.set(key, entry as Entry<unknown>);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(key), JSON.stringify(entry));
  } catch {}
}
