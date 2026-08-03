/**
 * Offline STT/TTS via @siteed/sherpa-onnx.rn (ASR + TTS services).
 */

import { Platform } from "react-native";
import RNFS from "react-native-fs";
import type { AiConfig } from "@/lib/ai/config";

type AsrModelType =
  | "whisper"
  | "transducer"
  | "sense_voice"
  | "paraformer"
  | "nemo_ctc"
  | "zipformer2_ctc";

let asrReadyDir: string | null = null;
let ttsReadyDir: string | null = null;
let sherpaMod: typeof import("@siteed/sherpa-onnx.rn") | null = null;

async function loadSherpa() {
  if (sherpaMod) return sherpaMod;
  try {
    sherpaMod = await import("@siteed/sherpa-onnx.rn");
    if (Platform.OS === "web") {
      void sherpaMod.loadWasmModule?.({});
    }
    return sherpaMod;
  } catch {
    return null;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await RNFS.readDir(dir);
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

function pick(files: string[], needles: string[], ext: string): string | undefined {
  const lower = files.map((f) => f.toLowerCase());
  for (let i = 0; i < files.length; i++) {
    const name = lower[i]!;
    if (!name.endsWith(ext)) continue;
    if (needles.every((n) => name.includes(n))) return files[i];
  }
  return undefined;
}

async function detectAsrConfig(modelDir: string) {
  const files = await listFiles(modelDir);
  const tokens = pick(files, ["tokens"], ".txt") ?? "tokens.txt";
  const encoder = pick(files, ["encoder"], ".onnx");
  const decoder = pick(files, ["decoder"], ".onnx");
  const joiner = pick(files, ["joiner"], ".onnx");
  const sense = pick(files, ["sense"], ".onnx") ?? pick(files, ["model"], ".onnx");

  let modelType: AsrModelType = "whisper";
  const modelFiles: Record<string, string> = { tokens };
  if (encoder && decoder && joiner) {
    modelType = "transducer";
    modelFiles.encoder = encoder;
    modelFiles.decoder = decoder;
    modelFiles.joiner = joiner;
  } else if (encoder && decoder) {
    modelType = "whisper";
    modelFiles.encoder = encoder;
    modelFiles.decoder = decoder;
  } else if (sense) {
    modelType = "sense_voice";
    modelFiles.model = sense;
  } else {
    throw new Error("stt: no recognizable model files in folder");
  }

  return {
    modelDir,
    modelType,
    modelFiles,
    numThreads: 2,
    decodingMethod: "greedy_search" as const,
  };
}

async function detectTtsConfig(modelDir: string) {
  const files = await listFiles(modelDir);
  const modelFile =
    pick(files, ["model"], ".onnx") ?? pick(files, [], ".onnx") ?? "model.onnx";
  const tokensFile = pick(files, ["tokens"], ".txt") ?? "tokens.txt";
  return {
    modelDir,
    ttsModelType: "vits" as const,
    modelFile,
    tokensFile,
  };
}

export async function getSpeechReady(cfg: AiConfig): Promise<{ stt: boolean; tts: boolean }> {
  const mod = await loadSherpa();
  if (!mod) return { stt: false, tts: false };
  return {
    stt: !!(cfg.sttDir && cfg.sttDir.trim()),
    tts: !!(cfg.ttsDir && cfg.ttsDir.trim()),
  };
}

async function ensureAsr(modelDir: string) {
  const mod = await loadSherpa();
  if (!mod) throw new Error("stt-not-enabled");
  if (asrReadyDir === modelDir) return mod.ASR;
  const config = await detectAsrConfig(modelDir);
  const res = await mod.ASR.initialize(config);
  if (!res.success) throw new Error(res.error || "stt-init-failed");
  asrReadyDir = modelDir;
  return mod.ASR;
}

async function ensureTts(modelDir: string) {
  const mod = await loadSherpa();
  if (!mod) throw new Error("tts-not-enabled");
  if (ttsReadyDir === modelDir) return mod.TTS;
  const config = await detectTtsConfig(modelDir);
  const res = await mod.TTS.initialize(config);
  if (!res.success) throw new Error(res.error || "tts-init-failed");
  ttsReadyDir = modelDir;
  return mod.TTS;
}

/** Transcribe mono PCM f32 samples (typically 16 kHz). */
export async function transcribePcm(
  samples: Float32Array,
  sampleRate: number,
  modelDir: string,
): Promise<string> {
  const asr = await ensureAsr(modelDir);
  const res = await asr.recognizeFromSamples(sampleRate, Array.from(samples));
  if (!res.success) throw new Error(res.error || "stt-failed");
  return (res.text || "").trim();
}

/** Speak text; Sherpa can play audio natively when playAudio is true. */
export async function synthesizeSpeech(
  text: string,
  modelDir: string,
): Promise<{ sampleRate: number; played: boolean; filePath?: string }> {
  const tts = await ensureTts(modelDir);
  const res = await tts.generateSpeech(text, {
    speakerId: 0,
    speakingRate: 1,
    playAudio: true,
  });
  if (!res.success) throw new Error("tts-failed");
  return {
    sampleRate: tts.getSampleRate(),
    played: true,
    filePath: res.filePath,
  };
}

export async function stopSpeech(): Promise<void> {
  const mod = await loadSherpa();
  if (!mod) return;
  try {
    await mod.TTS.stopSpeech();
  } catch {
    /* ignore */
  }
}
