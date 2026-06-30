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

/** Return cached value even if expired (stale-while-revalidate). */
export function getCacheStale<T>(key: string): T | null {
  const m = mem.get(key) as Entry<T> | undefined;
  if (m) return m.value;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lsKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    mem.set(key, parsed as Entry<unknown>);
    return parsed.value;
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

/** Drop all cache entries whose key starts with `prefix`. */
export function bustCache(prefix: string) {
  for (const k of Array.from(mem.keys())) {
    if (k.startsWith(prefix)) mem.delete(k);
  }
  if (typeof window === "undefined") return;
  try {
    const full = `ept_cache::${prefix}`;
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(full)) toRemove.push(k);
    }
    for (const k of toRemove) window.localStorage.removeItem(k);
  } catch {}
}
