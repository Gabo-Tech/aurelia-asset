/**
 * Engine selection and the tool-calling orchestration loop.
 *
 * `runAssistant` drives one user turn to completion:
 *   1. Injects the finance context + tool specs into a system prompt.
 *   2. Asks the engine for a turn.
 *   3. Executes any READ tool calls and feeds results back (looping).
 *   4. On a WRITE tool call (add/update), stops and returns a ProposedExpense
 *      for the UI to confirm (confirm-first policy).
 *   5. Otherwise returns the final natural-language reply.
 *
 * The native LLM (Tauri) is preferred when available; the local NLU engine is
 * always the fallback so the assistant works offline on every platform.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/export";
import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n-t";
import type { AssistantResult, EngineMessage, LowLevelEngine, ModelTurn, ToolTrace } from "./types";
import { TOOL_SPECS, runReadTool, resolveExpenseProposal, type ToolDeps } from "./tools";
import { createLocalNluEngine } from "./nlu";
import { isAdviceRequest, withAdviceDisclaimer } from "./advice";
import { buildFinanceContext, formatContextForPrompt, type FinanceContext } from "./context";
import { toConfigPayload, type AiConfig } from "./config";

export interface AiCapabilities {
  llm: boolean;
  stt: boolean;
  tts: boolean;
  llmEnabled?: boolean;
  sttEnabled?: boolean;
  ttsEnabled?: boolean;
  model?: string;
}

/** Query which on-device AI features are available, given the user's configured
 *  model paths. */
export async function getAiCapabilities(cfg: AiConfig = {}): Promise<AiCapabilities> {
  if (!isTauri()) return { llm: false, stt: false, tts: false };
  try {
    return await invoke<AiCapabilities>("ai_status", {
      config: toConfigPayload(cfg),
    });
  } catch {
    return { llm: false, stt: false, tts: false };
  }
}

/** Native LLM engine backed by llama.cpp via a Tauri command. */
function createNativeLlmEngine(cfg: AiConfig): LowLevelEngine {
  return {
    id: "native-llm",
    label: t("assistant.localLlmQwen"),
    async chat({ system, messages, tools }): Promise<ModelTurn> {
      // The Rust side runs the model and returns a structured turn. Throws if
      // the model is not loaded, which makes the orchestrator fall back.
      return await invoke<ModelTurn>("ai_chat", {
        req: { system, messages, tools, model_path: cfg.llmPath },
      });
    },
  };
}

const MAX_STEPS = 4;

function buildSystemPrompt(ctx: FinanceContext): string {
  return [
    "You are the user's private, on-device personal financial advisor inside a finance app.",
    "Your job is to analyse their real data and give honest, practical coaching — not generic platitudes.",
    "",
    "Role & tone:",
    "- Speak like a trusted advisor who knows their numbers: direct, encouraging, specific.",
    "- Always ground suggestions in the USER FINANCE CONTEXT (and tool results) below.",
    "- Prefer concrete actions with amounts/% when possible (e.g. \"cut Food by ~€50/mo\", \"aim for 20% savings rate\").",
    "",
    "When advising (tips, what to do with money, how to improve finances, career/income, investing):",
    "- Diagnose cashflow: overspending categories, savings rate, income vs expenses.",
    "- If expenses eat most of income, suggest cutting specific categories AND growing income",
    "  (raise, better job, side income, skill investment) — framed as options, not orders.",
    "- If they have high-interest debt, prioritise paying it down before new investing.",
    "- If cash/liquidity is large vs an emergency buffer (~3–6 months expenses), suggest investing the excess",
    "  broadly (index funds / diversified long-term investing) — never pick specific tickers or stocks.",
    "- Use holdings, goals, budgets, and loans from context to tailor advice.",
    "- Give 3–5 actionable bullets. Educational guidance only — not professional financial advice.",
    "",
    "Tools & logging:",
    "- Use tools to look up net worth, portfolio, spending, budget, goals, and loans when asked.",
    "- Call add_transaction when the user describes an expense; always confirm before saving.",
    "",
    "Base every answer on their real data. Be concise. Reply in the user's language (locale: " +
      ctx.locale +
      ").",
    "",
    "=== USER FINANCE CONTEXT ===",
    formatContextForPrompt(ctx),
  ].join("\n");
}

function finalizeAdviceReply(reply: string, userText: string, deps: ToolDeps): string {
  if (!isAdviceRequest(userText)) return reply;
  if (deps.adviceDisclaimerSeen) return reply;
  deps.markAdviceDisclaimerSeen?.();
  return withAdviceDisclaimer(reply);
}

function confirmationText(
  amount: number,
  currency: string,
  category: string,
  dateIso: string,
  locale: string,
): string {
  const d = new Date(dateIso);
  const when = isSameDay(d, new Date())
    ? t("assistant.backend.expenseConfirmToday")
    : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  return t("assistant.backend.expenseConfirm", {
    amount: formatMoney(amount, currency),
    category,
    when,
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Run one assistant turn. `history` is the prior EngineMessage transcript
 * (excluding the new user message, which is appended here).
 */
export async function runAssistant(
  userText: string,
  deps: ToolDeps,
  history: EngineMessage[],
  aiConfig: AiConfig = {},
): Promise<AssistantResult> {
  const ctx = buildFinanceContext(deps.state, deps.toDisplay, deps.currency, deps.locale);
  const system = buildSystemPrompt(ctx);

  const engines: LowLevelEngine[] = [];
  const caps = await getAiCapabilities(aiConfig);
  if (caps.llm) engines.push(createNativeLlmEngine(aiConfig));
  engines.push(createLocalNluEngine(ctx));

  for (const engine of engines) {
    try {
      return await runLoop(engine, system, userText, deps, history, ctx);
    } catch {
      // Fall through to the next engine (e.g. native → local NLU).
    }
  }
  return {
    reply: t("assistant.backend.processError"),
    toolTrace: [],
    engineId: "local-nlu",
    error: true,
  };
}

async function runLoop(
  engine: LowLevelEngine,
  system: string,
  userText: string,
  deps: ToolDeps,
  history: EngineMessage[],
  ctx: FinanceContext,
): Promise<AssistantResult> {
  const messages: EngineMessage[] = [...history, { role: "user", content: userText }];
  const trace: ToolTrace[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const turn = await engine.chat({ system, messages, tools: TOOL_SPECS });

    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const call of turn.toolCalls) {
        const spec = TOOL_SPECS.find((s) => s.name === call.name);

        // WRITE tools are gated behind user confirmation.
        if (spec?.kind === "write") {
          if (call.name === "add_transaction") {
            const { proposal, error } = resolveExpenseProposal(call.arguments, deps);
            if (error || !proposal) {
              return {
                reply: t("assistant.backend.expenseParseError"),
                toolTrace: trace,
                engineId: engine.id,
                error: true,
              };
            }
            return {
              reply: confirmationText(
                proposal.amount,
                proposal.currency,
                proposal.categoryName,
                proposal.date,
                deps.locale,
              ),
              proposedExpense: proposal,
              toolTrace: trace,
              engineId: engine.id,
            };
          }
          // update_transaction: surface a gentle message; correction UI is a
          // future enhancement, so we point the user to a fresh add for now.
          return {
            reply: t("assistant.backend.updateHint"),
            toolTrace: trace,
            engineId: engine.id,
          };
        }

        // READ tool: execute and feed the result back to the engine.
        const result = runReadTool(call, deps);
        trace.push({
          name: call.name,
          arguments: call.arguments,
          summary: result.summary,
        });
        messages.push({
          role: "tool",
          toolName: call.name,
          content: result.summary,
        });
      }
      continue; // let the engine react to the tool results
    }

    // Final natural-language answer.
    return {
      reply: finalizeAdviceReply(
        turn.content?.trim() || t("assistant.backend.done"),
        userText,
        deps,
      ),
      toolTrace: trace,
      engineId: engine.id,
    };
  }

  return {
    reply: t("assistant.backend.maxStepsReply"),
    toolTrace: trace,
    engineId: engine.id,
  };
}

export type { ToolDeps };
export type { FinanceContext } from "./context";
