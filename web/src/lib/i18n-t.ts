import i18n from "@/i18n";

/** Translate outside React components (AI backend, lib utilities). */
export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}
