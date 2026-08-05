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
    speechReason: speech.reason,
    sttDetail: speech.sttDetail,
    ttsDetail: speech.ttsDetail,
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
