import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PALETTE, type CustomPricePoint, type Holding, type SearchResult } from "@/lib/types";
import { CURRENCIES } from "@/lib/currency";
import { searchAssets, fetchCurrentQuote } from "@/lib/finance";
import { Loader2, Search, Upload, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useStore } from "@/lib/store";

type Props = {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing?: Holding | null;
};

type Mode = "stock" | "crypto" | "custom";

/** Parse "YYYY-MM-DD,price" lines (also accepts ; or tab separators, ISO dates). */
function parseCsvHistory(text: string): CustomPricePoint[] {
  const out: CustomPricePoint[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^(date|day|time)/i.test(line)) continue;
    const parts = line.split(/[,;\t]/).map((x) => x.trim());
    if (parts.length < 2) continue;
    const t = Date.parse(parts[0]);
    const p = parseFloat(parts[1].replace(/[^0-9.\-]/g, ""));
    if (!isFinite(t) || !isFinite(p)) continue;
    out.push({ t, p });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export function HoldingDialog({ open, onOpenChange, editing }: Props) {
  const { addHolding, updateHolding, state } = useStore();
  const defaultCurrency = state.settings.displayCurrency || "USD";
  const [mode, setMode] = useState<Mode>("stock");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [quantity, setQuantity] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [manualPrice, setManualPrice] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [saving, setSaving] = useState(false);

  // Custom holding fields
  const [customSymbol, setCustomSymbol] = useState("");
  const [customName, setCustomName] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [historyText, setHistoryText] = useState("");
  const [history, setHistory] = useState<CustomPricePoint[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSelected({
        symbol: editing.symbol,
        name: editing.name,
        type: editing.type,
        coinGeckoId: editing.coinGeckoId,
      });
      setQuery(editing.symbol);
      setMode(
        editing.type === "crypto"
          ? "crypto"
          : editing.type === "other"
            ? "custom"
            : "stock",
      );
      setQuantity(String(editing.quantity));
      setColor(editing.color);
      setManualPrice(editing.manualPrice != null ? String(editing.manualPrice) : "");
      setCurrency(editing.priceCurrency || defaultCurrency);
      setCustomSymbol(editing.symbol);
      setCustomName(editing.name);
      setCustomNotes(editing.notes ?? "");
      setHistory(editing.customHistory ?? []);
      setHistoryText(
        (editing.customHistory ?? [])
          .map((x) => `${new Date(x.t).toISOString().slice(0, 10)},${x.p}`)
          .join("\n"),
      );
    } else {
      setSelected(null);
      setQuery("");
      setResults([]);
      setQuantity("");
      setColor(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
      setManualPrice("");
      setCurrency(defaultCurrency);
      setCustomSymbol("");
      setCustomName("");
      setCustomNotes("");
      setHistoryText("");
      setHistory([]);
    }
  }, [open, editing, defaultCurrency]);

  useEffect(() => {
    if (!open || editing || mode === "custom") return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchAssets(q, mode);
        setResults(r);
        if (mode === "stock" && r.length === 0) {
          // Not catastrophic; silent.
        }
      } catch (e) {
        setResults([]);
        toast.error("Search failed — try a different proxy in Settings");
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, mode, open, editing]);

  // Re-parse history textarea on change
  useEffect(() => {
    if (mode !== "custom") return;
    setHistory(parseCsvHistory(historyText));
  }, [historyText, mode]);

  async function handleSave() {
    const qty = parseFloat(quantity);
    if (!isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be > 0");
      return;
    }
    setSaving(true);
    try {
      if (mode === "custom") {
        const sym = customSymbol.trim() || customName.trim().slice(0, 8).toUpperCase();
        const name = customName.trim() || sym;
        if (!sym || !name) {
          toast.error("Name is required");
          setSaving(false);
          return;
        }
        const manual = manualPrice.trim() ? parseFloat(manualPrice) : undefined;
        const lastHist = history.length ? history[history.length - 1].p : undefined;
        const price = manual ?? lastHist ?? 0;
        const base: Omit<Holding, "id"> = {
          symbol: sym.toUpperCase(),
          name,
          type: "other",
          quantity: qty,
          color,
          manualPrice: manual,
          currentPrice: price,
          priceCurrency: currency,
          customHistory: history,
          notes: customNotes.trim() || undefined,
          lastPriceAt: Date.now(),
        };
        if (editing) {
          updateHolding(editing.id, base);
          toast.success("Custom holding updated");
        } else {
          addHolding(base);
          toast.success("Custom holding added");
        }
        onOpenChange(false);
        return;
      }

      if (!selected) {
        toast.error("Pick an asset first");
        setSaving(false);
        return;
      }
      const manual = manualPrice.trim() ? parseFloat(manualPrice) : undefined;
      const base: Omit<Holding, "id"> = {
        symbol: selected.symbol,
        name: selected.name,
        type: selected.type,
        coinGeckoId: selected.coinGeckoId,
        quantity: qty,
        color,
        manualPrice: manual,
        currentPrice: manual ?? 0,
        priceCurrency: selected.type === "crypto" ? "USD" : currency,
        lastPriceAt: Date.now(),
      };
      if (manual == null) {
        try {
          const q = await fetchCurrentQuote({ ...base, id: "tmp" } as Holding);
          base.currentPrice = q.price;
          if (q.currency) base.priceCurrency = q.currency;
        } catch {
          toast.warning("Couldn't fetch price — you can refresh later");
        }
      }
      if (editing) {
        updateHolding(editing.id, base);
        toast.success("Holding updated");
      } else {
        addHolding(base);
        toast.success("Holding added");
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCsvUpload(file: File) {
    file.text().then((txt) => {
      setHistoryText(txt);
      toast.success(`Loaded ${parseCsvHistory(txt).length} price points`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit holding" : "Add holding"}</DialogTitle>
          <DialogDescription>
            Search a market asset, or add a custom holding (e.g. Quanloop, private equity).
          </DialogDescription>
        </DialogHeader>

        {!editing && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="stock">Stocks / ETF</TabsTrigger>
              <TabsTrigger value="crypto">Crypto</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="mt-4">
              <SearchBox
                mode="stock"
                query={query}
                setQuery={setQuery}
                searching={searching}
                results={results}
                onPick={(r) => {
                  setSelected(r);
                  setQuery(`${r.symbol} · ${r.name}`);
                  setResults([]);
                }}
                placeholder="AAPL, VOO, GC=F (gold), SI=F (silver)…"
              />
            </TabsContent>
            <TabsContent value="crypto" className="mt-4">
              <SearchBox
                mode="crypto"
                query={query}
                setQuery={setQuery}
                searching={searching}
                results={results}
                onPick={(r) => {
                  setSelected(r);
                  setQuery(`${r.symbol} · ${r.name}`);
                  setResults([]);
                }}
                placeholder="bitcoin, eth, sol…"
              />
            </TabsContent>

            <TabsContent value="custom" className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="csym">Symbol / Ticker</Label>
                  <Input
                    id="csym"
                    value={customSymbol}
                    onChange={(e) => setCustomSymbol(e.target.value)}
                    placeholder="QNL"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="cname">Name</Label>
                  <Input
                    id="cname"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Quanloop"
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="cnotes">Notes (optional)</Label>
                <Input
                  id="cnotes"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Crowd-lending platform, monthly statements"
                  className="mt-1.5"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="chist">Price history (optional)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Import CSV
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt,text/csv"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCsvUpload(f);
                      e.target.value = "";
                    }}
                  />
                </div>
                <Textarea
                  id="chist"
                  value={historyText}
                  onChange={(e) => setHistoryText(e.target.value)}
                  placeholder={"date,price\n2024-01-15,1000\n2024-02-15,1012.5\n2024-03-15,1025.3"}
                  className="mt-1.5 font-mono text-xs h-32"
                />
                <p className="mt-1.5 text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    {history.length > 0 ? (
                      <>
                        Parsed <span className="text-foreground font-medium">{history.length}</span>{" "}
                        points · latest{" "}
                        <span className="text-foreground font-mono">
                          ${history[history.length - 1].p}
                        </span>
                      </>
                    ) : (
                      "One row per snapshot: date,price. Latest entry becomes current price."
                    )}
                  </span>
                </p>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {selected && mode !== "custom" && (
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Selected: </span>
            <span className="font-medium">{selected.symbol}</span> · {selected.name}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="qty">Quantity</Label>
            <Input
              id="qty"
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.00"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="manual">
              {mode === "custom" ? "Current price" : "Manual price (optional)"}
            </Label>
            <Input
              id="manual"
              type="number"
              step="any"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder={mode === "custom" ? "Latest known unit price" : "Override live price"}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label>Color</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition",
                  color === c ? "ring-foreground" : "ring-transparent",
                )}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded bg-transparent border border-border"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Add holding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SearchBox({
  mode,
  query,
  setQuery,
  searching,
  results,
  onPick,
  placeholder,
}: {
  mode: "stock" | "crypto";
  query: string;
  setQuery: (s: string) => void;
  searching: boolean;
  results: SearchResult[];
  onPick: (r: SearchResult) => void;
  placeholder: string;
}) {
  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {results.length > 0 && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
          {results.map((r) => (
            <button
              key={`${r.symbol}-${r.coinGeckoId ?? ""}`}
              onClick={() => onPick(r)}
              className="w-full text-left px-3 py-2 hover:bg-accent/50 flex items-center justify-between"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{r.symbol}</div>
                <div className="text-xs text-muted-foreground truncate">{r.name}</div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {r.type}
              </span>
            </button>
          ))}
        </div>
      )}
      {!searching && query.trim() && results.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          No results. If this keeps happening, enable a different CORS proxy in Settings, or use
          the <span className="text-foreground font-medium">Custom</span> tab.
        </p>
      )}
      <input type="hidden" data-mode={mode} />
    </>
  );
}
