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
  { kind: "stt", labelKey: "settings.ai.sttModel", sizeLabel: "~75 MB", settingsKey: "aiSttModelDir" },
  { kind: "tts", labelKey: "settings.ai.ttsModel", sizeLabel: "~60 MB", settingsKey: "aiTtsModelDir" },
];

export function formatDownloadProgress(_p: ModelDownloadProgress): string {
  return "unavailable on web";
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
