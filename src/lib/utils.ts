/** Style helper kept for shared component ports; RN uses StyleSheet primarily. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
