import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app-shell";
import { LocalFirstBadge } from "@/components/design";
import {
  Download,
  Upload,
  RotateCcw,
  FileJson,
  FileSpreadsheet,
  Languages,
  RefreshCw,
  Copy,
  ClipboardPaste,
  Sparkles,
  Volume2,
  FolderOpen,
  X,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { clearPriceHistoryCache } from "@/lib/finance";
import { invalidatePortfolioPriceQueries } from "@/hooks/use-portfolio-history";
import { isTauri, isMobilePlatform } from "@/lib/export";
import { getAiCapabilities, type AiCapabilities } from "@/lib/ai/provider";
import { aiConfigFromSettings } from "@/lib/ai/config";
import { clearChatHistory } from "@/lib/ai/persistence";
import {
  downloadModel,
  formatDownloadProgress,
  isNativeDesktop,
  type ModelDownloadProgress,
  type ModelKind,
} from "@/lib/ai/downloads";
import { Progress } from "@/components/ui/progress";
import {
  datedFilename,
  exportMethodDescription,
  redactStateForExport,
  rowsToCsv,
  saveExportFile,
  stringifyExportJson,
} from "@/lib/export";
import { toast } from "sonner";
import { z } from "zod";
import type { AppState } from "@/lib/types";
import { secureGet, secureSet } from "@/lib/secure-storage";
import { CURRENCIES } from "@/lib/currency";
import { useLanguage } from "@/i18n/use-language";
import { SUPPORTED_LANGUAGES, LANG_STORAGE_KEY, type LanguageCode } from "@/i18n";
import i18n from "@/i18n";

const ALLOWED_CORS_PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
] as const;

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Invalid color");
const isoDate = z.string().max(64);
const finiteNumber = z.number().finite();
const nonNegNumber = finiteNumber.min(0);

const holdingSchema = z.object({
  id: z.string().min(1).max(128),
  symbol: z.string().max(32),
  name: z.string().max(200),
  type: z.enum(["crypto", "stock", "etf", "metal", "other"]),
  quantity: finiteNumber,
  manualPrice: nonNegNumber.optional(),
  currentPrice: nonNegNumber,
  priceCurrency: z.string().max(16).optional(),
  color: hexColor,
  coinGeckoId: z.string().max(128).optional(),
  lastPriceAt: finiteNumber.optional(),
  customHistory: z
    .array(z.object({ t: finiteNumber, p: finiteNumber }))
    .max(10000)
    .optional(),
  notes: z.string().max(2000).optional(),
  openingQuantity: finiteNumber.optional(),
  horizon: z.enum(["long", "short"]).optional(),
});

const recurrenceSchema = z.object({
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  until: isoDate.optional(),
});

const accountRefSchema = z
  .string()
  .max(160)
  .regex(/^(liquidity|holding:[\w-]+|credit:[\w-]+)$/);

const installmentPlanSchema = z.object({
  total: finiteNumber,
  count: z.number().int().min(1).max(600),
  frequency: z.enum(["weekly", "monthly"]),
  firstDueDate: isoDate,
});

const cashflowSchema = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(["income", "expense", "transfer"]),
  source: z.string().max(200),
  category: z.string().max(128),
  amount: finiteNumber,
  currency: z.string().max(16).optional(),
  date: isoDate,
  recurrence: recurrenceSchema.optional(),
  amountKind: z.enum(["fixed", "percent"]).optional(),
  percentOf: z.string().max(128).optional(),
  description: z.string().max(500).optional(),
  paymentMethod: accountRefSchema.optional(),
  fromAccount: accountRefSchema.optional(),
  toAccount: accountRefSchema.optional(),
  installmentPlan: installmentPlanSchema.optional(),
  linkedTransactionId: z.string().max(128).optional(),
});

const transactionSchema = z.object({
  id: z.string().min(1).max(128),
  holdingId: z.string().min(1).max(128),
  kind: z.enum(["buy", "sell"]),
  date: isoDate,
  quantity: nonNegNumber,
  pricePerUnit: nonNegNumber,
  currency: z.string().max(16).optional(),
  fees: nonNegNumber.optional(),
  notes: z.string().max(2000).optional(),
});

const categorySchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(128),
  kind: z.enum(["income", "expense"]),
  group: z.enum(["income", "expense", "savings", "investment"]),
  color: hexColor,
});

const creditCardSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  color: hexColor,
  currency: z.string().max(16),
  statementDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  creditLimit: nonNegNumber.optional(),
});

const budgetSchema = z.object({
  id: z.string().min(1).max(128),
  categoryId: z.string().min(1).max(128),
  amount: finiteNumber,
  currency: z.string().max(16).optional(),
  period: z.literal("monthly"),
});

const budgetItemSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().max(200),
  amount: finiteNumber,
  currency: z.string().max(16).optional(),
  categoryId: z.string().max(128).optional(),
  color: z.string().max(32).optional(),
});

const budgetPlanSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  items: z.array(budgetItemSchema).max(500),
  description: z.string().max(2000).optional(),
  color: z.string().max(32).optional(),
});

const forecastScenarioSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  months: z.number().int().min(1).max(60),
  monthlyIncomeAdjust: finiteNumber.optional(),
  monthlyExpenseAdjust: finiteNumber.optional(),
  currency: z.string().max(16).optional(),
  notes: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().max(32).optional(),
});

const goalSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  targetAmount: nonNegNumber,
  currentAmount: nonNegNumber,
  targetDate: isoDate.optional(),
  color: hexColor,
  notes: z.string().max(2000).optional(),
  currency: z.string().max(16).optional(),
});

const loanSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  principal: nonNegNumber,
  apr: finiteNumber,
  termMonths: z.number().int().min(1).max(1200),
  startDate: isoDate,
  extraMonthly: nonNegNumber.optional(),
  color: hexColor,
  notes: z.string().max(2000).optional(),
  currency: z.string().max(16).optional(),
});

const settingsSchema = z.object({
  useCorsProxy: z.boolean(),
  corsProxy: z.enum(ALLOWED_CORS_PROXIES),
  finnhubKey: z.string().max(256).optional(),
  privacyMode: z.boolean().optional(),
  displayCurrency: z.string().max(16).optional(),
});

const appStateSchema = z.object({
  holdings: z.array(holdingSchema).max(5000),
  cashflows: z.array(cashflowSchema).max(20000),
  transactions: z.array(transactionSchema).max(20000),
  categories: z.array(categorySchema).max(1000),
  creditCards: z.array(creditCardSchema).max(500).optional().default([]),
  budgets: z.array(budgetSchema).max(2000).optional().default([]),
  budgetPlans: z.array(budgetPlanSchema).max(500).optional().default([]),
  mainBudgetPlanId: z.string().max(128).optional(),
  forecastScenarios: z.array(forecastScenarioSchema).max(500).optional().default([]),
  mainForecastScenarioId: z.string().max(128).optional(),
  goals: z.array(goalSchema).max(500).optional().default([]),
  loans: z.array(loanSchema).max(500).optional().default([]),
  settings: settingsSchema,
});

const SUPPORTED_LANG_CODES = SUPPORTED_LANGUAGES.map((l) => l.code) as readonly string[];
const userPrefsSchema = z
  .object({
    language: z.string().max(32).optional(),
  })
  .partial();

const PREF_KEY_PREFIX = "ept_";
const PREF_KEY_DENY = new Set(["ept_state_v1"]);
const exportEnvelopeSchema = z.object({
  version: z.literal(1).optional(),
  exportedAt: z.string().max(64).optional(),
  state: appStateSchema,
  preferences: z.record(z.string().max(128), z.string().max(200_000)).optional(),
  userPreferences: userPrefsSchema.optional(),
});

function collectPreferences(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (typeof window === "undefined") return Promise.resolve(out);
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(PREF_KEY_PREFIX) || PREF_KEY_DENY.has(k)) continue;
      keys.push(k);
    }
  } catch {
    // Ignore: preferences are best-effort.
  }
  return Promise.all(keys.map(async (k) => [k, await secureGet(k)] as const)).then((entries) => {
    for (const [k, v] of entries) if (v != null) out[k] = v;
    return out;
  });
}

async function applyPreferences(prefs: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    const toDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREF_KEY_PREFIX) && !PREF_KEY_DENY.has(k)) toDelete.push(k);
    }
    for (const k of toDelete) window.localStorage.removeItem(k);
    for (const [k, v] of Object.entries(prefs)) {
      if (!k.startsWith(PREF_KEY_PREFIX) || PREF_KEY_DENY.has(k)) continue;
      await secureSet(k, v);
    }
  } catch {
    // Ignore: preferences are best-effort.
  }
}

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: i18n.t("settings.metaTitle") },
      { name: "description", content: i18n.t("settings.metaDesc") },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { state, updateSettings, importState, reset } = useStore();
  const { t } = useTranslation();
  const { language, setLanguage, languages } = useLanguage();
  const [finnhub, setFinnhub] = useState(state.settings.finnhubKey ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  async function buildExportJson() {
    const envelope = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      state: redactStateForExport(state),
      preferences: await collectPreferences(),
      userPreferences: { language },
      secretsNote: "API keys are not included in exports. Re-enter them in Settings after restore.",
    };
    return stringifyExportJson(envelope);
  }

  async function copyJsonToClipboard() {
    try {
      const json = await buildExportJson();
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard not available");
      await navigator.clipboard.writeText(json);
      toast.success(t("settings.data.copied", { defaultValue: "JSON copied to clipboard" }));
    } catch (e) {
      toast.error(
        `${t("settings.data.copyFailed", { defaultValue: "Copy failed" })}: ${(e as Error).message}`,
      );
    }
  }

  async function exportJson() {
    try {
      const filename = datedFilename("portfolio", "json");
      const json = await buildExportJson();
      const method = await saveExportFile(filename, { text: json });
      if (method === "cancelled") return;
      toast.success(t("settings.data.exported", { defaultValue: "Export completed" }), {
        description: exportMethodDescription(method, filename, t),
      });
    } catch (e) {
      toast.error(
        `${t("settings.data.exportFailed", { defaultValue: "Export failed" })}: ${(e as Error).message}`,
      );
    }
  }

  async function exportCsv() {
    try {
      const rows = [
        ["symbol", "name", "type", "quantity", "currentPrice", "marketValue", "color"],
        ...state.holdings.map((h) => [
          h.symbol,
          h.name,
          h.type,
          h.quantity,
          h.currentPrice,
          h.quantity * h.currentPrice,
          h.color,
        ]),
      ];
      const csv = rowsToCsv(rows);
      const filename = datedFilename("holdings", "csv");
      const method = await saveExportFile(filename, { text: csv });
      if (method === "cancelled") return;
      toast.success(t("settings.data.exported", { defaultValue: "Export completed" }), {
        description: exportMethodDescription(method, filename, t),
      });
    } catch (e) {
      toast.error(
        `${t("settings.data.exportFailed", { defaultValue: "Export failed" })}: ${(e as Error).message}`,
      );
    }
  }

  async function importFromText(txt: string) {
    try {
      const raw = JSON.parse(txt);
      const envelope = exportEnvelopeSchema.safeParse(raw);
      let parsedState: AppState;
      let prefs: Record<string, string> | undefined;
      let userPrefs: { language?: string } | undefined;
      if (envelope.success) {
        parsedState = envelope.data.state as AppState;
        prefs = envelope.data.preferences;
        userPrefs = envelope.data.userPreferences;
      } else {
        const legacy = appStateSchema.safeParse(raw);
        if (!legacy.success) {
          const first = envelope.error.issues[0] ?? legacy.error.issues[0];
          throw new Error(
            first ? `${first.path.join(".") || "root"}: ${first.message}` : "Invalid file format",
          );
        }
        parsedState = legacy.data as AppState;
      }
      importState(parsedState);
      if (prefs) await applyPreferences(prefs);
      if (userPrefs?.language && SUPPORTED_LANG_CODES.includes(userPrefs.language)) {
        setLanguage(userPrefs.language as LanguageCode);
      } else {
        const fromPrefs = prefs?.[LANG_STORAGE_KEY];
        if (fromPrefs && SUPPORTED_LANG_CODES.includes(fromPrefs)) {
          setLanguage(fromPrefs as LanguageCode);
        }
      }
      toast.success(t("settings.data.imported"));
      return true;
    } catch (e) {
      toast.error(`${t("settings.data.importFailed")}: ${(e as Error).message}`);
      return false;
    }
  }

  function handleImport(file: File) {
    file.text().then((txt) => importFromText(txt));
  }

  async function handleImportClick() {
    if (isTauri() && !isMobilePlatform()) {
      try {
        const txt = await invoke<string | null>("read_import_file");
        if (txt) await importFromText(txt);
      } catch (e) {
        toast.error(`${t("settings.data.importFailed")}: ${(e as Error).message}`);
      }
      return;
    }
    fileRef.current?.click();
  }

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <LocalFirstBadge
          label={t("settings.localFirst", { defaultValue: "On-device & encrypted" })}
        />
        <span className="text-xs text-muted-foreground">
          {t("settings.localFirstHint", {
            defaultValue: "Your portfolio never leaves this device.",
          })}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-border/60 rounded-2xl shadow-sm" data-tour="settings-api">
          <CardHeader>
            <CardTitle>{t("settings.api.title")}</CardTitle>
            <CardDescription>{t("settings.api.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="text-sm">{t("settings.api.displayCurrency")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                {t("settings.api.displayCurrencyHelp")}
              </p>
              <Select
                value={state.settings.displayCurrency || "USD"}
                onValueChange={(v) => updateSettings({ displayCurrency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-sm">{t("settings.api.privacyMode")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.api.privacyModeHelp")}
                </p>
              </div>
              <Switch
                checked={!!state.settings.privacyMode}
                onCheckedChange={(v) => updateSettings({ privacyMode: v })}
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-sm">{t("settings.api.useCorsProxy")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.api.useCorsProxyHelp")}
                </p>
              </div>
              <Switch
                checked={state.settings.useCorsProxy}
                onCheckedChange={(v) => updateSettings({ useCorsProxy: v })}
              />
            </div>

            <div>
              <Label className="text-sm">{t("settings.api.corsProxyUrl")}</Label>
              <Select
                value={state.settings.corsProxy}
                onValueChange={(v) => updateSettings({ corsProxy: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="https://corsproxy.io/?">corsproxy.io</SelectItem>
                  <SelectItem value="https://api.allorigins.win/raw?url=">
                    allorigins.win
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">{t("settings.api.finnhubKey")}</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  type="password"
                  value={finnhub}
                  onChange={(e) => setFinnhub(e.target.value)}
                  placeholder={t("settings.api.finnhubPlaceholder")}
                />
                <Button
                  onClick={() => {
                    updateSettings({ finnhubKey: finnhub.trim() || undefined });
                    toast.success(t("settings.api.saved"));
                  }}
                >
                  {t("common.save")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("settings.api.finnhubFootnote")}
              </p>
            </div>

            <div className="flex items-start justify-between gap-4 pt-2 border-t border-border/40">
              <div>
                <Label className="text-sm">
                  {t("settings.api.clearPriceCache", { defaultValue: "Refresh price history" })}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.api.clearPriceCacheHelp", {
                    defaultValue:
                      "Drop cached price data so the next chart load re-fetches from the providers.",
                  })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearPriceHistoryCache();
                  invalidatePortfolioPriceQueries(queryClient);
                  toast.success(
                    t("settings.api.priceCacheCleared", { defaultValue: "Price cache cleared" }),
                  );
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("common.refresh", { defaultValue: "Refresh" })}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-border/60" data-tour="settings-language">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Languages className="h-4 w-4" />
                {t("settings.language.title")}
              </CardTitle>
              <CardDescription>{t("settings.language.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Label className="text-sm">{t("settings.language.label")}</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as LanguageCode)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <AiSettingsCard />

          <Card className="border-border/60" data-tour="settings-data">
            <CardHeader>
              <CardTitle>{t("settings.data.title")}</CardTitle>
              <CardDescription>{t("settings.data.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start" onClick={exportJson}>
                <FileJson className="mr-2 h-4 w-4" /> {t("settings.data.exportJson")}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={copyJsonToClipboard}
              >
                <Copy className="mr-2 h-4 w-4" />{" "}
                {t("settings.data.copyJson", { defaultValue: "Copy JSON to clipboard" })}
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={exportCsv}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> {t("settings.data.exportCsv")}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => void handleImportClick()}
              >
                <Upload className="mr-2 h-4 w-4" /> {t("settings.data.importJson")}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setPasteValue("");
                  setPasteOpen(true);
                }}
              >
                <ClipboardPaste className="mr-2 h-4 w-4" />{" "}
                {t("settings.data.pasteJson", { defaultValue: "Paste JSON to import" })}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = "";
                }}
              />

              <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {t("settings.data.pasteJson", { defaultValue: "Paste JSON to import" })}
                    </DialogTitle>
                    <DialogDescription>
                      {t("settings.data.pasteJsonDesc", {
                        defaultValue:
                          "Paste a previously exported JSON below. This will replace your current data.",
                      })}
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    value={pasteValue}
                    onChange={(e) => setPasteValue(e.target.value)}
                    placeholder='{ "version": 1, "state": { ... } }'
                    className="font-mono text-xs min-h-[240px]"
                  />
                  <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const txt = await navigator.clipboard?.readText?.();
                          if (txt) setPasteValue(txt);
                        } catch {
                          toast.error(
                            t("settings.data.clipboardReadFailed", {
                              defaultValue: "Could not read clipboard",
                            }),
                          );
                        }
                      }}
                    >
                      <ClipboardPaste className="mr-2 h-4 w-4" />
                      {t("settings.data.pasteFromClipboard", {
                        defaultValue: "Paste from clipboard",
                      })}
                    </Button>
                    <Button variant="ghost" onClick={() => setPasteOpen(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      disabled={!pasteValue.trim()}
                      onClick={async () => {
                        const ok = await importFromText(pasteValue.trim());
                        if (ok) {
                          setPasteOpen(false);
                          setPasteValue("");
                        }
                      }}
                    >
                      {t("settings.data.importJson")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full justify-start">
                    <RotateCcw className="mr-2 h-4 w-4" /> {t("settings.data.reset")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("settings.data.resetTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("settings.data.resetDesc")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        reset();
                        toast.success(t("settings.data.cleared"));
                      }}
                    >
                      {t("settings.data.resetConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/60 mt-5">
        <CardHeader>
          <CardTitle>{t("tour.restartTitle", { defaultValue: "Onboarding tour" })}</CardTitle>
          <CardDescription>
            {t("tour.restartDesc", {
              defaultValue: "Replay the guided tour at any time to refresh your memory.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              import("@/lib/tour/driver").then(({ resetTourCompletion }) => {
                resetTourCompletion();
                window.dispatchEvent(new CustomEvent("tour:start"));
              });
            }}
          >
            {t("tour.restartButton", { defaultValue: "Start tour" })}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60 mt-5">
        <CardHeader>
          <CardTitle>{t("settings.about.title")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>{t("settings.about.body")}</p>
          <p>{t("settings.about.metalsHint")}</p>
        </CardContent>
      </Card>

      <Download className="hidden" />
    </>
  );
}

/** AI Assistant settings: model management + voice output, all on-device. */
function AiSettingsCard() {
  const { t } = useTranslation();
  const { state, updateSettings } = useStore();
  const s = state.settings;
  const native = isTauri();
  const [desktopNative, setDesktopNative] = useState(false);
  const [caps, setCaps] = useState<AiCapabilities>({
    llm: false,
    stt: false,
    tts: false,
  });
  const [downloadKind, setDownloadKind] = useState<ModelKind | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);

  useEffect(() => {
    void isNativeDesktop().then(setDesktopNative);
  }, []);

  useEffect(() => {
    let alive = true;
    getAiCapabilities(aiConfigFromSettings(s)).then((c) => {
      if (alive) setCaps(c);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.aiLlmModelPath, s.aiSttModelDir, s.aiTtsModelDir]);

  const pick = async (
    kind: "file" | "dir",
    key: "aiLlmModelPath" | "aiSttModelDir" | "aiTtsModelDir",
  ) => {
    try {
      const p = await invoke<string | null>("pick_model_path", { kind });
      if (p) updateSettings({ [key]: p });
    } catch {
      toast.error(t("settings.ai.pickError", { defaultValue: "Couldn't open the file picker." }));
    }
  };

  const runDownload = async (
    modelKind: ModelKind,
    key: "aiLlmModelPath" | "aiSttModelDir" | "aiTtsModelDir",
  ) => {
    setDownloadKind(modelKind);
    setDownloadProgress(null);
    try {
      const path = await downloadModel(modelKind, setDownloadProgress);
      updateSettings({ [key]: path, aiModelSetup: "done" });
      toast.success(t("settings.ai.downloadReady"));
      const nextCaps = await getAiCapabilities(aiConfigFromSettings({ ...s, [key]: path }));
      setCaps(nextCaps);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.ai.downloadFailed"));
    } finally {
      setDownloadKind(null);
      setDownloadProgress(null);
    }
  };

  const modelRow = (
    label: string,
    help: string,
    key: "aiLlmModelPath" | "aiSttModelDir" | "aiTtsModelDir",
    pickerKind: "file" | "dir",
    modelKind: ModelKind,
    ready: boolean,
  ) => {
    const value = s[key];
    const isDownloading = downloadKind === modelKind;
    const pct =
      isDownloading && downloadProgress?.total && downloadProgress.total > 0
        ? Math.min(100, Math.round((downloadProgress.received / downloadProgress.total) * 100))
        : undefined;

    return (
      <div className="rounded-lg border border-border/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {ready ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/50" />
            )}
            <Label className="text-sm">{label}</Label>
          </div>
          {native && (
            <div className="flex items-center gap-1">
              {desktopNative && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isDownloading || downloadKind !== null}
                  onClick={() => void runDownload(modelKind, key)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {t("settings.ai.download", { defaultValue: "Download" })}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={isDownloading}
                onClick={() => pick(pickerKind, key)}
              >
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.ai.browse", { defaultValue: "Browse" })}
              </Button>
              {value && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isDownloading}
                  onClick={() => updateSettings({ [key]: undefined })}
                  title={t("settings.ai.clearPath", { defaultValue: "Clear" })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{help}</p>
        {isDownloading && (
          <div className="mt-2 space-y-1">
            <Progress value={pct ?? (downloadProgress?.phase === "extracting" ? 100 : 10)} />
            <p className="text-[11px] text-muted-foreground">
              {downloadProgress
                ? formatDownloadProgress(downloadProgress)
                : t("settings.ai.downloadStarting")}
            </p>
          </div>
        )}
        {value ? (
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80" title={value}>
            {value}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <Card className="border-border/60" data-tour="settings-ai">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {t("settings.ai.title", { defaultValue: "AI Assistant" })}
        </CardTitle>
        <CardDescription>
          {t("settings.ai.description", {
            defaultValue:
              "Fully offline. Configure local models for the LLM and voice, or use the built-in assistant with no download.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t("settings.ai.enabled", { defaultValue: "Show AI assistant" })}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.ai.enabledHelp", {
                defaultValue: "Hide the assistant from the navigation menu to free up space.",
              })}
            </p>
          </div>
          <Switch
            checked={s.aiAssistantEnabled !== false}
            onCheckedChange={(v) => updateSettings({ aiAssistantEnabled: v })}
          />
        </div>

        {s.aiAssistantEnabled !== false ? (
          <>
            <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4">
              <div>
                <Label className="text-sm flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  {t("settings.ai.voiceOutput", { defaultValue: "Speak replies aloud" })}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.ai.voiceOutputHelp", {
                    defaultValue: "Read the assistant's answers using on-device text-to-speech.",
                  })}
                </p>
              </div>
              <Switch
                checked={s.aiTtsEnabled !== false}
                onCheckedChange={(v) => updateSettings({ aiTtsEnabled: v })}
              />
            </div>

            {native && !isMobilePlatform() ? (
              <div className="space-y-3">
                {modelRow(
                  t("settings.ai.llmModel", { defaultValue: "Language model (GGUF)" }),
                  t("settings.ai.llmModelHelp", {
                    defaultValue:
                      "e.g. Qwen2.5-1.5B-Instruct Q4_K_M. Without one, the built-in assistant is used.",
                  }),
                  "aiLlmModelPath",
                  "file",
                  "llm",
                  caps.llm,
                )}
                {modelRow(
                  t("settings.ai.sttModel", { defaultValue: "Speech-to-text model folder" }),
                  t("settings.ai.sttModelHelp", {
                    defaultValue:
                      "A Sherpa-ONNX STT model folder. Falls back to the browser recognizer.",
                  }),
                  "aiSttModelDir",
                  "dir",
                  "stt",
                  caps.stt,
                )}
                {modelRow(
                  t("settings.ai.ttsModel", { defaultValue: "Text-to-speech model folder" }),
                  t("settings.ai.ttsModelHelp", {
                    defaultValue:
                      "A Sherpa-ONNX VITS/Piper model folder. Falls back to the browser voice.",
                  }),
                  "aiTtsModelDir",
                  "dir",
                  "tts",
                  caps.tts,
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
                {native && isMobilePlatform()
                  ? t("settings.ai.mobileNote", {
                      defaultValue:
                        "On mobile, the assistant uses the built-in engine and your device's voice. Local LLM and Sherpa-ONNX model downloads are available on the desktop app.",
                    })
                  : t("settings.ai.webNote", {
                      defaultValue:
                        "You're on the web build. The assistant works offline with the built-in engine and your browser's voice. Install the desktop/mobile app to run local LLM and Sherpa-ONNX speech models.",
                    })}
              </p>
            )}

            <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-3">
              <div>
                <Label className="text-sm">
                  {t("settings.ai.clearHistory", { defaultValue: "Clear chat history" })}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.ai.clearHistoryHelp", {
                    defaultValue: "Delete the saved AI conversation from this device.",
                  })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void clearChatHistory();
                  toast.success(
                    t("settings.ai.historyCleared", { defaultValue: "Chat history cleared" }),
                  );
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("common.clear", { defaultValue: "Clear" })}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
