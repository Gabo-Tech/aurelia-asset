/**
 * Device-bound encryption for sensitive values kept in localStorage.
 *
 * - AES-GCM 256-bit key is generated once, stored in IndexedDB as a
 *   non-extractable CryptoKey. It never leaves the browser and cannot be
 *   read back as raw bytes.
 * - Encrypted values are stored as `enc:v1:<base64(iv || ciphertext)>`.
 * - Pre-existing plaintext values are transparently migrated on first
 *   read by re-writing them encrypted.
 *
 * Note: this protects against casual inspection of localStorage (devtools,
 * extensions that just read storage, accidental sharing of a backup file).
 * Anyone able to execute JavaScript inside this origin can still decrypt.
 */

const DB_NAME = "ept-secure";
const STORE_NAME = "keys";
const KEY_ID = "main";
const PREFIX = "enc:v1:";

let keyPromise: Promise<CryptoKey> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadOrCreateKey(): Promise<CryptoKey> {
  const db = await openDb();
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY_ID);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
  if (existing) {
    db.close();
    return existing;
  }
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(key, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return key;
}

export function getEncryptionKey(): Promise<CryptoKey> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (!keyPromise) keyPromise = loadOrCreateKey();
  return keyPromise;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function encryptString(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const buf = new Uint8Array(iv.length + ct.length);
  buf.set(iv, 0);
  buf.set(ct, iv.length);
  return PREFIX + bytesToB64(buf);
}

export async function decryptString(payload: string): Promise<string> {
  if (!payload.startsWith(PREFIX)) return payload; // legacy plaintext
  const key = await getEncryptionKey();
  const buf = b64ToBytes(payload.slice(PREFIX.length));
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

/** Read and decrypt a localStorage value, migrating plaintext on the fly. */
export async function secureGet(key: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return null;
  if (!isEncrypted(raw)) {
    // Migrate legacy plaintext: re-write encrypted, return original value.
    try {
      const enc = await encryptString(raw);
      window.localStorage.setItem(key, enc);
    } catch {}
    return raw;
  }
  try {
    return await decryptString(raw);
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const enc = await encryptString(value);
    window.localStorage.setItem(key, enc);
  } catch {
    // Fail soft: do NOT fall back to plaintext for sensitive data.
  }
}
