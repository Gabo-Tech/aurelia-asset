/**
 * Local encrypted storage for sensitive app state.
 * Web: AES-GCM via SubtleCrypto when available.
 * Native (Hermes): always @noble/ciphers — never trust crypto.subtle stubs.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import { Buffer } from "buffer";
import { gcm } from "@noble/ciphers/aes.js";

const KEY_STORAGE = "ept-secure-key-v1";
const PREFIX = "enc:v1:";
/** Probe key for boot-time encrypt → write → read → decrypt check. */
const SELF_CHECK_KEY = "ept_secure_selfcheck_v1";
/** Known encrypted blobs — if these exist without a key, never mint a new key. */
const ENCRYPTED_DATA_KEYS = ["ept_state_v1", "ept_ai_chat_v1"];

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = /* @__PURE__ */ (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) t[B64_ALPHABET.charCodeAt(i)!] = i;
  return t;
})();

type SubtleCryptoKey = Awaited<ReturnType<SubtleCrypto["importKey"]>>;

let subtleKeyPromise: Promise<SubtleCryptoKey> | null = null;
let rawKeyPromise: Promise<Uint8Array> | null = null;
/** When true, allow creating a key even if ciphertext exists (import / reset recovery). */
let forceKeyCreate = false;

export class DecryptError extends Error {
  constructor(message = "Failed to decrypt stored data") {
    super(message);
    this.name = "DecryptError";
  }
}

/** Hermes `instanceof` on custom Error subclasses is unreliable — prefer name. */
function isDecryptError(e: unknown): e is DecryptError {
  return e instanceof DecryptError || (e instanceof Error && e.name === "DecryptError");
}

/** SubtleCrypto only on web; native always uses @noble/ciphers. */
function useSubtle(): boolean {
  if (Platform.OS !== "web") return false;
  return !!(globalThis.crypto as Crypto | undefined)?.subtle;
}

function getRandomBytes(n: number): Uint8Array {
  const c = globalThis.crypto as Crypto | undefined;
  if (!c?.getRandomValues) throw new Error("crypto.getRandomValues unavailable");
  return c.getRandomValues(new Uint8Array(n));
}

/** Own a contiguous Uint8Array (copy) for noble/subtle safety. */
function ownedBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

/** Hermes has no TextEncoder/TextDecoder — use Buffer UTF-8. */
function utf8Encode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "utf8"));
}

function utf8Decode(bytes: Uint8Array): string {
  return Buffer.from(ownedBytes(bytes)).toString("utf8");
}

/** Pure base64 encode — no Buffer / btoa (Hermes-safe, chunked). */
function bytesToB64(bytes: Uint8Array): string {
  const src = ownedBytes(bytes);
  let out = "";
  const len = src.length;
  for (let i = 0; i < len; i += 3) {
    const a = src[i]!;
    const b = i + 1 < len ? src[i + 1]! : 0;
    const c = i + 2 < len ? src[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64_ALPHABET[(triple >> 18) & 63];
    out += B64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < len ? B64_ALPHABET[(triple >> 6) & 63] : "=";
    out += i + 2 < len ? B64_ALPHABET[triple & 63] : "=";
  }
  return out;
}

/** Pure base64 decode — no Buffer / atob. */
function b64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/[\s=]+$/g, "").replace(/\s/g, "");
  const len = cleaned.length;
  const outLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_LOOKUP[cleaned.charCodeAt(i)] ?? -1;
    const c1 = B64_LOOKUP[cleaned.charCodeAt(i + 1)] ?? -1;
    const c2 = i + 2 < len ? (B64_LOOKUP[cleaned.charCodeAt(i + 2)] ?? -1) : 0;
    const c3 = i + 3 < len ? (B64_LOOKUP[cleaned.charCodeAt(i + 3)] ?? -1) : 0;
    if (c0 < 0 || c1 < 0 || (i + 2 < len && c2 < 0) || (i + 3 < len && c3 < 0)) {
      throw new Error("Invalid base64");
    }
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (o < outLen) out[o++] = (triple >> 16) & 255;
    if (o < outLen) out[o++] = (triple >> 8) & 255;
    if (o < outLen) out[o++] = triple & 255;
  }
  return out;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

async function hasEncryptedAppData(): Promise<boolean> {
  for (const k of ENCRYPTED_DATA_KEYS) {
    const raw = await AsyncStorage.getItem(k);
    if (isEncrypted(raw)) return true;
  }
  return false;
}

/**
 * Allow minting a new AES key even when ciphertext exists.
 * Use only for intentional recovery (import / reset).
 */
export function beginForceKeyCreate(): void {
  forceKeyCreate = true;
  subtleKeyPromise = null;
  rawKeyPromise = null;
}

export function endForceKeyCreate(): void {
  forceKeyCreate = false;
}

async function loadOrCreateRawKeyBytes(): Promise<Uint8Array> {
  const existing = await AsyncStorage.getItem(KEY_STORAGE);
  if (existing) {
    const key = b64ToBytes(existing);
    if (key.byteLength !== 32) {
      throw new DecryptError("Stored encryption key has invalid length");
    }
    return key;
  }
  if (!forceKeyCreate && (await hasEncryptedAppData())) {
    throw new DecryptError(
      "Encryption key missing but encrypted data exists. Import a backup or Reset in Settings.",
    );
  }
  const raw = getRandomBytes(32);
  await AsyncStorage.setItem(KEY_STORAGE, bytesToB64(raw));
  return ownedBytes(raw);
}

async function getRawKey(): Promise<Uint8Array> {
  if (!rawKeyPromise) {
    rawKeyPromise = loadOrCreateRawKeyBytes().catch((e) => {
      rawKeyPromise = null;
      throw e;
    });
  }
  return rawKeyPromise;
}

async function getSubtleKey(): Promise<SubtleCryptoKey> {
  if (!subtleKeyPromise) {
    subtleKeyPromise = (async () => {
      const crypto = globalThis.crypto as Crypto;
      const raw = await getRawKey();
      const copy = ownedBytes(raw);
      return crypto.subtle.importKey(
        "raw",
        copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
      );
    })().catch((e) => {
      subtleKeyPromise = null;
      throw e;
    });
  }
  return subtleKeyPromise;
}

export async function encryptString(plaintext: string): Promise<string> {
  const iv = getRandomBytes(12);
  const pt = utf8Encode(plaintext);
  let ct: Uint8Array;
  if (useSubtle()) {
    const key = await getSubtleKey();
    const subtle = (globalThis.crypto as Crypto).subtle;
    ct = new Uint8Array(
      await subtle.encrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        pt as BufferSource,
      ),
    );
  } else {
    const key = ownedBytes(await getRawKey());
    ct = gcm(key, ownedBytes(iv)).encrypt(pt);
  }
  const buf = new Uint8Array(iv.length + ct.length);
  buf.set(iv, 0);
  buf.set(ct, iv.length);
  return PREFIX + bytesToB64(buf);
}

export async function decryptString(payload: string): Promise<string> {
  if (!payload.startsWith(PREFIX)) return payload;
  try {
    const buf = b64ToBytes(payload.slice(PREFIX.length));
    if (buf.byteLength < 12 + 16) {
      throw new DecryptError("Failed to decrypt stored data (ciphertext too short)");
    }
    const iv = ownedBytes(buf.subarray(0, 12));
    const ct = ownedBytes(buf.subarray(12));
    let pt: Uint8Array;
    if (useSubtle()) {
      const key = await getSubtleKey();
      const subtle = (globalThis.crypto as Crypto).subtle;
      pt = new Uint8Array(
        await subtle.decrypt(
          { name: "AES-GCM", iv: iv as BufferSource },
          key,
          ct as BufferSource,
        ),
      );
    } else {
      const key = ownedBytes(await getRawKey());
      pt = gcm(key, iv).decrypt(ct);
    }
    return utf8Decode(pt);
  } catch (e) {
    if (isDecryptError(e)) throw e;
    const cause = e instanceof Error ? e.message : String(e);
    throw new DecryptError(`Failed to decrypt stored data (${cause})`);
  }
}

export async function secureGet(key: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return null;
  if (!isEncrypted(raw)) {
    try {
      const enc = await encryptString(raw);
      await AsyncStorage.setItem(key, enc);
    } catch {
      /* ignore migrate failure — still return plaintext so data remains accessible */
    }
    return raw;
  }
  try {
    return await decryptString(raw);
  } catch (e) {
    if (isDecryptError(e)) throw e;
    const cause = e instanceof Error ? e.message : String(e);
    throw new DecryptError(`Failed to decrypt key ${key}: ${cause}`);
  }
}

/** Encrypt + write with one retry. Throws on failure (never falls back to plaintext). */
export async function secureSet(key: string, value: string): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const enc = await encryptString(value);
      await AsyncStorage.setItem(key, enc);
      const stored = await AsyncStorage.getItem(key);
      if (stored !== enc) {
        throw new Error("AsyncStorage write verification failed");
      }
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn("[secure-storage] secureSet failed", key, lastErr);
  throw lastErr instanceof Error ? lastErr : new Error(`secureSet failed for ${key}`);
}

export async function secureRemove(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/**
 * Boot-time checks: in-memory crypto round-trip, then AsyncStorage round-trip.
 */
export async function verifySecureStorage(): Promise<void> {
  const probe = `ok:${Date.now()}`;
  try {
    const enc = await encryptString(probe);
    const mem = await decryptString(enc);
    if (mem !== probe) {
      throw new Error("Crypto round-trip mismatch (in-memory)");
    }

    await AsyncStorage.setItem(SELF_CHECK_KEY, enc);
    const stored = await AsyncStorage.getItem(SELF_CHECK_KEY);
    if (stored !== enc) {
      throw new Error("AsyncStorage write/read mismatch");
    }
    const roundTrip = await decryptString(stored);
    if (roundTrip !== probe) {
      throw new Error("Crypto round-trip mismatch (after AsyncStorage)");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Local encrypted storage failed: ${msg}`);
  } finally {
    try {
      await secureRemove(SELF_CHECK_KEY);
    } catch {
      /* ignore cleanup */
    }
  }
}

/**
 * Single-flight write queue for one storage key: always persists the latest value.
 * Concurrent callers coalesce onto encrypt/write of the newest payload.
 */
export function createSecureWriteQueue(key: string) {
  let latest: string | null = null;
  let chain: Promise<void> = Promise.resolve();
  let lastError: Error | null = null;

  const drain = async () => {
    while (latest != null) {
      const payload = latest;
      latest = null;
      try {
        await secureSet(key, payload);
        lastError = null;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (latest == null) latest = payload;
        throw lastError;
      }
    }
  };

  return {
    enqueue(value: string) {
      latest = value;
      chain = chain.then(drain, drain);
      return chain;
    },
    /** Always drain after prior work (success or failure) so retries are not skipped. */
    async flush(): Promise<void> {
      chain = chain.then(drain, drain);
      await chain;
    },
    get lastError() {
      return lastError;
    },
    get hasPending() {
      return latest != null;
    },
  };
}
