/**
 * Encrypted, on-device persistence for the AI chat history.
 *
 * Uses the same AES-GCM secure storage as the rest of the app so the
 * conversation never leaves the device and is encrypted at rest. Only the last
 * {@link MAX_PERSISTED} messages are kept to bound storage size.
 */

import { secureGet, createSecureWriteQueue } from "../secure-storage";
import type { ChatMessage } from "./types";

const CHAT_STORAGE_KEY = "ept_ai_chat_v1";
const MAX_PERSISTED = 100;
const chatWriteQueue = createSecureWriteQueue(CHAT_STORAGE_KEY);

/** Load the persisted chat history (oldest → newest). Returns [] if none. */
export async function loadChatHistory(): Promise<ChatMessage[]> {
  try {
    const raw = await secureGet(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Pending confirmations are transient UI state; drop them on reload so we
    // never re-render a stale confirm card.
    return parsed
      .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
      .map((m: ChatMessage) => ({ ...m, pendingChange: undefined }));
  } catch {
    return [];
  }
}

/** Persist the chat history (trimmed to the most recent messages). */
export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
  const trimmed = messages.slice(-MAX_PERSISTED);
  try {
    await chatWriteQueue.enqueue(JSON.stringify(trimmed));
  } catch {
    // Fail soft; history is a convenience, not critical data.
  }
}

/** Clear the persisted chat history. */
export async function clearChatHistory(): Promise<void> {
  try {
    await chatWriteQueue.enqueue(JSON.stringify([]));
    await chatWriteQueue.flush();
  } catch {
    // Ignore: clearing is best-effort.
  }
}

/** Drain pending chat writes (paired with app-state flush on background). */
export async function flushChatPersist(): Promise<void> {
  try {
    await chatWriteQueue.flush();
  } catch {
    /* best-effort */
  }
}
