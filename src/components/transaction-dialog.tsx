import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CURRENCIES } from "@/lib/currency";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import type { Holding, HoldingTransaction } from "@/lib/types";
import { format } from "date-fns";

type Props = {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing?: HoldingTransaction | null;
  defaultHoldingId?: string;
};

export function TransactionDialog({ open, onOpenChange, editing, defaultHoldingId }: Props) {
  const { state, addTransaction, updateTransaction } = useStore();
  const holdings = state.holdings;

  const [holdingId, setHoldingId] = useState<string>("");
  const [kind, setKind] = useState<"buy" | "sell">("buy");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [currency, setCurrency] = useState<string>(state.settings.displayCurrency || "USD");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setHoldingId(editing.holdingId);
      setKind(editing.kind);
      setDate(editing.date.slice(0, 10));
      setQuantity(String(editing.quantity));
      setPrice(String(editing.pricePerUnit));
      setFees(editing.fees != null ? String(editing.fees) : "");
      setCurrency(editing.currency || resolveDefaultCurrency(holdings, editing.holdingId, state.settings.displayCurrency));
      setNotes(editing.notes ?? "");
    } else {
      const hid = defaultHoldingId || holdings[0]?.id || "";
      setHoldingId(hid);
      setKind("buy");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setQuantity("");
      setPrice("");
      setFees("");
      setCurrency(resolveDefaultCurrency(holdings, hid, state.settings.displayCurrency));
      setNotes("");
    }
  }, [open, editing, defaultHoldingId, holdings, state.settings.displayCurrency]);

  // When holding changes (new tx), default the currency to the holding's price currency.
  useEffect(() => {
    if (editing) return;
    setCurrency(resolveDefaultCurrency(holdings, holdingId, state.settings.displayCurrency));
  }, [holdingId, editing, holdings, state.settings.displayCurrency]);

  function save() {
    if (!holdingId) return toast.error("Pick a holding");
    const qty = parseFloat(quantity);
    const px = parseFloat(price);
    if (!isFinite(qty) || qty <= 0) return toast.error("Quantity must be > 0");
    if (!isFinite(px) || px < 0) return toast.error("Price must be ≥ 0");
    const fee = fees.trim() ? parseFloat(fees) : undefined;
    const payload: Omit<HoldingTransaction, "id"> = {
      holdingId,
      kind,
      date: new Date(date).toISOString(),
      quantity: qty,
      pricePerUnit: px,
      currency,
      fees: fee != null && isFinite(fee) ? fee : undefined,
      notes: notes.trim() || undefined,
    };
    if (editing) {
      updateTransaction(editing.id, payload);
      toast.success("Transaction updated");
    } else {
      addTransaction(payload);
      toast.success(`${kind === "buy" ? "Buy" : "Sell"} added`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            Record a buy or sell. Quantity on the holding is recalculated from your transactions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Holding</Label>
            <Select value={holdingId} onValueChange={setHoldingId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a holding" /></SelectTrigger>
              <SelectContent>
                {holdings.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.symbol} · {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={kind} onValueChange={(v) => setKind(v as "buy" | "sell")}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="buy">Buy</TabsTrigger>
              <TabsTrigger value="sell">Sell</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0.00" className="mt-1.5" />
            </div>
            <div>
              <Label className="text-xs">Price / unit</Label>
              <Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Fees (optional)</Label>
            <Input type="number" step="any" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0.00" className="mt-1.5" />
          </div>

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-20" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function resolveDefaultCurrency(holdings: Holding[], holdingId: string, fallback?: string) {
  const h = holdings.find((x) => x.id === holdingId);
  return h?.priceCurrency || fallback || "USD";
}
