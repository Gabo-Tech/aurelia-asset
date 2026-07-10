/**
 * Deterministic, on-device natural-language engine.
 *
 * This is a zero-dependency intent parser that implements the same
 * {@link LowLevelEngine} tool-calling contract as the native LLM. It requires no
 * model download, runs entirely in the browser, and powers:
 *   - the web build (platform scope B: web = text, native = voice + LLM), and
 *   - the fallback on any platform when the native model is not yet loaded.
 *
 * It handles the core finance intents: logging an expense, spending summaries,
 * recent transactions, budget status and saving tips.
 */

import { subDays } from "date-fns";
import { t } from "@/lib/i18n-t";
import { buildFinancialAdvice, isAdviceRequest } from "./advice";
import type { EngineMessage, LowLevelEngine, ModelTurn, ToolCall } from "./types";
import type { FinanceContext } from "./context";

const SPEND_VERBS =
  /\b(spent|spend|bought|buy|buying|paid|pay|paying|purchased?|grabbed|got|cost|charged)\b/i;
const QUESTION_HINT =
  /\b(how much|how many|summary|total|what did|what have|show|list|report|balance|left|remaining|advice|tips?|save|saving|budget|recent|last)\b/i;

const CURRENCY_WORDS: Record<string, string> = {
  dollar: "USD",
  dollars: "USD",
  buck: "USD",
  bucks: "USD",
  usd: "USD",
  euro: "EUR",
  euros: "EUR",
  eur: "EUR",
  pound: "GBP",
  pounds: "GBP",
  gbp: "GBP",
  yen: "JPY",
  jpy: "JPY",
  rupee: "INR",
  rupees: "INR",
  inr: "INR",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
};

/** Extract an amount and (optional) currency from free text. */
export function parseMoney(
  text: string,
  fallbackCurrency: string,
): { amount: number; currency: string } | null {
  // Match an optional currency symbol, a number (with thousands/decimal), and an
  // optional trailing currency word.
  const re =
    /([$€£¥₹])?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(dollars?|bucks?|usd|euros?|eur|pounds?|gbp|yen|jpy|rupees?|inr)?/i;
  const m = text.match(re);
  if (!m) return null;
  const raw = m[2].replace(/,(?=\d{3}\b)/g, ""); // strip thousands separators
  const amount = parseFloat(raw.replace(",", "."));
  if (!isFinite(amount) || amount <= 0) return null;
  let currency = fallbackCurrency;
  if (m[1] && CURRENCY_SYMBOLS[m[1]]) currency = CURRENCY_SYMBOLS[m[1]];
  else if (m[3] && CURRENCY_WORDS[m[3].toLowerCase()])
    currency = CURRENCY_WORDS[m[3].toLowerCase()];
  return { amount, currency };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Resolve a natural date phrase to an ISO date (YYYY-MM-DD). Defaults today. */
export function parseDate(text: string, now = new Date()): string {
  const t = text.toLowerCase();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (/\byesterday\b/.test(t)) return iso(subDays(now, 1));
  if (/\bday before yesterday\b/.test(t)) return iso(subDays(now, 2));
  const nDaysAgo = t.match(/\b(\d{1,2})\s+days?\s+ago\b/);
  if (nDaysAgo) return iso(subDays(now, parseInt(nDaysAgo[1], 10)));
  if (/\b(today|this morning|this afternoon|tonight|just now|earlier)\b/.test(t)) return iso(now);
  // "last <weekday>" / "on <weekday>" → most recent past occurrence.
  const wd = t.match(/\b(?:last|on|this)\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (wd) {
    const targetIdx = WEEKDAYS.findIndex((d) => d.startsWith(wd[1]));
    if (targetIdx >= 0) {
      let d = new Date(now);
      for (let i = 0; i < 7; i++) {
        d = subDays(now, i);
        if (d.getDay() === targetIdx && i > 0) break;
      }
      return iso(d);
    }
  }
  return iso(now);
}

/** Build a short description from the utterance (merchant / item). */
function extractDescription(text: string): string | undefined {
  // "at <merchant>" or "from <merchant>".
  const at = text.match(/\b(?:at|from)\s+([A-Za-z0-9'&.\- ]{2,40})/i);
  if (at)
    return at[1]
      .trim()
      .replace(/\s+(yesterday|today|this|last|on)\b.*$/i, "")
      .trim();
  // "on/for <thing>".
  const on = text.match(/\b(?:on|for)\s+([A-Za-z0-9'&.\- ]{2,40})/i);
  if (on)
    return on[1]
      .trim()
      .replace(/\s+(yesterday|today|this|last|on)\b.*$/i, "")
      .trim();
  return undefined;
}

type Intent =
  | { type: "expense"; call: ToolCall }
  | { type: "summary"; call: ToolCall }
  | { type: "recent"; call: ToolCall }
  | { type: "budget"; call: ToolCall }
  | { type: "advice" }
  | { type: "greeting" }
  | { type: "help" }
  | { type: "thanks" }
  | { type: "positive" }
  | { type: "goodbye" }
  | { type: "ack" }
  | { type: "how_are_you" }
  | { type: "unknown" };

function classify(text: string, ctx: FinanceContext): Intent {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(lower))
    return { type: "greeting" };
  if (/\b(help|what can you do|how do you work)\b/.test(lower)) return { type: "help" };

  if (/\b(thanks?|thank you|thx|ty|appreciate it|much appreciated)\b/.test(lower))
    return { type: "thanks" };
  if (
    /\b(awesome|aweome|awsome|great|cool|nice|amazing|perfect|lovely|fantastic|brilliant|good job|well done|nice one|love it|you rock|you're the best)\b/.test(
      lower,
    )
  )
    return { type: "positive" };
  if (/\b(bye|goodbye|see you|see ya|later|gotta go|good night|take care)\b/.test(lower))
    return { type: "goodbye" };
  if (/^(ok|okay|k|got it|understood|sure|alright|right|roger)\.?$/i.test(lower))
    return { type: "ack" };
  if (/\b(how are you|how's it going|how is it going|what's up|whats up)\b/.test(lower))
    return { type: "how_are_you" };

  // Questions take priority over spend-verb detection.
  const isQuestion = t.includes("?") || QUESTION_HINT.test(lower);

  if (isAdviceRequest(lower)) return { type: "advice" };

  if (/\bbudget\b/.test(lower))
    return { type: "budget", call: { name: "get_budget_status", arguments: {} } };

  if (
    /\b(recent|last|latest)\b.*\b(transactions?|expenses?|entries|spending)\b/.test(lower) ||
    /\bshow\b.*\b(transactions?|expenses?)\b/.test(lower)
  ) {
    const n = lower.match(/\b(\d{1,2})\b/);
    return {
      type: "recent",
      call: {
        name: "get_recent_transactions",
        arguments: { limit: n ? parseInt(n[1], 10) : 10 },
      },
    };
  }

  if (isQuestion && /\b(how much|total|spent|spend|spending|summary)\b/.test(lower)) {
    let period: string = "this_month";
    if (/\blast month\b/.test(lower)) period = "last_month";
    else if (/\bthis week\b|\bweek\b/.test(lower)) period = "this_week";
    else if (/\ball time\b|\boverall\b|\btotal ever\b/.test(lower)) period = "all";
    // Try to find a category mention.
    const cat = ctx.expenseCategoryNames.find((c) => lower.includes(c.toLowerCase()));
    return {
      type: "summary",
      call: {
        name: "get_spending_summary",
        arguments: { period, ...(cat ? { category: cat } : {}) },
      },
    };
  }

  // Expense logging: a spend verb (and not a question) + a parseable amount.
  if (!isQuestion && SPEND_VERBS.test(lower)) {
    const money = parseMoney(t, ctx.currency);
    if (money) {
      return {
        type: "expense",
        call: {
          name: "add_transaction",
          arguments: {
            amount: money.amount,
            currency: money.currency,
            category: guessCategoryText(lower, ctx),
            description: extractDescription(t),
            date: parseDate(lower),
          },
        },
      };
    }
  }

  // Bare "amount + noun" without a verb, e.g. "6.50 coffee".
  if (!isQuestion) {
    const money = parseMoney(t, ctx.currency);
    if (money && guessCategoryText(lower, ctx)) {
      return {
        type: "expense",
        call: {
          name: "add_transaction",
          arguments: {
            amount: money.amount,
            currency: money.currency,
            category: guessCategoryText(lower, ctx),
            description: extractDescription(t),
            date: parseDate(lower),
          },
        },
      };
    }
  }

  return { type: "unknown" };
}

/** Pick the phrase most likely to name a category, for the tool to match on. */
function guessCategoryText(lower: string, ctx: FinanceContext): string {
  const direct = ctx.expenseCategoryNames.find((c) => lower.includes(c.toLowerCase()));
  if (direct) return direct;
  return lower; // let matchExpenseCategory's synonym logic take over
}

/**
 * Create a local NLU engine bound to the current finance context.
 */
export function createLocalNluEngine(ctx: FinanceContext): LowLevelEngine {
  return {
    id: "local-nlu",
    label: t("assistant.onDeviceEngine"),
    async chat({ messages }): Promise<ModelTurn> {
      // If the last turn produced tool results, summarise them into a reply.
      const toolResults = trailingToolResults(messages);
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const userText = lastUser?.content ?? "";
      const intent = classify(userText, ctx);

      if (toolResults.length > 0) {
        return { content: replyFromToolResults(intent, toolResults, ctx) };
      }

      switch (intent.type) {
        case "expense":
          return { toolCalls: [intent.call] };
        case "summary":
        case "recent":
        case "budget":
          return { toolCalls: [intent.call] };
        case "advice":
          return { content: buildFinancialAdvice(ctx) };
        case "greeting":
          return { content: t("assistant.backend.greeting") };
        case "help":
          return { content: t("assistant.backend.help") };
        case "thanks":
          return { content: t("assistant.backend.thanks") };
        case "positive":
          return { content: t("assistant.backend.positive") };
        case "goodbye":
          return { content: t("assistant.backend.goodbye") };
        case "ack":
          return { content: t("assistant.backend.ack") };
        case "how_are_you":
          return { content: t("assistant.backend.howAreYou") };
        default:
          return { content: t("assistant.backend.unknown") };
      }
    },
  };
}

function trailingToolResults(messages: EngineMessage[]): EngineMessage[] {
  const out: EngineMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "tool") out.unshift(messages[i]);
    else break;
  }
  return out;
}

function replyFromToolResults(
  intent: Intent,
  results: EngineMessage[],
  ctx: FinanceContext,
): string {
  const joined = results.map((r) => r.content).join(" ");
  if (intent.type === "advice") {
    return `${joined}\n\n${buildFinancialAdvice(ctx)}`;
  }
  // For summary/recent/budget the tool summary is already user-friendly.
  return joined || t("assistant.backend.done");
}
