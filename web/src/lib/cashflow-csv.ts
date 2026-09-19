import type { CashflowEntry, Category } from "@/lib/types";

export type CsvColumnKey = "date" | "amount" | "description" | "kind" | "category" | "currency" | "skip";

export type ParsedCsvTable = {
  headers: string[];
  rows: string[][];
};

const DATE_KEYS = ["date", "booking date", "value date", "fecha", "datum"];
const AMOUNT_KEYS = ["amount", "importe", "betrag", "value", "sum"];
const DESC_KEYS = ["description", "desc", "memo", "concept", "payee", "name", "label", "narration"];
const KIND_KEYS = ["kind", "type", "transaction type"];
const CAT_KEYS = ["category", "categoría", "kategorie"];
const CCY_KEYS = ["currency", "ccy", "moneda", "währung"];

function norm(h: string): string {
  return h.trim().toLowerCase();
}

function guessKey(header: string): CsvColumnKey {
  const h = norm(header);
  if (DATE_KEYS.some((k) => h.includes(k))) return "date";
  if (AMOUNT_KEYS.some((k) => h === k || h.includes(k))) return "amount";
  if (DESC_KEYS.some((k) => h.includes(k))) return "description";
  if (KIND_KEYS.some((k) => h === k || h.includes(k))) return "kind";
  if (CAT_KEYS.some((k) => h.includes(k))) return "category";
  if (CCY_KEYS.some((k) => h.includes(k))) return "currency";
  return "skip";
}

/** Parse a CSV/TSV blob into headers + rows. Handles quoted fields. */
export function parseCsvText(text: string): ParsedCsvTable {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delim = lines[0].includes(";") && !lines[0].includes(",") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export function suggestMapping(headers: string[]): CsvColumnKey[] {
  return headers.map(guessKey);
}

function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  // European: 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (mdy) {
    let a = Number(mdy[1]);
    let b = Number(mdy[2]);
    let y = Number(mdy[3]);
    if (y < 100) y += 2000;
    // Prefer DMY when day > 12
    let day = a;
    let month = b;
    if (a <= 12 && b > 12) {
      month = a;
      day = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export type ImportPreviewRow = {
  date: string;
  amount: number;
  description: string;
  kind: "income" | "expense";
  category: string;
  currency?: string;
  duplicate: boolean;
  skip: boolean;
};

export function buildImportPreview(
  table: ParsedCsvTable,
  mapping: CsvColumnKey[],
  categories: Category[],
  existing: CashflowEntry[],
  defaultCurrency: string,
): ImportPreviewRow[] {
  const idx = (key: CsvColumnKey) => mapping.findIndex((m) => m === key);
  const iDate = idx("date");
  const iAmount = idx("amount");
  const iDesc = idx("description");
  const iKind = idx("kind");
  const iCat = idx("category");
  const iCcy = idx("currency");
  if (iDate < 0 || iAmount < 0) return [];

  const existingKeys = new Set(
    existing.map(
      (e) =>
        `${e.date.slice(0, 10)}|${Number(e.amount).toFixed(2)}|${(e.description || e.source || "").toLowerCase()}`,
    ),
  );

  const expenseCats = categories.filter((c) => c.kind === "expense");
  const incomeCats = categories.filter((c) => c.kind === "income");

  return table.rows
    .map((row): ImportPreviewRow | null => {
      const date = parseDate(row[iDate] ?? "");
      const amountRaw = parseAmount(row[iAmount] ?? "");
      if (!date || amountRaw == null || amountRaw === 0) return null;
      const description = (iDesc >= 0 ? row[iDesc] : "") || "Imported";
      let kind: "income" | "expense" =
        amountRaw < 0 ? "expense" : "income";
      if (iKind >= 0) {
        const k = (row[iKind] || "").toLowerCase();
        if (k.includes("exp") || k.includes("debit") || k.includes("out")) kind = "expense";
        if (k.includes("inc") || k.includes("credit") || k.includes("in")) kind = "income";
      } else if (amountRaw < 0) kind = "expense";
      const amount = Math.abs(amountRaw);
      let category =
        iCat >= 0 ? (row[iCat] || "").trim() : kind === "expense" ? "Other" : "Other Income";
      const pool = kind === "expense" ? expenseCats : incomeCats;
      if (category && !pool.some((c) => c.name.toLowerCase() === category.toLowerCase())) {
        const fuzzy = pool.find((c) => category.toLowerCase().includes(c.name.toLowerCase()));
        category = fuzzy?.name || (kind === "expense" ? "Food" : "Other Income");
      }
      if (!category) category = kind === "expense" ? "Food" : "Other Income";
      const currency = (iCcy >= 0 ? row[iCcy] : "") || defaultCurrency;
      const key = `${date}|${amount.toFixed(2)}|${description.toLowerCase()}`;
      return {
        date,
        amount,
        description,
        kind,
        category,
        currency,
        duplicate: existingKeys.has(key),
        skip: false,
      };
    })
    .filter((r): r is ImportPreviewRow => r != null);
}

export function previewToCashflows(
  rows: ImportPreviewRow[],
): Omit<CashflowEntry, "id">[] {
  return rows
    .filter((r) => !r.skip && !r.duplicate)
    .map((r) => ({
      kind: r.kind,
      source: r.description,
      category: r.category,
      amount: r.amount,
      currency: r.currency,
      date: new Date(r.date + "T12:00:00").toISOString(),
      description: r.description,
      paymentMethod: "liquidity" as const,
    }));
}
