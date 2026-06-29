import { useEffect, useState } from "react";
import { CreditCard as CardIcon, Plus, Trash2, Pencil, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore, useMoney } from "@/lib/store";
import { CURRENCIES } from "@/lib/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { expandCashflows, cardDebtImpact } from "@/routes/cashflow";
import { formatMoney } from "@/lib/format";
import type { CreditCard } from "@/lib/types";

const DEFAULT_COLORS = ["#6366f1", "#ec4899", "#0ea5e9", "#f97316", "#22c55e", "#a855f7"];

type FormState = {
  name: string;
  color: string;
  currency: string;
  statementDay: string;
  dueDay: string;
  creditLimit: string;
};

function emptyForm(currency: string): FormState {
  return {
    name: "",
    color: DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
    currency,
    statementDay: "",
    dueDay: "",
    creditLimit: "",
  };
}

function fromCard(c: CreditCard): FormState {
  return {
    name: c.name,
    color: c.color,
    currency: c.currency,
    statementDay: c.statementDay ? String(c.statementDay) : "",
    dueDay: c.dueDay ? String(c.dueDay) : "",
    creditLimit: c.creditLimit != null ? String(c.creditLimit) : "",
  };
}

function toPatch(f: FormState): Partial<CreditCard> {
  return {
    name: f.name.trim(),
    color: f.color,
    currency: f.currency,
    statementDay: f.statementDay ? Math.max(1, Math.min(31, parseInt(f.statementDay))) : undefined,
    dueDay: f.dueDay ? Math.max(1, Math.min(31, parseInt(f.dueDay))) : undefined,
    creditLimit: f.creditLimit ? parseFloat(f.creditLimit) : undefined,
  };
}

export function CreditCardsManager() {
  const { state, addCreditCard, updateCreditCard, removeCreditCard, addCashflow } = useStore();
  const cards = state.creditCards ?? [];
  const { currency, toDisplay } = useMoney();

  const expanded = expandCashflows(state.cashflows, new Date());
  const debtByCard = new Map<string, number>();
  for (const e of expanded) {
    for (const c of cards) {
      const v = toDisplay(e.amount, e.currency);
      const d = cardDebtImpact(e, c.id, v);
      if (d !== 0) debtByCard.set(c.id, (debtByCard.get(c.id) ?? 0) + d);
    }
  }

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [paying, setPaying] = useState<CreditCard | null>(null);

  return (
    <div className="rounded-lg border border-border/60 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CardIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Credit cards</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add card
        </Button>
      </div>

      {cards.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No cards yet. Add a card to track debt from credit purchases and pay it down with transfers.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {cards.map((c) => {
            const debt = debtByCard.get(c.id) ?? 0;
            const limit = c.creditLimit ?? 0;
            const used = Math.max(0, debt);
            const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
            const available = limit > 0 ? Math.max(0, limit - used) : null;
            const overLimit = limit > 0 && used > limit;
            return (
              <li
                key={c.id}
                className="rounded-md border border-border/40 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.currency}
                        {c.statementDay ? ` · stmt day ${c.statementDay}` : ""}
                        {c.dueDay ? ` · due day ${c.dueDay}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => setPaying(c)}
                      title="Pay card from liquidity"
                    >
                      <ArrowRightLeft className="mr-1 h-3 w-3" /> Pay
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditing(c)}
                      aria-label="Edit card"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        if (!confirm(`Remove "${c.name}"?`)) return;
                        removeCreditCard(c.id);
                        toast.success("Card removed");
                      }}
                      aria-label="Delete card"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-muted-foreground">Balance owed</div>
                    <div className={`text-sm font-mono ${debt > 0 ? "text-destructive" : "text-emerald-500"}`}>
                      {formatMoney(debt, currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Limit</div>
                    <div className="text-sm font-mono">
                      {limit > 0 ? formatMoney(limit, c.currency) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Available</div>
                    <div className={`text-sm font-mono ${overLimit ? "text-destructive" : ""}`}>
                      {available != null ? formatMoney(available, c.currency) : "—"}
                    </div>
                  </div>
                </div>

                {limit > 0 && (
                  <div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: overLimit ? "var(--destructive)" : c.color,
                        }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                      {pct.toFixed(0)}% used{overLimit ? " · over limit" : ""}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add dialog */}
      <CardFormDialog
        open={addOpen}
        title="New credit card"
        initial={emptyForm(currency)}
        onClose={() => setAddOpen(false)}
        onSubmit={(f) => {
          if (!f.name.trim()) return toast.error("Name required");
          addCreditCard(toPatch(f) as Omit<CreditCard, "id">);
          toast.success("Card added");
          setAddOpen(false);
        }}
      />

      {/* Edit dialog */}
      <CardFormDialog
        open={!!editing}
        title="Edit credit card"
        initial={editing ? fromCard(editing) : emptyForm(currency)}
        onClose={() => setEditing(null)}
        onSubmit={(f) => {
          if (!editing) return;
          if (!f.name.trim()) return toast.error("Name required");
          updateCreditCard(editing.id, toPatch(f));
          toast.success("Card updated");
          setEditing(null);
        }}
      />

      {/* Pay dialog */}
      <PayCardDialog
        card={paying}
        currentDebt={paying ? debtByCard.get(paying.id) ?? 0 : 0}
        displayCurrency={currency}
        onClose={() => setPaying(null)}
        onPay={(amount, fromAccount) => {
          if (!paying) return;
          addCashflow({
            kind: "transfer",
            source: "",
            category: "Card payment",
            amount,
            currency: paying.currency,
            date: new Date().toISOString(),
            fromAccount: fromAccount as any,
            toAccount: `credit:${paying.id}` as any,
            description: `Payment to ${paying.name}`,
          });
          toast.success(`Recorded payment to ${paying.name}`);
          setPaying(null);
        }}
      />
    </div>
  );
}

function CardFormDialog({
  open,
  title,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: FormState;
  onClose: () => void;
  onSubmit: (f: FormState) => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  useEffect(() => {
    if (open) setF(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Track balance and available credit. Charges and payments come from your cashflow entries.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Amex Gold" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Currency</Label>
              <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Credit limit</Label>
              <Input
                type="number"
                value={f.creditLimit}
                onChange={(e) => setF({ ...f, creditLimit: e.target.value })}
                placeholder="5000"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Statement day</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={f.statementDay}
                onChange={(e) => setF({ ...f, statementDay: e.target.value })}
                placeholder="1"
              />
            </div>
            <div>
              <Label>Due day</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={f.dueDay}
                onChange={(e) => setF({ ...f, dueDay: e.target.value })}
                placeholder="15"
              />
            </div>
          </div>
          <div>
            <Label>Color</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setF({ ...f, color: c })}
                  className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background ${f.color === c ? "ring-foreground" : "ring-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(f)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayCardDialog({
  card,
  currentDebt,
  displayCurrency,
  onClose,
  onPay,
}: {
  card: CreditCard | null;
  currentDebt: number;
  displayCurrency: string;
  onClose: () => void;
  onPay: (amount: number, fromAccount: string) => void;
}) {
  const { state } = useStore();
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("liquidity");

  useEffect(() => {
    if (card) {
      setAmount(currentDebt > 0 ? currentDebt.toFixed(2) : "");
      setFrom("liquidity");
    }
  }, [card, currentDebt]);

  const accountOptions = [
    { value: "liquidity", label: "Liquidity (cash)" },
    ...state.holdings.map((h) => ({
      value: `holding:${h.id}`,
      label: `📈 ${h.symbol || h.name}`,
    })),
  ];

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pay {card?.name}</DialogTitle>
          <DialogDescription>
            Records a transfer that reduces this card's balance owed. Current debt:{" "}
            <span className={currentDebt > 0 ? "text-destructive" : "text-emerald-500"}>
              {formatMoney(currentDebt, displayCurrency)}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Pay from</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {accountOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount ({card?.currency})</Label>
            <Input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const a = parseFloat(amount);
              if (!isFinite(a) || a <= 0) {
                toast.error("Amount must be > 0");
                return;
              }
              onPay(a, from);
            }}
          >
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
