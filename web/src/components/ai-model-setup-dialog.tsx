import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStore } from "@/lib/store";
import { getAiCapabilities } from "@/lib/ai/provider";
import { aiConfigFromSettings } from "@/lib/ai/config";
import {
  downloadAllModels,
  formatDownloadProgress,
  isNativeDesktop,
  MODEL_MANIFEST,
  totalDownloadSizeLabel,
  type ModelDownloadProgress,
  type ModelKind,
} from "@/lib/ai/downloads";

type SetupPhase = "consent" | "downloading" | "done" | "error";

export function AiModelSetupDialog() {
  const { t } = useTranslation();
  const { state, updateSettings } = useStore();
  const s = state.settings;
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<SetupPhase>("consent");
  const [activeKind, setActiveKind] = useState<ModelKind | null>(null);
  const [progressByKind, setProgressByKind] = useState<
    Partial<Record<ModelKind, ModelDownloadProgress>>
  >({});
  const [error, setError] = useState<string | null>(null);

  const kindsToOffer = useMemo(() => {
    return MODEL_MANIFEST.filter((m) => {
      if (m.kind === "llm" && s.aiLlmModelPath) return false;
      if (m.kind === "stt" && s.aiSttModelDir) return false;
      if (m.kind === "tts" && s.aiTtsModelDir) return false;
      return true;
    }).map((m) => m.kind);
  }, [s.aiLlmModelPath, s.aiSttModelDir, s.aiTtsModelDir]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (s.aiAssistantEnabled === false) return;
      if (s.aiModelSetup && s.aiModelSetup !== "pending") return;
      if (kindsToOffer.length === 0) return;
      if (!(await isNativeDesktop())) return;

      const caps = await getAiCapabilities(aiConfigFromSettings(s));
      if (!alive) return;
      const featuresOn = caps.llmEnabled || caps.sttEnabled || caps.ttsEnabled;
      if (!featuresOn) return;

      setOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, [s, kindsToOffer.length]);

  const decline = () => {
    updateSettings({ aiModelSetup: "declined" });
    setOpen(false);
  };

  const startDownload = async () => {
    setPhase("downloading");
    setError(null);
    setProgressByKind({});

    const enabledKinds = kindsToOffer.filter((kind) => {
      // Only download models whose backend is compiled in.
      // We re-fetch caps here to avoid stale closure.
      return true;
    });

    try {
      const caps = await getAiCapabilities(aiConfigFromSettings(s));
      const kinds: ModelKind[] = [];
      if (enabledKinds.includes("llm") && caps.llmEnabled) kinds.push("llm");
      if (enabledKinds.includes("stt") && caps.sttEnabled) kinds.push("stt");
      if (enabledKinds.includes("tts") && caps.ttsEnabled) kinds.push("tts");

      if (kinds.length === 0) {
        updateSettings({ aiModelSetup: "declined" });
        setOpen(false);
        return;
      }

      const paths = await downloadAllModels(kinds, (kind, progress) => {
        setActiveKind(kind);
        setProgressByKind((prev) => ({ ...prev, [kind]: progress }));
      });

      const patch: Record<string, string> = {};
      if (paths.llm) patch.aiLlmModelPath = paths.llm;
      if (paths.stt) patch.aiSttModelDir = paths.stt;
      if (paths.tts) patch.aiTtsModelDir = paths.tts;
      updateSettings({ ...patch, aiModelSetup: "done" });
      setPhase("done");
      setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : t("settings.ai.downloadFailed"));
    }
  };

  const activeProgress = activeKind ? progressByKind[activeKind] : undefined;
  const activePct =
    activeProgress?.total && activeProgress.total > 0
      ? Math.min(100, Math.round((activeProgress.received / activeProgress.total) * 100))
      : undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && phase !== "downloading" && setOpen(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("settings.ai.setupTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.ai.setupDescription", { size: totalDownloadSizeLabel() })}
          </DialogDescription>
        </DialogHeader>

        {phase === "consent" && (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {kindsToOffer.map((kind) => {
              const entry = MODEL_MANIFEST.find((m) => m.kind === kind)!;
              return (
                <li
                  key={kind}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                >
                  <span>{t(entry.labelKey)}</span>
                  <span className="text-xs">{entry.sizeLabel}</span>
                </li>
              );
            })}
          </ul>
        )}

        {phase === "downloading" && activeKind && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {t(MODEL_MANIFEST.find((m) => m.kind === activeKind)!.labelKey)}
            </p>
            <Progress value={activePct ?? (activeProgress?.phase === "extracting" ? 100 : 8)} />
            <p className="text-xs text-muted-foreground">
              {activeProgress
                ? formatDownloadProgress(activeProgress)
                : t("settings.ai.downloadStarting")}
            </p>
          </div>
        )}

        {phase === "done" && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {t("settings.ai.setupDone")}
          </p>
        )}

        {phase === "error" && error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          {phase === "consent" && (
            <>
              <Button variant="outline" onClick={decline}>
                {t("settings.ai.setupDecline")}
              </Button>
              <Button onClick={() => void startDownload()}>
                <Download className="mr-2 h-4 w-4" />
                {t("settings.ai.setupDownloadAll")}
              </Button>
            </>
          )}
          {phase === "error" && (
            <>
              <Button variant="outline" onClick={decline}>
                {t("settings.ai.setupDecline")}
              </Button>
              <Button onClick={() => void startDownload()}>{t("settings.ai.downloadRetry")}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
