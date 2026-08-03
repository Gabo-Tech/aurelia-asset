/**
 * Web stub — Sherpa-ONNX native speech is unavailable in RN Web.
 */

import type { AiConfig } from "@/lib/ai/config";

export async function getSpeechReady(
  _cfg: AiConfig,
): Promise<{ stt: boolean; tts: boolean }> {
  return { stt: false, tts: false };
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
