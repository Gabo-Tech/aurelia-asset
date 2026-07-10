import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import {
  Sparkles,
  Mic,
  Square,
  Send,
  Loader2,
  Check,
  Trash2,
  Volume2,
  VolumeX,
  RotateCcw,
  Bot,
  User as UserIcon,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useStore, useMoney } from "@/lib/store";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

import type { ChatMessage, EngineMessage } from "@/lib/ai/types";
import { runAssistant, getAiCapabilities, type ToolDeps } from "@/lib/ai/provider";
import { proposalToCashflow } from "@/lib/ai/tools";
import {
  VoiceListener,
  detectVoiceCapabilities,
  speak,
  stopSpeaking,
  type VoiceCapabilities,
} from "@/lib/ai/voice";
import { loadChatHistory, saveChatHistory, clearChatHistory } from "@/lib/ai/persistence";
import { aiConfigFromSettings } from "@/lib/ai/config";
import { SITE_URL } from "@/lib/site-config";

export const Route = createFileRoute("/assistant")({
  head: () => {
    const title = i18n.t("assistant.metaTitle", {
      defaultValue: "AI Assistant · Aurelia Asset",
    });
    const desc = i18n.t("assistant.metaDesc", {
      defaultValue:
        "Talk to a fully offline finance assistant. Log expenses by voice or text and get saving tips from your own data.",
    });
    const url = `${SITE_URL}/assistant`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: AssistantPage,
});

type Pipeline = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function AssistantPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { state, addCashflow, updateSettings } = useStore();
  const { currency, toDisplay } = useMoney();
  const assistantEnabled = state.settings.aiAssistantEnabled !== false;

  useEffect(() => {
    if (!assistantEnabled) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [assistantEnabled, navigate]);

  if (!assistantEnabled) return null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pipeline, setPipeline] = useState<Pipeline>("idle");
  const [voiceCaps, setVoiceCaps] = useState<VoiceCapabilities>({
    stt: "none",
    tts: "none",
  });
  const [engineLabel, setEngineLabel] = useState<string>("");

  const listenerRef = useRef<VoiceListener | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hydratedRef = useRef(false);

  const locale = i18n.language || "en";

  // Voice output preference is persisted in Settings (default on).
  const ttsEnabled = state.settings.aiTtsEnabled !== false;
  const setTtsEnabled = useCallback(
    (v: boolean) => updateSettings({ aiTtsEnabled: v }),
    [updateSettings],
  );

  // Model locations (native builds) come from Settings.
  const aiConfig = useMemo(() => aiConfigFromSettings(state.settings), [state.settings]);

  const deps: ToolDeps = useMemo(
    () => ({
      state,
      toDisplay,
      currency,
      locale,
      adviceDisclaimerSeen: state.settings.aiAdviceDisclaimerSeen === true,
      markAdviceDisclaimerSeen: () => updateSettings({ aiAdviceDisclaimerSeen: true }),
    }),
    [state, toDisplay, currency, locale, updateSettings],
  );

  // ---- Load persisted history on mount ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const history = await loadChatHistory();
      if (!alive) return;
      setMessages(history);
      hydratedRef.current = true;
    })();
    return () => {
      alive = false;
      listenerRef.current?.cancel();
    };
  }, []);

  // ---- (Re)detect capabilities whenever the model config changes ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const caps = await getAiCapabilities(aiConfig);
      if (!alive) return;
      setVoiceCaps(detectVoiceCapabilities(caps));
      setEngineLabel(
        caps.llm
          ? caps.model || t("assistant.localLlm")
          : t("assistant.onDeviceEngine"),
      );
    })();
    return () => {
      alive = false;
    };
  }, [aiConfig, t]);

  // ---- Persist history whenever it changes (after initial hydration) ----
  useEffect(() => {
    if (!hydratedRef.current) return;
    void saveChatHistory(messages);
  }, [messages]);

  // ---- Autoscroll to the newest message ----
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pipeline]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const buildEngineHistory = useCallback((): EngineMessage[] => {
    return messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  const maybeSpeak = useCallback(
    async (text: string) => {
      if (!ttsEnabled || voiceCaps.tts === "none") return;
      setPipeline("speaking");
      try {
        await speak(text, voiceCaps.tts, locale, aiConfig.ttsDir);
      } finally {
        setPipeline("idle");
      }
    },
    [ttsEnabled, voiceCaps.tts, locale, aiConfig.ttsDir],
  );

  // ---- Core: send a message through the assistant pipeline ----
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || pipeline === "thinking") return;

      const history = buildEngineHistory();
      appendMessage({
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      });
      setInput("");
      setPipeline("thinking");

      try {
        const result = await runAssistant(text, deps, history, aiConfig);
        if (result.engineId === "native-llm") setEngineLabel(t("assistant.localLlmQwen"));
        appendMessage({
          id: uid(),
          role: "assistant",
          content: result.reply,
          createdAt: Date.now(),
          pendingExpense: result.proposedExpense,
          toolTrace: result.toolTrace,
          error: result.error,
        });
        setPipeline("idle");
        void maybeSpeak(result.reply);
      } catch (err) {
        console.error(err);
        appendMessage({
          id: uid(),
          role: "assistant",
          content: t("assistant.genericError", {
            defaultValue: "Sorry, something went wrong. Please try again.",
          }),
          createdAt: Date.now(),
          error: true,
        });
        setPipeline("idle");
      }
    },
    [pipeline, buildEngineHistory, appendMessage, deps, aiConfig, maybeSpeak, t],
  );

  // ---- Voice: start/stop listening ----
  const startListening = useCallback(() => {
    if (voiceCaps.stt === "none") {
      toast.error(
        t("assistant.voiceUnavailable", {
          defaultValue: "Voice input isn't available on this device.",
        }),
      );
      return;
    }
    stopSpeaking(voiceCaps.tts);
    const listener = new VoiceListener(voiceCaps.stt, locale, aiConfig.sttDir);
    listenerRef.current = listener;
    setPipeline("listening");
    void listener.start({
      onStart: () => setPipeline("listening"),
      onPartial: (txt) => setInput(txt),
      onEnd: () => {
        setPipeline((p) => (p === "listening" ? "transcribing" : p));
      },
      onFinal: (txt) => {
        listenerRef.current = null;
        void send(txt);
      },
      onError: (msg) => {
        listenerRef.current = null;
        setPipeline("idle");
        if (msg === "no-speech") {
          toast.error(
            t("assistant.noSpeech", {
              defaultValue: "I didn't hear anything. Tap the mic and try again.",
            }),
          );
        } else {
          toast.error(
            t("assistant.sttError", {
              defaultValue: "Couldn't capture audio. Check mic permissions.",
            }),
          );
        }
      },
    });
  }, [voiceCaps.stt, voiceCaps.tts, locale, aiConfig.sttDir, send, t]);

  const stopListening = useCallback(() => {
    listenerRef.current?.stop();
  }, []);

  const toggleMic = useCallback(() => {
    if (pipeline === "listening") stopListening();
    else startListening();
  }, [pipeline, startListening, stopListening]);

  // ---- Confirm / dismiss a proposed expense ----
  const confirmExpense = useCallback(
    (messageId: string) => {
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === messageId);
        if (!msg?.pendingExpense) return prev;
        const proposal = msg.pendingExpense;
        addCashflow(proposalToCashflow(proposal));
        toast.success(
          t("assistant.expenseAdded", {
            defaultValue: "Expense added",
          }),
        );
        const updated = prev.map((m) =>
          m.id === messageId ? { ...m, pendingExpense: undefined, committedExpense: proposal } : m,
        );
        return [
          ...updated,
          {
            id: uid(),
            role: "assistant" as const,
            content: t("assistant.expenseAddedMsg", {
              amount: formatMoney(proposal.amount, proposal.currency),
              category: proposal.categoryName,
            }),
            createdAt: Date.now(),
          },
        ];
      });
    },
    [addCashflow, t],
  );

  const dismissExpense = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, pendingExpense: undefined } : m)),
    );
  }, []);

  const handleClear = useCallback(() => {
    setMessages([]);
    void clearChatHistory();
    stopSpeaking(voiceCaps.tts);
  }, [voiceCaps.tts]);

  const busy = pipeline === "thinking" || pipeline === "transcribing";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col">
      <PageHeader
        title={t("assistant.title")}
        description={t("assistant.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              {engineLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => setTtsEnabled(!ttsEnabled)}
              title={ttsEnabled ? t("assistant.muteVoice") : t("assistant.unmuteVoice")}
              aria-pressed={ttsEnabled}
              aria-label={ttsEnabled ? t("assistant.muteVoice") : t("assistant.unmuteVoice")}
            >
              {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={handleClear}
              disabled={messages.length === 0}
              title={t("assistant.clear")}
              aria-label={t("assistant.clear")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Message list */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-card/30 p-3 sm:p-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onConfirm={() => confirmExpense(m.id)}
              onDismiss={() => dismissExpense(m.id)}
              onRetry={() => {
                // Retry: resend the previous user message.
                const idx = messages.findIndex((x) => x.id === m.id);
                const prevUser = [...messages.slice(0, idx)]
                  .reverse()
                  .find((x) => x.role === "user");
                if (prevUser) void send(prevUser.content);
              }}
              confirmLabel={t("assistant.confirmAdd")}
              cancelLabel={t("assistant.cancel")}
              retryLabel={t("assistant.retry")}
            />
          ))
        )}
        {pipeline === "thinking" && (
          <StatusRow
            icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
            label={t("assistant.thinking", { defaultValue: "Thinking…" })}
          />
        )}
        {pipeline === "transcribing" && (
          <StatusRow
            icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
            label={t("assistant.transcribing", { defaultValue: "Transcribing…" })}
          />
        )}
        {pipeline === "speaking" && (
          <StatusRow
            icon={<Volume2 className="h-3.5 w-3.5" />}
            label={t("assistant.speaking", { defaultValue: "Speaking…" })}
          />
        )}
      </div>

      {/* Input bar — sticky on mobile so keyboard doesn't hide controls */}
      <div className="sticky bottom-0 z-10 mt-3 flex items-end gap-2 border-t border-border/40 bg-background/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:border-t-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="relative flex-1">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={
              pipeline === "listening"
                ? t("assistant.listeningPlaceholder")
                : t("assistant.inputPlaceholder")
            }
            rows={1}
            className="max-h-32 min-h-[44px] resize-none pr-2 text-base sm:text-sm"
            disabled={pipeline === "listening"}
          />
        </div>

        <Button
          type="button"
          size="icon"
          variant={pipeline === "listening" ? "destructive" : "secondary"}
          onClick={toggleMic}
          className={cn(
            "h-11 w-11 shrink-0 rounded-full",
            pipeline === "listening" && "animate-pulse",
          )}
          title={pipeline === "listening" ? t("assistant.stopRecording") : t("assistant.startRecording")}
          aria-label={pipeline === "listening" ? t("assistant.stopRecording") : t("assistant.startRecording")}
        >
          {pipeline === "listening" ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </Button>

        <Button
          type="button"
          size="icon"
          onClick={() => send(input)}
          disabled={!input.trim() || busy}
          className="h-11 w-11 shrink-0 rounded-full"
          title={t("assistant.sendBtn")}
          aria-label={t("assistant.sendBtn")}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {voiceCaps.stt === "none" && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
          {t("assistant.voiceHint", {
            defaultValue:
              "Voice input requires the native app or a supported browser. Text works everywhere.",
          })}
        </p>
      )}
    </div>
  );
}

function StatusRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      {label}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-7 w-7" />
      </div>
      <div className="max-w-sm">
        <h3 className="text-base font-semibold">
          {t("assistant.emptyTitle", { defaultValue: "Your private money assistant" })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("assistant.emptyBody", {
            defaultValue:
              "Say or type things like “I spent 45 on groceries at Walmart yesterday”. I'll confirm before saving, and everything stays on your device.",
          })}
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onConfirm,
  onDismiss,
  onRetry,
  confirmLabel,
  cancelLabel,
  retryLabel,
}: {
  message: ChatMessage;
  onConfirm: () => void;
  onDismiss: () => void;
  onRetry: () => void;
  confirmLabel: string;
  cancelLabel: string;
  retryLabel: string;
}) {
  const { i18n } = useTranslation();
  const isUser = message.role === "user";
  const p = message.pendingExpense;
  const committed = message.committedExpense;

  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
          isUser ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {isUser ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn("min-w-0 max-w-[85%]", isUser && "items-end")}>
        <div
          className={cn(
            "whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm bg-muted text-foreground",
            message.error && !isUser && "border border-destructive/40",
          )}
        >
          {message.content}
        </div>

        {/* Confirm-first expense card */}
        {p && (
          <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{formatMoney(p.amount, p.currency)}</span>
              <span className="text-muted-foreground">{p.categoryName}</span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {new Date(p.date).toLocaleDateString(i18n.language, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              {p.description ? ` · ${p.description}` : ""}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button size="sm" className="h-9 min-w-[5.5rem]" onClick={onConfirm}>
                <Check className="h-3.5 w-3.5" />
                {confirmLabel}
              </Button>
              <Button size="sm" variant="outline" className="h-9 min-w-[5.5rem]" onClick={onDismiss}>
                {cancelLabel}
              </Button>
            </div>
          </div>
        )}

        {/* Success indicator */}
        {committed && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            {formatMoney(committed.amount, committed.currency)} · {committed.categoryName}
          </div>
        )}

        {/* Retry on error */}
        {message.error && !isUser && !p && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
