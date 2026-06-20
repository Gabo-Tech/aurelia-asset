import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { PALETTE, type Holding, type SearchResult } from "@/lib/types";
import { searchAssets, fetchCurrentPrice } from "@/lib/finance";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useStore } from "@/lib/store";

type Props = {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing?: Holding | null;
};

export function HoldingDialog({ open, onOpenChange, editing }: Props) {
  const { addHolding, updateHolding } = useStore();
  const [mode, setMode] = useState<"crypto" | "stock">("stock");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [quantity, setQuantity] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [manualPrice, setManualPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && editing) {
      setSelected({
        symbol: editing.symbol,
        name: editing.name,
        type: editing.type,
        coinGeckoId: editing.coinGeckoId,
      });
      setQuery(editing.symbol);
      setMode(editing.type === "crypto" ? "crypto" : "stock");
      setQuantity(String(editing.quantity));
      setColor(editing.color);
      setManualPrice(editing.manualPrice != null ? String(editing.manualPrice) : "");
    } else if (open) {
      setSelected(null);
      setQuery("");
      setResults([]);
      setQuantity("");
      setColor(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
      setManualPrice("");
    }
  }, [open, editing]);

  useEffect(() => {
    if (!open || editing) return;
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
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, mode, open, editing]);

  async function handleSave() {
    if (!selected) {
      toast.error("Pick an asset first");
      return;
    }
    const qty = parseFloat(quantity);
    if (!isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be > 0");
      return;
    }
    const manual = manualPrice.trim() ? parseFloat(manualPrice) : undefined;
    setSaving(true);
    try {
      const base: Omit<Holding, "id"> = {
        symbol: selected.symbol,
        name: selected.name,
        type: selected.type,
        coinGeckoId: selected.coinGeckoId,
        quantity: qty,
        color,
        manualPrice: manual,
        currentPrice: manual ?? 0,
        lastPriceAt: Date.now(),
      };
      if (manual == null) {
        try {
          const price = await fetchCurrentPrice({ ...base, id: "tmp" } as Holding);
          base.currentPrice = price;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit holding" : "Add holding"}</DialogTitle>
          <DialogDescription>
            Search a ticker or coin, set quantity, pick a color.
          </DialogDescription>
        </DialogHeader>

        {!editing && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "crypto" | "stock")}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="stock">Stocks / ETFs / Metals</TabsTrigger>
              <TabsTrigger value="crypto">Crypto</TabsTrigger>
            </TabsList>
            <TabsContent value={mode} className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={
                    mode === "crypto"
                      ? "bitcoin, eth, sol…"
                      : "AAPL, VOO, GC=F (gold), SI=F (silver)…"
                  }
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
                      onClick={() => {
                        setSelected(r);
                        setQuery(`${r.symbol} · ${r.name}`);
                        setResults([]);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent/50 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.symbol}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.name}
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        {selected && (
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
            <Label htmlFor="manual">Manual price (optional)</Label>
            <Input
              id="manual"
              type="number"
              step="any"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder="Override live price"
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
                  color === c ? "ring-foreground" : "ring-transparent"
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
