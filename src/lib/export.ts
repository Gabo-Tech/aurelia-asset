/**
 * Local file import/export — replaces Tauri dialog + fs commands.
 */

import { Platform } from "react-native";
import Share from "react-native-share";
import ReactNativeBlobUtil from "react-native-blob-util";
import { pick, types, keepLocalCopy } from "@react-native-documents/picker";

export type ExportSaveMethod = "native" | "share" | "download" | "clipboard" | "cancelled";

export function isNativeApp(): boolean {
  return Platform.OS !== "web";
}

export function isMobilePlatform(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
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

/** Save text or bytes via share sheet / Downloads (Android) / temp file. */
export async function saveExportFile(
  filename: string,
  opts: { text?: string; bytes?: Uint8Array },
): Promise<ExportSaveMethod> {
  const mime = guessMime(filename);
  const dirs = ReactNativeBlobUtil.fs.dirs;
  const path = `${dirs.CacheDir}/${filename}`;

  try {
    if (opts.bytes) {
      const b64 = ReactNativeBlobUtil.base64.encode(
        Array.from(opts.bytes)
          .map((b) => String.fromCharCode(b))
          .join(""),
      );
      await ReactNativeBlobUtil.fs.writeFile(path, b64, "base64");
    } else if (opts.text != null) {
      await ReactNativeBlobUtil.fs.writeFile(path, opts.text, "utf8");
    } else {
      throw new Error("No export content provided");
    }

    if (Platform.OS === "android") {
      try {
        await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
          {
            name: filename,
            parentFolder: "FinancialTracker",
            mimeType: mime,
          },
          "Download",
          path,
        );
        return "native";
      } catch {
        /* fall through to share */
      }
    }

    await Share.open({
      url: Platform.OS === "android" ? `file://${path}` : path,
      type: mime,
      filename,
      failOnCancel: false,
    });
    return "share";
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/cancel/i.test(msg)) return "cancelled";
    throw e;
  }
}

/** Pick a JSON (or any) document and return its UTF-8 text. */
export async function readImportFile(): Promise<string | null> {
  try {
    const [file] = await pick({
      type: [types.json, types.plainText, types.allFiles],
      allowMultiSelection: false,
    });
    if (!file) return null;

    const [local] = await keepLocalCopy({
      files: [
        {
          uri: file.uri,
          fileName: file.name ?? "import.json",
        },
      ],
      destination: "cachesDirectory",
    });

    if (local.status !== "success") return null;
    const content = await ReactNativeBlobUtil.fs.readFile(local.localUri, "utf8");
    return content;
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/cancel/i.test(msg)) return null;
    throw e;
  }
}

/** Pick a model file (GGUF) or return a directory-like path when possible. */
export async function pickModelFile(): Promise<string | null> {
  try {
    const [file] = await pick({
      type: [types.allFiles],
      allowMultiSelection: false,
    });
    if (!file) return null;
    const [local] = await keepLocalCopy({
      files: [{ uri: file.uri, fileName: file.name ?? "model.bin" }],
      destination: "documentDirectory",
    });
    if (local.status !== "success") return null;
    return local.localUri;
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/cancel/i.test(msg)) return null;
    throw e;
  }
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
    case "native":
      return t("settings.data.exportedNative", { defaultValue: `Saved ${filename}`, filename });
    case "share":
      return t("settings.data.exportedShare", { defaultValue: `Shared ${filename}`, filename });
    case "cancelled":
      return t("settings.data.exportCancelled", { defaultValue: "Export cancelled" });
    default:
      return t("settings.data.exportedFile", { defaultValue: `Saved ${filename}`, filename });
  }
}
