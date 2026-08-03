/**
 * Browser file import/export for React Native Web (Linux desktop path).
 */

export type ExportSaveMethod = "native" | "share" | "download" | "clipboard" | "cancelled";

export function isNativeApp(): boolean {
  return false;
}

export function isMobilePlatform(): boolean {
  return false;
}

export function escapeCsvField(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(escapeCsvField).join(",")).join("\r\n");
}

export function datedFilename(stem: string, ext: string): string {
  return `${stem}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export async function saveExportFile(
  filename: string,
  opts: { text?: string; bytes?: Uint8Array },
): Promise<ExportSaveMethod> {
  const mime = guessMime(filename);
  let blob: Blob;
  if (opts.bytes) {
    const copy = new Uint8Array(opts.bytes);
    blob = new Blob([copy.buffer], { type: mime });
  } else if (opts.text != null) {
    blob = new Blob([opts.text], { type: mime });
  } else {
    throw new Error("No export content provided");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return "download";
}

export async function readImportFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,text/plain,*/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then(resolve)
        .catch((e) => reject(e));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function pickModelFile(): Promise<string | null> {
  return null;
}

export function redactStateForExport<T extends { settings?: { finnhubKey?: string } }>(
  state: T,
): T {
  if (!state.settings?.finnhubKey) return state;
  return {
    ...state,
    settings: { ...state.settings, finnhubKey: undefined },
  };
}

export function exportMethodDescription(
  method: ExportSaveMethod,
  filename: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  switch (method) {
    case "download":
      return t("settings.data.exportedFile", { defaultValue: `Downloaded ${filename}`, filename });
    case "cancelled":
      return t("settings.data.exportCancelled", { defaultValue: "Export cancelled" });
    default:
      return t("settings.data.exportedFile", { defaultValue: `Saved ${filename}`, filename });
  }
}
