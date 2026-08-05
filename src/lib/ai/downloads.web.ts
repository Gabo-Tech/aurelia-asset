/**
 * Web stub — model download/extract requires native FS.
 */

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
  { kind: "llm", labelKey: "settings.ai.llmModel", sizeLabel: "~1.1 GB", settingsKey: "aiLlmModelPath" },
  { kind: "stt", labelKey: "settings.ai.sttModel", sizeLabel: "~110 MB", settingsKey: "aiSttModelDir" },
  { kind: "tts", labelKey: "settings.ai.ttsModel", sizeLabel: "~60 MB", settingsKey: "aiTtsModelDir" },
];

export function formatDownloadProgress(_p: ModelDownloadProgress): string {
  return "unavailable on web";
}

export function downloadProgressRatio(_p: ModelDownloadProgress | null | undefined): number | undefined {
  return undefined;
}

export function totalDownloadSizeLabel(): string {
  return "n/a";
}

export function cancelActiveDownload(): void {
  /* noop on web */
}

export async function clearInstalledModel(_kind: ModelKind): Promise<void> {
  /* noop on web */
}

export async function downloadModel(
  _kind: ModelKind,
  _onProgress?: (p: ModelDownloadProgress) => void,
): Promise<string> {
  throw new Error("Model download is not available in the browser. Use a native build.");
}

export async function looksLikeSttDir(_dir: string): Promise<boolean> {
  return false;
}

export async function looksLikeTtsDir(_dir: string): Promise<boolean> {
  return false;
}

export async function findEspeakDataDir(_root: string): Promise<string | null> {
  return null;
}

export async function describeSpeechModelDir(
  _kind: "stt" | "tts",
  dir: string | undefined,
): Promise<{ ok: boolean; label: string }> {
  if (!dir?.trim()) return { ok: false, label: "not set" };
  return { ok: false, label: "unavailable on web" };
}
