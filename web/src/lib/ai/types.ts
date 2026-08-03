/**
 * Shared types for the offline AI Assistant ("Voice Finance AI").
 *
 * The assistant runs fully on-device. Two interchangeable engines implement the
 * same {@link LowLevelEngine} contract:
 *  - `native-llm`  – a local LLM (Qwen-2.5-1.5B via llama.cpp) exposed through
 *                    Tauri commands. Used on native desktop/mobile builds.
 *  - `local-nlu`   – a deterministic, dependency-free intent parser that runs in
 *                    the browser. Always available, used as the web fallback and
 *                    whenever the native model is not loaded.
 *
 * Both engines speak the same tool-calling protocol so the orchestration loop in
 * `provider.ts` is engine-agnostic.
 */

export type ChatRole = "user" | "assistant" | "system";

/** A single expense the assistant proposes to add. Confirmed by the user before
 *  it is written to the store (confirm-first policy). Mirrors the resolved
 *  arguments of the `add_transaction` tool. */
export interface ProposedExpense {
  amount: number;
  currency: string;
  /** Existing expense category *name* (cashflow entries key on name, not id). */
  categoryName: string;
  /** Resolved category id when a confident match was found (UI hint only). */
  categoryId?: string;
  description?: string;
  /** ISO date string (YYYY-MM-DDT..). */
  date: string;
  /** Account the charge is paid from. "liquidity" or `credit:<id>`. */
  paymentMethod?: string;
}

/** Info shown on the "expense added" success indicator. */
export interface CommittedExpense extends ProposedExpense {
  /** Store id of the created cashflow entry, when available. */
  entryId?: string;
}

/** One entry of the transparency trace: which tool ran and what it returned. */
export interface ToolTrace {
  name: string;
  arguments: Record<string, unknown>;
  /** Short human-readable summary of the result (not the full payload). */
  summary: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** Assistant proposed an expense; render a confirm card. Cleared once the
   *  user confirms or dismisses. */
  pendingExpense?: ProposedExpense;
  /** Expense was successfully written; render a success indicator. */
  committedExpense?: CommittedExpense;
  /** Tools invoked while producing this message (for optional transparency). */
  toolTrace?: ToolTrace[];
  /** Marks an error/degraded reply so the UI can offer a retry. */
  error?: boolean;
}

// ===== Tool-calling protocol =====

/** JSON-schema-ish description of a tool, sent to the LLM. Kept intentionally
 *  small so it fits comfortably in a 1.5B model's context window. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  /** Read tools run immediately and feed results back to the model. Write tools
   *  (add/update) are gated behind user confirmation. */
  kind: "read" | "write";
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** A single turn produced by an engine: either it wants to call tools, or it has
 *  a final natural-language answer. */
export interface ModelTurn {
  toolCalls?: ToolCall[];
  content?: string;
}

/** Messages exchanged with the low-level engine during the tool loop. */
export interface EngineMessage {
  role: ChatRole | "tool";
  content: string;
  /** For role "tool": which tool this result belongs to. */
  toolName?: string;
}

/** The minimal contract every engine implements. `chat` performs exactly one
 *  turn; the orchestrator in `provider.ts` drives the multi-step loop. */
export interface LowLevelEngine {
  id: "native-llm" | "local-nlu";
  label: string;
  chat(req: { system: string; messages: EngineMessage[]; tools: ToolSpec[] }): Promise<ModelTurn>;
}

/** Final result of running the assistant on one user message. */
export interface AssistantResult {
  reply: string;
  /** Present when the assistant wants to add an expense (awaits confirmation). */
  proposedExpense?: ProposedExpense;
  toolTrace: ToolTrace[];
  engineId: LowLevelEngine["id"];
  error?: boolean;
}
