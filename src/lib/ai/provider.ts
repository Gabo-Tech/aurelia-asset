/**
 * Engine selection + tool-calling loop (ported from Tauri web client).
 * Native LLM via llama.rn; always falls back to local NLU.
 */

import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n-t";
import type { AssistantResult, EngineMessage, LowLevelEngine, ToolTrace } from "./types";
import { TOOL_SPECS, runReadTool, resolveExpenseProposal, type ToolDeps } from "./tools";
import { createLocalNluEngine } from "./nlu";
import { isAdviceRequest, withAdviceDisclaimer } from "./advice";
import { buildFinanceContext, formatContextForPrompt, type FinanceContext } from "./context";
import type { AiConfig } from "./config";
import { createNativeLlmEngine, getLlmReady, type AiCapabilities } from "@/platform/llm";
import { getSpeechReady } from "@/platform/speech";

export type { AiCapabilities };

export async function getAiCapabilities(cfg: AiConfig = {}): Promise<AiCapabilities> {
  const llm = await getLlmReady(cfg);
  const speech = await getSpeechReady(cfg);
  return {
    llm,
    stt: speech.stt,
    tts: speech.tts,
    llmEnabled: true,
    sttEnabled: true,
    ttsEnabled: true,
    model: cfg.llmPath?.split(/[/\\]/).pop(),
  };
}

const MAX_STEPS = 4;

function buildSystemPrompt(ctx: FinanceContext): string {
  return [
    "You are a private, on-device personal finance assistant inside a finance app.",
    "You help the user log expenses, understand their spending, save money, and give educational financial guidance.",
    "Use the provided tools. Call add_transaction whenever the user describes an expense.",
    "When adding an expense, always let the user confirm before it is saved.",
    "When the user asks for financial advice, saving tips, investment guidance, or what to do with their money:",
    "- Analyse their income, expenses, liquidity, holdings, debt, budget, and goals from the context below.",
    "- Give 3–5 specific, actionable suggestions grounded in their real numbers.",
    "- Do not recommend specific securities. Suggest general shifts (save more, invest a portion, trim a category, pay debt).",
    "- This is educational guidance, not professional financial advice.",
    "Base every answer on the user's real data below. Be concise and friendly.",
    `Reply in the user's language (locale: ${ctx.locale}).`,
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
      /* next engine */
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
  _ctx: FinanceContext,
): Promise<AssistantResult> {
  const messages: EngineMessage[] = [...history, { role: "user", content: userText }];
  const trace: ToolTrace[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const turn = await engine.chat({ system, messages, tools: TOOL_SPECS });

    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const call of turn.toolCalls) {
        const spec = TOOL_SPECS.find((s) => s.name === call.name);
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
          return {
            reply: t("assistant.backend.updateHint"),
            toolTrace: trace,
            engineId: engine.id,
          };
        }

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
      continue;
    }

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
