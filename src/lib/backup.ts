/**
 * Backup JSON parse — accepts web envelope `{ version, state, userPreferences }`
 * or legacy bare `AppState`. Used by Settings import (file + paste).
 */

import type { AppState } from "@/lib/types";
import { normalizeAppState } from "@/lib/store";

export type BackupEnvelopeV1 = {
  version: 1;
  exportedAt: string;
  state: AppState;
  userPreferences?: { language?: string };
  secretsNote?: string;
  preferences?: Record<string, string>;
};

export type ParsedBackup = {
  state: AppState;
  language?: string;
  preferences?: Record<string, string>;
};

function looksLikeAppState(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.holdings) && Array.isArray(o.cashflows) && o.settings != null;
}

function redact(state: AppState): AppState {
  if (!state.settings?.finnhubKey) return state;
  return {
    ...state,
    settings: { ...state.settings, finnhubKey: undefined },
  };
}

/** Parse export text from web or native. Throws on invalid JSON/shape. */
export function parseBackupJson(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
  if (!raw || typeof raw !== "object") throw new Error("Invalid backup format");

  const obj = raw as Record<string, unknown>;
  if (looksLikeAppState(obj.state)) {
    const userPrefs = obj.userPreferences as { language?: string } | undefined;
    const prefs = obj.preferences as Record<string, string> | undefined;
    return {
      state: normalizeAppState(obj.state),
      language: userPrefs?.language,
      preferences: prefs,
    };
  }
  if (looksLikeAppState(obj)) {
    return { state: normalizeAppState(obj) };
  }
  throw new Error("Unrecognized backup: expected AppState or { state: AppState }");
}

/** Build web-compatible envelope for cross-app round-trip. */
export function buildBackupEnvelope(
  state: AppState,
  opts?: { language?: string },
): BackupEnvelopeV1 {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    state: redact(state),
    userPreferences: opts?.language ? { language: opts.language } : undefined,
    secretsNote:
      "API keys are not included in exports. Re-enter them in Settings after restore.",
  };
}

export function stringifyBackup(envelope: BackupEnvelopeV1): string {
  return JSON.stringify(envelope, null, 2);
}
