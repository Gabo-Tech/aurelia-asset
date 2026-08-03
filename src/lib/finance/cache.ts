import AsyncStorage from "@react-native-async-storage/async-storage";

type Entry<T> = { value: T; expires: number };

const mem = new Map<string, Entry<unknown>>();
const PREFIX = "ept_cache::";

function lsKey(key: string) {
  return PREFIX + key;
}

export function getCache<T>(key: string): T | null {
  const now = Date.now();
  const m = mem.get(key) as Entry<T> | undefined;
  if (m && m.expires > now) return m.value;
  return null;
}

export function getCacheStale<T>(key: string): T | null {
  const m = mem.get(key) as Entry<T> | undefined;
  return m ? m.value : null;
}

export function setCache<T>(key: string, value: T, ttlMs: number) {
  const entry: Entry<T> = { value, expires: Date.now() + ttlMs };
  mem.set(key, entry as Entry<unknown>);
  void AsyncStorage.setItem(lsKey(key), JSON.stringify(entry)).catch(() => {});
}

export function bustCache(prefix: string) {
  for (const k of Array.from(mem.keys())) {
    if (k.startsWith(prefix)) mem.delete(k);
  }
  void AsyncStorage.getAllKeys()
    .then((keys) => {
      const ours = keys.filter((k) => k.startsWith(PREFIX + prefix) || k.startsWith(PREFIX));
      const toRemove = keys.filter((k) => k.startsWith(PREFIX) && k.slice(PREFIX.length).startsWith(prefix));
      return AsyncStorage.multiRemove(toRemove.length ? toRemove : ours.filter((k) => k.includes(prefix)));
    })
    .catch(() => {});
}

/** Warm in-memory cache from AsyncStorage (call once at app start). */
export async function hydrateQuoteCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (!ours.length) return;
    const pairs = await AsyncStorage.multiGet(ours);
    const now = Date.now();
    for (const [k, raw] of pairs) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Entry<unknown>;
        const key = k.slice(PREFIX.length);
        mem.set(key, parsed);
        if (parsed.expires <= now) {
          void AsyncStorage.removeItem(k);
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* ignore */
  }
}
