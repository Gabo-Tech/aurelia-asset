/**
 * Maps Tauri IPC command names to React Native native handlers.
 */

import { Buffer } from "buffer";
import {
  createNativeLlmEngine,
  getLlmReady,
  type AiCapabilities,
} from "@/platform/llm";
import {
  getSpeechReady,
  synthesizeSpeech,
  stopSpeech,
  transcribePcm,
} from "@/platform/speech";
import {
  downloadModel,
  type ModelKind,
  type ModelDownloadProgress,
} from "@/lib/ai/downloads";
import {
  saveExportFile,
  readImportFile,
  pickModelFile,
} from "@/lib/export";
import type { AiConfig } from "@/lib/ai/config";

export type BridgeEmit = (event: string, payload: unknown) => void;

type Args = Record<string, unknown>;

function cfgFromPayload(raw: unknown): AiConfig {
  const c = (raw ?? {}) as {
    llm_path?: string;
    stt_dir?: string;
    tts_dir?: string;
    llmPath?: string;
    sttDir?: string;
    ttsDir?: string;
  };
  return {
    llmPath: c.llm_path || c.llmPath || undefined,
    sttDir: c.stt_dir || c.sttDir || undefined,
    ttsDir: c.tts_dir || c.ttsDir || undefined,
  };
}

function decodePcmF32(b64: string): Float32Array {
  const bytes = Buffer.from(b64.trim(), "base64");
  const out = new Float32Array(Math.floor(bytes.byteLength / 4));
  for (let i = 0; i < out.length; i++) {
    out[i] = bytes.readFloatLE(i * 4);
  }
  return out;
}

async function handleAiStatus(args: Args): Promise<AiCapabilities> {
  const cfg = cfgFromPayload(args.config);
  const llm = await getLlmReady(cfg);
  const speech = await getSpeechReady(cfg);
  return {
    llm,
    stt: speech.stt,
    tts: speech.tts,
    llmEnabled: true,
    sttEnabled: true,
    ttsEnabled: true,
    model: cfg.llmPath ? cfg.llmPath.split(/[/\\]/).pop()?.replace(/\.gguf$/i, "") : undefined,
  };
}

async function handleAiChat(args: Args): Promise<{ toolCalls?: unknown; content?: string }> {
  const req = (args.req ?? args) as {
    system: string;
    messages: Array<{ role?: string; content?: string }>;
    tools: unknown[];
    model_path?: string;
  };
  const cfg: AiConfig = { llmPath: req.model_path };
  if (!cfg.llmPath) throw new Error("llm-not-loaded");
  const engine = createNativeLlmEngine(cfg);
  return engine.chat({
    system: req.system,
    messages: req.messages as never,
    tools: req.tools as never,
  });
}

async function handleStt(args: Args): Promise<string> {
  const req = (args.req ?? args) as {
    pcm_base64: string;
    sample_rate: number;
    model_dir?: string;
  };
  if (!req.model_dir) throw new Error("stt-no-model");
  const samples = decodePcmF32(req.pcm_base64);
  return transcribePcm(samples, req.sample_rate, req.model_dir);
}

async function handleTts(args: Args): Promise<{ sampleRate: number; samplesBase64: string }> {
  const req = (args.req ?? args) as { text: string; model_dir?: string };
  if (!req.model_dir) throw new Error("tts-no-model");
  // Plays natively; return empty PCM so the WebView's playPcm no-ops.
  await synthesizeSpeech(req.text, req.model_dir);
  return { sampleRate: 22050, samplesBase64: "" };
}

async function handleSaveExport(args: Args): Promise<string> {
  const req = (args.req ?? args) as {
    filename: string;
    contents?: string;
    bytes_base64?: string;
  };
  if (req.bytes_base64) {
    const bytes = new Uint8Array(Buffer.from(req.bytes_base64.trim(), "base64"));
    await saveExportFile(req.filename, { bytes });
  } else if (req.contents != null) {
    await saveExportFile(req.filename, { text: req.contents });
  } else {
    throw new Error("No export content provided");
  }
  return req.filename;
}

async function handleDownload(args: Args, emit: BridgeEmit): Promise<string> {
  const kind = String(args.kind ?? "") as ModelKind;
  if (kind !== "llm" && kind !== "stt" && kind !== "tts") {
    throw new Error(`unknown model kind: ${kind}`);
  }
  return downloadModel(kind, (progress: ModelDownloadProgress) => {
    emit("model-download-progress", progress);
  });
}

async function handlePickModel(args: Args): Promise<string | null> {
  const kind = String(args.kind ?? "file");
  // Folder picker is unavailable on mobile — return null (same as Tauri mobile).
  if (kind === "dir") return null;
  return pickModelFile();
}

/** Dispatch a single Tauri-style command. */
export async function dispatchCommand(
  cmd: string,
  args: Args,
  emit: BridgeEmit,
): Promise<unknown> {
  switch (cmd) {
    case "ai_status":
      return handleAiStatus(args);
    case "ai_chat":
      return handleAiChat(args);
    case "stt_transcribe":
      return handleStt(args);
    case "tts_speak":
      return handleTts(args);
    case "tts_stop":
      await stopSpeech();
      return null;
    case "save_export_file":
      return handleSaveExport(args);
    case "read_import_file":
      return readImportFile();
    case "download_model":
      return handleDownload(args, emit);
    case "is_native_desktop":
      // True so the web UI shows model download controls (RN can download on mobile).
      return true;
    case "pick_model_path":
      return handlePickModel(args);
    default:
      throw new Error(`Unknown native command: ${cmd}`);
  }
}
