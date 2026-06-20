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
import type { AppState } from "@/lib/types";

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

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
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
        const parsed = JSON.parse(txt) as AppState;
        if (!parsed || !Array.isArray(parsed.holdings))
          throw new Error("Invalid file format");
        importState(parsed);
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
