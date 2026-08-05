/**
 * Web stub — llama.rn is unavailable in the browser (Linux RN Web uses NLU only).
 */

import type { AiConfig } from "@/lib/ai/config";
import type { LowLevelEngine } from "@/lib/ai/types";

export type AiCapabilities = {
  llm: boolean;
  stt: boolean;
  tts: boolean;
  llmEnabled?: boolean;
  sttEnabled?: boolean;
  ttsEnabled?: boolean;
  model?: string;
  speechReason?: string;
  sttDetail?: string;
  ttsDetail?: string;
};

export async function getLlmReady(_cfg: AiConfig): Promise<boolean> {
  return false;
}

export function createNativeLlmEngine(_cfg: AiConfig): LowLevelEngine {
  return {
    id: "native-llm",
    label: "Local LLM (unavailable on web)",
    async chat() {
      throw new Error("Local LLM is not available in the browser. Use a native build.");
    },
  };
}

export async function releaseLlm(): Promise<void> {
  /* noop */
}
