/**
 * Offline LLM via llama.rn (llama.cpp). Replaces Tauri `ai_chat` / `ai_status`.
 */

import { initLlama, type LlamaContext } from "llama.rn";
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
}

let cached: { path: string; ctx: LlamaContext } | null = null;

async function ensureModel(path: string): Promise<LlamaContext> {
  if (cached?.path === path) return cached.ctx;
  if (cached) {
    try {
      await cached.ctx.release();
    } catch {
      /* ignore */
    }
    cached = null;
  }
  const ctx = await initLlama({
    model: path,
    n_ctx: 4096,
    n_gpu_layers: 99,
  });
  cached = { path, ctx };
  return ctx;
}

function buildChatml(
  system: string,
  messages: Array<{ role?: string; content?: string }>,
  tools: unknown[],
): string {
  const toolsJson = JSON.stringify(tools);
  let s = "<|im_start|>system\n";
  s += system;
  s += `\n\nYou can call tools. Tool schemas (JSON): ${toolsJson}`;
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
    async chat({ system, messages, tools }): Promise<ModelTurn> {
      if (!cfg.llmPath) throw new Error("llm-not-loaded");
      const ctx = await ensureModel(cfg.llmPath);
      const prompt = buildChatml(
        system,
        messages as Array<{ role?: string; content?: string }>,
        tools as unknown[],
      );
      const result = await ctx.completion({
        prompt,
        n_predict: 512,
        temperature: 0.3,
        stop: ["<|im_end|>"],
      });
      return parseTurn(result.text ?? "");
    },
  };
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
