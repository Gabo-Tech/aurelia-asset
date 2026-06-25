import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
import { PageHeader } from "@/components/app-shell";
import { Download, Upload, RotateCcw, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import type { AppState } from "@/lib/types";
import { secureGet, secureSet } from "@/lib/secure-storage";
import { CURRENCIES } from "@/lib/currency";

const ALLOWED_CORS_PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
] as const;

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Invalid color");
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
});

const recurrenceSchema = z.object({
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  until: isoDate.optional(),
});

const cashflowSchema = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(["income", "expense"]),
  source: z.string().max(200),
  category: z.string().max(128),
  amount: finiteNumber,
  currency: z.string().max(16).optional(),
  date: isoDate,
  recurrence: recurrenceSchema.optional(),
  amountKind: z.enum(["fixed", "percent"]).optional(),
  percentOf: z.string().max(128).optional(),
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
  settings: settingsSchema,
});

/** Wrapper format for portfolio exports. Includes the validated app state plus
 *  any UI preferences kept in separate localStorage keys (e.g. Sankey colors). */
const PREF_KEY_PREFIX = "ept_";
const PREF_KEY_DENY = new Set(["ept_state_v1"]); // app state is exported separately
const exportEnvelopeSchema = z.object({
  version: z.literal(1).optional(),
  exportedAt: z.string().max(64).optional(),
  state: appStateSchema,
  preferences: z.record(z.string().max(128), z.string().max(200_000)).optional(),
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
  } catch {}
  return Promise.all(
    keys.map(async (k) => [k, await secureGet(k)] as const),
  ).then((entries) => {
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
  } catch {}
}


export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Elegant Portfolio Tracker" },
      { name: "description", content: "API options, import/export, and data management." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { state, updateSettings, importState, reset } = useStore();
  const [finnhub, setFinnhub] = useState(state.settings.finnhubKey ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportJson() {
    const envelope = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      state,
      preferences: await collectPreferences(),
    };
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
    download(blob, `portfolio-${new Date().toISOString().slice(0, 10)}.json`);
  }


  function exportCsv() {
    const rows = [
      ["symbol", "name", "type", "quantity", "currentPrice", "marketValue", "color"],
      ...state.holdings.map((h) => [
        h.symbol,
        h.name.replaceAll(",", " "),
        h.type,
        h.quantity,
        h.currentPrice,
        h.quantity * h.currentPrice,
        h.color,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    download(new Blob([csv], { type: "text/csv" }), `holdings-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function handleImport(file: File) {
    file.text().then((txt) => {
      try {
        const raw = JSON.parse(txt);
        // Accept both the new envelope format and legacy bare-AppState exports.
        const envelope = exportEnvelopeSchema.safeParse(raw);
        let parsedState: AppState;
        let prefs: Record<string, string> | undefined;
        if (envelope.success) {
          parsedState = envelope.data.state as AppState;
          prefs = envelope.data.preferences;
        } else {
          const legacy = appStateSchema.safeParse(raw);
          if (!legacy.success) {
            const first = (envelope.error.issues[0] ?? legacy.error.issues[0]);
            throw new Error(
              first ? `${first.path.join(".") || "root"}: ${first.message}` : "Invalid file format"
            );
          }
          parsedState = legacy.data as AppState;
        }
        importState(parsedState);
        if (prefs) await applyPreferences(prefs);

        toast.success("Data imported");
      } catch (e) {
        toast.error("Couldn't import: " + (e as Error).message);
      }
    });
  }

  return (
    <>
      <PageHeader title="Settings" description="API options and data management." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>API & reliability</CardTitle>
            <CardDescription>
              CoinGecko and Yahoo Finance work without keys. Finnhub is optional fallback.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="text-sm">Display currency</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                All values across the app are converted to this currency using live FX
                rates (cached for 6 hours).
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
                <Label className="text-sm">Privacy mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Hide quantities and dollar values across the app (the eye icon in the
                  header does the same thing).
                </p>
              </div>
              <Switch
                checked={!!state.settings.privacyMode}
                onCheckedChange={(v) => updateSettings({ privacyMode: v })}
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-sm">Use CORS proxy</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enable if Yahoo Finance requests are blocked in your browser.
                </p>
              </div>
              <Switch
                checked={state.settings.useCorsProxy}
                onCheckedChange={(v) => updateSettings({ useCorsProxy: v })}
              />
            </div>

            <div>
              <Label className="text-sm">CORS proxy URL</Label>
              <Select
                value={state.settings.corsProxy}
                onValueChange={(v) => updateSettings({ corsProxy: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="https://corsproxy.io/?">corsproxy.io</SelectItem>
                  <SelectItem value="https://api.allorigins.win/raw?url=">allorigins.win</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">Finnhub API key (optional)</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  type="password"
                  value={finnhub}
                  onChange={(e) => setFinnhub(e.target.value)}
                  placeholder="paste key from finnhub.io"
                />
                <Button
                  onClick={() => {
                    updateSettings({ finnhubKey: finnhub.trim() || undefined });
                    toast.success("Saved");
                  }}
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Free at{" "}
                <a className="underline" href="https://finnhub.io" target="_blank" rel="noreferrer">
                  finnhub.io
                </a>
                . Used as fallback for stocks when Yahoo fails.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Data</CardTitle>
            <CardDescription>
              All state lives in your browser localStorage. Back up or move it anytime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start" onClick={exportJson}>
              <FileJson className="mr-2 h-4 w-4" /> Export full state (JSON)
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={exportCsv}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Export holdings (CSV)
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" /> Import JSON
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

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full justify-start">
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset all data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete everything?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes all holdings, cashflow entries, and settings from this browser.
                    Export a backup first if you want to keep it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      reset();
                      toast.success("All data cleared");
                    }}
                  >
                    Yes, delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 mt-5">
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <span className="text-foreground font-medium">Elegant Portfolio Tracker</span> is a
            fully client-side app. Prices come from CoinGecko (crypto) and Yahoo Finance
            (stocks/ETFs/metals). No account, no backend.
          </p>
          <p>
            For metals use Yahoo symbols like{" "}
            <span className="font-mono text-foreground">GC=F</span> (gold) or{" "}
            <span className="font-mono text-foreground">SI=F</span> (silver).
          </p>
        </CardContent>
      </Card>

      <Download className="hidden" />
    </>
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
