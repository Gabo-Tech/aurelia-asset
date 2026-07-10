import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
    if (!holdingId) return toast.error(t("holdings.txDialog.pickHoldingError"));
    const qty = parseFloat(quantity);
    const px = parseFloat(price);
    if (!isFinite(qty) || qty <= 0) return toast.error(t("holdings.txDialog.qtyGtZero"));
    if (!isFinite(px) || px < 0) return toast.error(t("holdings.txDialog.priceGteZero"));
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
      toast.success(t("holdings.txDialog.updated"));
    } else {
      addTransaction(payload);
      toast.success(
        kind === "buy" ? t("holdings.txDialog.buyAdded") : t("holdings.txDialog.sellAdded"),
      );
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? t("holdings.txDialog.editTitle") : t("holdings.txDialog.addTitle")}
          </DialogTitle>
          <DialogDescription>{t("holdings.txDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t("holdings.txDialog.holding")}</Label>
            <Select value={holdingId} onValueChange={setHoldingId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder={t("holdings.txDialog.pickHolding")} />
              </SelectTrigger>
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
              <TabsTrigger value="buy">{t("holdings.buy")}</TabsTrigger>
              <TabsTrigger value="sell">{t("holdings.sell")}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("holdings.txDialog.date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-xs">{t("common.currency")}</Label>
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
              <Label className="text-xs">{t("holdings.quantity")}</Label>
              <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0.00" className="mt-1.5" />
            </div>
            <div>
              <Label className="text-xs">{t("holdings.txDialog.pricePerUnit")}</Label>
              <Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="mt-1.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("holdings.totalValue")}</Label>
              <Input
                type="number"
                step="any"
                value={(() => {
                  const q = parseFloat(quantity);
                  const p = parseFloat(price);
                  if (isFinite(q) && isFinite(p)) {
                    const t = q * p;
                    return t ? String(Number(t.toFixed(8))) : "";
                  }
                  return "";
                })()}
                onChange={(e) => {
                  const total = parseFloat(e.target.value);
                  const q = parseFloat(quantity);
                  if (isFinite(total) && isFinite(q) && q > 0) {
                    setPrice(String(total / q));
                  }
                }}
                placeholder={t("holdings.txDialog.totalValueAuto")}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-xs">{t("holdings.txDialog.feesOptional")}</Label>
              <Input type="number" step="any" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0.00" className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label className="text-xs">{t("holdings.txDialog.notesOptional")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-20" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save}>
            {editing ? t("common.save") : t("holdings.txDialog.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function resolveDefaultCurrency(holdings: Holding[], holdingId: string, fallback?: string) {
  const h = holdings.find((x) => x.id === holdingId);
  return h?.priceCurrency || fallback || "USD";
}
