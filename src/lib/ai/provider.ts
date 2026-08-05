/**
 * Engine selection + tool-calling loop (ported from Tauri web client).
 * Native LLM via llama.rn; always falls back to local NLU.
 */

import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n-t";
import type { AssistantResult, EngineMessage, LowLevelEngine, ToolTrace } from "./types";
import { TOOL_SPECS, runReadTool, resolveWriteTool, type ToolDeps } from "./tools";
import { createLocalNluEngine } from "./nlu";
import { isAdviceRequest, withAdviceDisclaimer } from "./advice";
import { buildFinanceContext, formatContextForPrompt, type FinanceContext } from "./context";
import type { AiConfig } from "./config";
import {
  createNativeLlmEngine,
  getLlmReady,
  getLastLlmStatus,
  type AiCapabilities,
} from "@/platform/llm";
import { getSpeechReady } from "@/platform/speech";

export type { AiCapabilities };

let cachedCaps: { key: string; caps: AiCapabilities } | null = null;

function capsCacheKey(cfg: AiConfig): string {
  return `${cfg.llmPath ?? ""}|${cfg.sttDir ?? ""}|${cfg.ttsDir ?? ""}`;
}

export async function getAiCapabilities(cfg: AiConfig = {}): Promise<AiCapabilities> {
  const key = capsCacheKey(cfg);
  if (cachedCaps?.key === key) return cachedCaps.caps;

  const llm = await getLlmReady(cfg);
  const speech = await getSpeechReady(cfg);
  const caps: AiCapabilities = {
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
    llmDetail: getLastLlmStatus()
      ? `gpu=${String(getLastLlmStatus()?.gpu)} reason=${getLastLlmStatus()?.reasonNoGpu || "none"}`
      : undefined,
  };
  cachedCaps = { key, caps };
  return caps;
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
    "- Use read tools for facts; use write tools when user asks to add/edit/delete records.",
    "- Every write is confirm-first: propose changes clearly before anything is saved.",
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
  signal?: AbortSignal,
): Promise<AssistantResult> {
  const ctx = buildFinanceContext(deps.state, deps.toDisplay, deps.currency, deps.locale);
  const system = buildSystemPrompt(ctx);

  const engines: LowLevelEngine[] = [];
  const caps = await getAiCapabilities(aiConfig);
  if (caps.llm) engines.push(createNativeLlmEngine(aiConfig));
  engines.push(createLocalNluEngine(ctx));

  let lastError: string | undefined;
  for (const engine of engines) {
    try {
      const result = await runLoop(engine, system, userText, deps, history, ctx, signal);
      if (engine.id === "local-nlu" && lastError) result.degradedReason = lastError;
      return result;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      /* next engine */
    }
  }
  return {
    reply: t("assistant.backend.processError"),
    toolTrace: [],
    engineId: "local-nlu",
    error: true,
    degradedReason: lastError,
  };
}

async function runLoop(
  engine: LowLevelEngine,
  system: string,
  userText: string,
  deps: ToolDeps,
  history: EngineMessage[],
  _ctx: FinanceContext,
  signal?: AbortSignal,
): Promise<AssistantResult> {
  const messages: EngineMessage[] = [...history, { role: "user", content: userText }];
  const trace: ToolTrace[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const tools = pickToolsForTurn(userText);
    const turn = await engine.chat({ system, messages, tools, signal });

    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const call of turn.toolCalls) {
        const spec = TOOL_SPECS.find((s) => s.name === call.name);
        if (spec?.kind === "write") {
          const { change, error } = resolveWriteTool(call, deps);
          if (error || !change) {
            return {
              reply: t("assistant.backend.expenseParseError"),
              toolTrace: trace,
              engineId: engine.id,
              error: true,
            };
          }
          return {
            reply: change.summary,
            proposedChange: change,
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

function pickToolsForTurn(userText: string) {
  const q = userText.toLowerCase();
  const always = ["add_transaction", "get_spending_summary", "get_recent_transactions"];
  const budget = /\bbudget|plan|spend/.test(q)
    ? ["get_budget_status", "create_budget", "update_budget_item"]
    : [];
  const wealth = /\bnet worth|portfolio|holding|asset|invest|loan|goal|debt/.test(q)
    ? ["get_net_worth", "get_portfolio", "get_goals_status", "get_loans_status"]
    : [];
  const edit = /\bedit|update|fix|change|delete|remove|correct/.test(q)
    ? ["update_transaction", "delete_transaction", "find_transactions"]
    : [];
  const set = new Set([...always, ...budget, ...wealth, ...edit]);
  return TOOL_SPECS.filter((s) => set.has(s.name));
}

export type { ToolDeps };
export type { FinanceContext } from "./context";
