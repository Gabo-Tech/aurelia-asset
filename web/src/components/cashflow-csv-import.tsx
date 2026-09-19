import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/design/responsive-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, useMoney } from "@/lib/store";
import {
  parseCsvText,
  suggestMapping,
  buildImportPreview,
  previewToCashflows,
  type CsvColumnKey,
  type ImportPreviewRow,
} from "@/lib/cashflow-csv";
import { formatMoney } from "@/lib/format";

const COLUMN_OPTIONS: { id: CsvColumnKey; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "amount", label: "Amount" },
  { id: "description", label: "Description" },
  { id: "kind", label: "Kind" },
  { id: "category", label: "Category" },
  { id: "currency", label: "Currency" },
  { id: "skip", label: "Ignore" },
];

export function CashflowCsvImportButton() {
  const { t } = useTranslation();
  const { state, addCashflow } = useStore();
  const { currency } = useMoney();
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvColumnKey[]>([]);
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [step, setStep] = useState<"file" | "map" | "review">("file");

  const reset = () => {
    setHeaders([]);
    setRows([]);
    setMapping([]);
    setPreview([]);
    setStep("file");
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    const table = parseCsvText(text);
    if (!table.headers.length) {
      toast.error(t("cashflow.import.empty", { defaultValue: "Could not read that CSV." }));
      return;
    }
    setHeaders(table.headers);
    setRows(table.rows);
    const map = suggestMapping(table.headers);
    setMapping(map);
    setStep("map");
  };

  const buildPreview = () => {
    const next = buildImportPreview(
      { headers, rows },
      mapping,
      state.categories,
      state.cashflows,
      currency,
    );
    if (!next.length) {
      toast.error(
        t("cashflow.import.noRows", {
          defaultValue: "No valid rows. Map at least Date and Amount.",
        }),
      );
      return;
    }
    setPreview(next);
    setStep("review");
  };

  const importCount = useMemo(
    () => preview.filter((r) => !r.skip && !r.duplicate).length,
    [preview],
  );

  const commit = () => {
    const entries = previewToCashflows(preview);
    for (const e of entries) addCashflow(e);
    toast.success(
      t("cashflow.import.done", {
        defaultValue: "Imported {{count}} entries",
        count: entries.length,
      }),
    );
    setOpen(false);
    reset();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-9"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        data-tour="cf-csv-import"
      >
        <Upload className="h-4 w-4" />
        {t("cashflow.import.csv", { defaultValue: "Import CSV" })}
      </Button>

      <ResponsiveDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
        title={t("cashflow.import.title", { defaultValue: "Import bank CSV" })}
        description={t("cashflow.import.desc", {
          defaultValue: "Map columns, review rows, then save. Duplicates are skipped.",
        })}
        footer={
          step === "map" ? (
            <Button onClick={buildPreview}>
              {t("cashflow.import.review", { defaultValue: "Review" })}
            </Button>
          ) : step === "review" ? (
            <Button onClick={commit} disabled={importCount === 0}>
              {t("cashflow.import.importN", {
                defaultValue: "Import {{count}}",
                count: importCount,
              })}
            </Button>
          ) : null
        }
      >
        {step === "file" ? (
          <div className="space-y-3">
            <Label htmlFor="cf-csv-file">
              {t("cashflow.import.pickFile", { defaultValue: "Choose a CSV file" })}
            </Label>
            <InputFile
              id="cf-csv-file"
              onChange={(f) => {
                if (f) void onFile(f);
              }}
            />
          </div>
        ) : null}

        {step === "map" ? (
          <div className="space-y-3">
            {headers.map((h, i) => (
              <div key={`${h}-${i}`} className="flex items-center gap-3">
                <div className="min-w-0 flex-1 truncate text-sm">{h}</div>
                <Select
                  value={mapping[i] ?? "skip"}
                  onValueChange={(v) => {
                    const next = [...mapping];
                    next[i] = v as CsvColumnKey;
                    setMapping(next);
                  }}
                >
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_OPTIONS.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        ) : null}

        {step === "review" ? (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {preview.map((r, i) => (
              <label
                key={`${r.date}-${r.amount}-${i}`}
                className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
                  r.duplicate ? "opacity-50 border-border/40" : "border-border/60"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!r.skip && !r.duplicate}
                  disabled={r.duplicate}
                  onChange={(e) => {
                    const next = [...preview];
                    next[i] = { ...r, skip: !e.target.checked };
                    setPreview(next);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium truncate">{r.description}</span>
                    <span className="tabular-nums shrink-0">
                      {r.kind === "expense" ? "−" : "+"}
                      {formatMoney(r.amount, r.currency || currency)}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {r.date} · {r.kind} · {r.category}
                    {r.duplicate
                      ? ` · ${t("cashflow.import.duplicate", { defaultValue: "duplicate" })}`
                      : ""}
                  </div>
                </div>
              </label>
            ))}
          </div>
        ) : null}
      </ResponsiveDialog>
    </>
  );
}

function InputFile({
  id,
  onChange,
}: {
  id: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <input
      id={id}
      type="file"
      accept=".csv,text/csv,text/plain"
      className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
      onChange={(e) => onChange(e.target.files?.[0] ?? null)}
    />
  );
}
