/**
 * Offline LLM via llama.rn (llama.cpp). Replaces Tauri `ai_chat` / `ai_status`.
 */

import { initLlama, type LlamaContext } from "llama.rn";
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import type { AiConfig } from "@/lib/ai/config";
import type { LowLevelEngine, ModelTurn } from "@/lib/ai/types";
import { t } from "@/lib/i18n-t";

export interface AiCapabilities {
  llm: boolean;
  stt: boolean;
  tts: boolean;
  llmEnabled?: boolean;
  sttEnabled?: boolean;
  ttsEnabled?: boolean;
  model?: string;
  /** Why STT/TTS are unavailable (Sherpa missing, empty dirs, etc.). */
  speechReason?: string;
  sttDetail?: string;
  ttsDetail?: string;
  llmDetail?: string;
}

let cached: { path: string; ctx: LlamaContext } | null = null;
let warming: Promise<LlamaContext> | null = null;
let lastLlmStatus:
  | {
      gpu: boolean;
      reasonNoGpu?: string;
      devices?: string[];
      nGpuLayers: number;
      nCtx: number;
      nThreads: number;
    }
  | null = null;

function llmThreadCount(): number {
  const hw =
    typeof globalThis.navigator !== "undefined"
      ? globalThis.navigator.hardwareConcurrency
      : undefined;
  if (hw && hw > 2) return Math.max(2, hw - 1);
  return Platform.OS === "android" || Platform.OS === "ios" ? 4 : 4;
}

async function ensureModel(path: string): Promise<LlamaContext> {
  if (cached?.path === path) return cached.ctx;
  if (warming) {
    const ctx = await warming;
    if (cached?.path === path) return ctx;
  }
  if (cached) {
    try {
      await cached.ctx.release();
    } catch {
      /* ignore */
    }
    cached = null;
  }
  if (Platform.OS === "android" || Platform.OS === "ios") {
    const info = await RNFS.getFSInfo().catch(() => null);
    const free = Number(info?.freeSpace || 0);
    if (free > 0 && free < 1_500_000_000) {
      throw new Error("llm-insufficient-free-space");
    }
  }
  const nGpuLayers = Platform.OS === "ios" ? 99 : 0;
  const nCtx = Platform.OS === "android" || Platform.OS === "ios" ? 4096 : 2048;
  const nThreads = llmThreadCount();
  const load = initLlama({
    model: path,
    n_ctx: nCtx,
    n_threads: nThreads,
    n_gpu_layers: nGpuLayers,
  }).then((ctx) => {
    lastLlmStatus = {
      gpu: !!ctx.gpu,
      reasonNoGpu: ctx.reasonNoGPU || undefined,
      devices: Array.isArray(ctx.devices) ? ctx.devices : [],
      nGpuLayers,
      nCtx,
      nThreads,
    };
    cached = { path, ctx };
    warming = null;
    return ctx;
  });
  warming = load;
  return load;
}

/** Pre-load GGUF so the first chat turn is not a cold start. */
export async function warmLlm(cfg: AiConfig): Promise<void> {
  if (!cfg.llmPath?.trim()) return;
  await ensureModel(cfg.llmPath);
}

function buildChatml(
  system: string,
  messages: Array<{ role?: string; content?: string }>,
  tools: unknown[],
): string {
  const toolsLine = Array.isArray(tools)
    ? tools
        .map((tool) => {
          const t = tool as {
            name?: string;
            description?: string;
            parameters?: { properties?: Record<string, { type?: string }> };
          };
          const params = Object.entries(t.parameters?.properties || {})
            .map(([k, v]) => `${k}:${v.type || "any"}`)
            .join(", ");
          return `${t.name || "tool"}(${params}) - ${t.description || ""}`;
        })
        .join("\n")
    : "";
  let s = "<|im_start|>system\n";
  s += system;
  s += `\n\nYou can call tools. Tool list:\n${toolsLine}`;
  s +=
    '\nTo call a tool, reply with ONLY a JSON object like {"tool_call":{"name":"...","arguments":{...}}}. Otherwise reply normally in plain text.<|im_end|>\n';
  for (const m of messages) {
    const role = m.role === "assistant" ? "assistant" : m.role === "tool" ? "tool" : "user";
    s += `<|im_start|>${role}\n${m.content ?? ""}<|im_end|>\n`;
  }
  s += "<|im_start|>assistant\n";
  return s;
}

function parseTurn(raw: string): ModelTurn {
  const text = raw.replace(/<\|im_end\|>/g, "").trim();
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const json = JSON.parse(cleaned.slice(start, end + 1));
      const tc = json.tool_call ?? json;
      if (tc?.name) {
        return {
          toolCalls: [{ name: String(tc.name), arguments: tc.arguments ?? {} }],
          content: undefined,
        };
      }
    } catch {
      /* plain text */
    }
  }
  return { toolCalls: undefined, content: text };
}

export async function getLlmReady(cfg: AiConfig): Promise<boolean> {
  return !!(cfg.llmPath && cfg.llmPath.trim());
}

export function createNativeLlmEngine(cfg: AiConfig): LowLevelEngine {
  return {
    id: "native-llm",
    label: t("assistant.localLlmQwen"),
    async chat({ system, messages, tools, signal }): Promise<ModelTurn> {
      if (!cfg.llmPath) throw new Error("llm-not-loaded");
      const ctx = await ensureModel(cfg.llmPath);
      if (signal?.aborted) throw new Error("aborted");
      const prompt = buildChatml(
        system,
        messages as Array<{ role?: string; content?: string }>,
        tools as unknown[],
      );
      let abortHandler: (() => void) | null = null;
      if (signal) {
        abortHandler = () => {
          void ctx.stopCompletion().catch(() => undefined);
        };
        signal.addEventListener("abort", abortHandler, { once: true });
      }
      const result = await ctx.completion({
        prompt,
        n_predict: 512,
        temperature: 0.3,
        stop: ["<|im_end|>"],
      });
      if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
      if (signal?.aborted) throw new Error("aborted");
      return parseTurn(result.text ?? "");
    },
  };
}

export function getLastLlmStatus() {
  return lastLlmStatus;
}

export async function releaseLlm(): Promise<void> {
  if (cached) {
    try {
      await cached.ctx.release();
    } catch {
      /* ignore */
    }
    cached = null;
  }
}
