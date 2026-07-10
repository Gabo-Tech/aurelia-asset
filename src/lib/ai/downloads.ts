/**
 * On-device AI model download client (native desktop only).
 *
 * Streams download progress from the Rust `download_model` command and returns
 * the resolved filesystem path so Settings can be updated automatically.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "@/lib/export";
import { t } from "@/lib/i18n-t";

export type ModelKind = "llm" | "stt" | "tts";

export type ModelDownloadPhase = "downloading" | "downloaded" | "extracting" | "ready";

export interface ModelDownloadProgress {
  kind: ModelKind;
  received: number;
  total?: number;
  phase: ModelDownloadPhase;
}

export interface ModelManifestEntry {
  kind: ModelKind;
  labelKey: string;
  sizeLabel: string;
  settingsKey: "aiLlmModelPath" | "aiSttModelDir" | "aiTtsModelDir";
}

export const MODEL_MANIFEST: ModelManifestEntry[] = [
  {
    kind: "llm",
    labelKey: "settings.ai.llmModel",
    sizeLabel: "~1.1 GB",
    settingsKey: "aiLlmModelPath",
  },
  {
    kind: "stt",
    labelKey: "settings.ai.sttModel",
    sizeLabel: "~75 MB",
    settingsKey: "aiSttModelDir",
  },
  {
    kind: "tts",
    labelKey: "settings.ai.ttsModel",
    sizeLabel: "~60 MB",
    settingsKey: "aiTtsModelDir",
  },
];

export function totalDownloadSizeLabel(): string {
  return "~1.2 GB";
}

export async function isNativeDesktop(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("is_native_desktop");
  } catch {
    return true;
  }
}

export async function downloadModel(
  kind: ModelKind,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<string> {
  let unlisten: UnlistenFn | undefined;
  if (onProgress) {
    unlisten = await listen<ModelDownloadProgress>("model-download-progress", (event) => {
      if (event.payload.kind === kind) onProgress(event.payload);
    });
  }

  try {
    return await invoke<string>("download_model", { kind });
  } finally {
    await unlisten?.();
  }
}

export function modelLabel(kind: ModelKind): string {
  const entry = MODEL_MANIFEST.find((m) => m.kind === kind);
  if (!entry) return kind;
  return t(entry.labelKey);
}

export function formatDownloadProgress(progress: ModelDownloadProgress): string {
  const { received, total, phase } = progress;
  if (phase === "extracting") {
    return t("settings.ai.downloadExtracting");
  }
  if (phase === "ready") {
    return t("settings.ai.downloadReady");
  }
  if (total && total > 0) {
    const pct = Math.min(100, Math.round((received / total) * 100));
    return t("settings.ai.downloadProgress", { pct });
  }
  const mb = (received / (1024 * 1024)).toFixed(1);
  return t("settings.ai.downloadProgressUnknown", { mb });
}

export async function downloadAllModels(
  kinds: ModelKind[],
  onProgress?: (kind: ModelKind, progress: ModelDownloadProgress) => void,
): Promise<Record<ModelKind, string>> {
  const out = {} as Record<ModelKind, string>;
  for (const kind of kinds) {
    out[kind] = await downloadModel(kind, (p) => onProgress?.(kind, p));
  }
  return out;
}
