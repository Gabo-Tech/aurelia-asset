import i18n from "@/i18n";

export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}
