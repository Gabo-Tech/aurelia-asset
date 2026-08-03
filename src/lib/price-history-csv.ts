import type { CustomPricePoint } from "@/lib/types";

/** Parse pasted/CSV lines of `date,price` into custom history points. */
export function parseCsvHistory(text: string): CustomPricePoint[] {
  const out: CustomPricePoint[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^(date|day|time)/i.test(line)) continue;
    const parts = line.split(/[,;\t]/).map((x) => x.trim());
    if (parts.length < 2) continue;
    const t = Date.parse(parts[0]!);
    const p = parseFloat(parts[1]!.replace(/[^0-9.-]/g, ""));
    if (!isFinite(t) || !isFinite(p)) continue;
    out.push({ t, p });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export function formatCsvHistory(points: CustomPricePoint[]): string {
  return points
    .map((x) => `${new Date(x.t).toISOString().slice(0, 10)},${x.p}`)
    .join("\n");
}
