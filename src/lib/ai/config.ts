/**
 * Bridges the app's Settings to the AI backend.
 *
 * Model locations are configured by the user in Settings and passed to the
 * Tauri commands on every call. The Rust side loads and caches each model,
 * reloading only when a path changes.
 */

import type { Settings } from "@/lib/types";

/** Model locations sent to the native backend. Empty on web builds. */
export interface AiConfig {
  llmPath?: string;
  sttDir?: string;
  ttsDir?: string;
}

/** Snake-case payload matching the Rust `AiConfig` request struct. */
export interface AiConfigPayload {
  llm_path?: string;
  stt_dir?: string;
  tts_dir?: string;
}

export function aiConfigFromSettings(s: Settings): AiConfig {
  return {
    llmPath: s.aiLlmModelPath?.trim() || undefined,
    sttDir: s.aiSttModelDir?.trim() || undefined,
    ttsDir: s.aiTtsModelDir?.trim() || undefined,
  };
}

export function toConfigPayload(cfg: AiConfig): AiConfigPayload {
  return {
    llm_path: cfg.llmPath,
    stt_dir: cfg.sttDir,
    tts_dir: cfg.ttsDir,
  };
}
