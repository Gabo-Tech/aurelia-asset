/**
 * Web stub — Sherpa-ONNX native speech is unavailable in RN Web.
 */

import type { AiConfig } from "@/lib/ai/config";
import type { SpeechReady } from "./speech";

export type { SpeechReady };

export async function getSpeechReady(_cfg: AiConfig): Promise<SpeechReady> {
  return {
    stt: false,
    tts: false,
    reason: "On-device Sherpa STT/TTS is not available in the browser",
    sttDetail: "Use Web Speech or a native build",
    ttsDetail: "Use Web Speech or a native build",
  };
}

export async function transcribePcm(
  _samples: Float32Array,
  _sampleRate: number,
  _modelDir: string,
): Promise<string> {
  throw new Error("On-device STT is not available in the browser.");
}

export async function synthesizeSpeech(
  _text: string,
  _modelDir: string,
): Promise<{ sampleRate: number; played: boolean; filePath?: string }> {
  throw new Error("On-device TTS is not available in the browser.");
}

export async function stopSpeech(): Promise<void> {
  /* noop */
}
