/**
 * Local encrypted storage for sensitive app state.
 * Uses AsyncStorage + AES-GCM via the runtime Web Crypto API.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";

const KEY_STORAGE = "ept-secure-key-v1";
const PREFIX = "enc:v1:";

type SubtleCryptoKey = Awaited<ReturnType<SubtleCrypto["importKey"]>>;

let keyPromise: Promise<SubtleCryptoKey> | null = null;

function getCrypto(): Crypto {
  const c = globalThis.crypto as Crypto | undefined;
  if (!c?.subtle) throw new Error("Web Crypto unavailable");
  return c;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return globalThis.btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = globalThis.atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function importOrCreateKey(): Promise<SubtleCryptoKey> {
  const crypto = getCrypto();
  const existing = await AsyncStorage.getItem(KEY_STORAGE);
  if (existing) {
    const raw = b64ToBytes(existing);
    return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const exported = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  await AsyncStorage.setItem(KEY_STORAGE, bytesToB64(exported));
  return crypto.subtle.importKey("raw", exported.buffer as ArrayBuffer, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function getKey(): Promise<SubtleCryptoKey> {
  if (!keyPromise) keyPromise = importOrCreateKey();
  return keyPromise;
}

export async function encryptString(plaintext: string): Promise<string> {
  const crypto = getCrypto();
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const buf = new Uint8Array(iv.length + ct.length);
  buf.set(iv, 0);
  buf.set(ct, iv.length);
  return PREFIX + bytesToB64(buf);
}

export async function decryptString(payload: string): Promise<string> {
  if (!payload.startsWith(PREFIX)) return payload;
  const crypto = getCrypto();
  const key = await getKey();
  const buf = b64ToBytes(payload.slice(PREFIX.length));
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

export async function secureGet(key: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return null;
  if (!isEncrypted(raw)) {
    try {
      const enc = await encryptString(raw);
      await AsyncStorage.setItem(key, enc);
    } catch {
      /* ignore migrate failure */
    }
    return raw;
  }
  try {
    return await decryptString(raw);
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  try {
    const enc = await encryptString(value);
    await AsyncStorage.setItem(key, enc);
  } catch {
    /* Fail soft for sensitive data — do not fall back to plaintext. */
  }
}

export async function secureRemove(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
