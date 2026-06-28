import { useState } from "react";
import { CreditCard as CardIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

const DEFAULT_COLORS = ["#6366f1", "#ec4899", "#0ea5e9", "#f97316", "#22c55e", "#a855f7"];

export function CreditCardsManager() {
  const { state, addCreditCard, updateCreditCard, removeCreditCard } = useStore();
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

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [creditCurrency, setCreditCurrency] = useState(currency);
  const [statementDay, setStatementDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [creditLimit, setCreditLimit] = useState("");

  function reset() {
    setName("");
    setColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]);
    setCreditCurrency(currency);
    setStatementDay("");
    setDueDay("");
    setCreditLimit("");
  }

  function submit() {
    if (!name.trim()) return toast.error("Name required");
    addCreditCard({
      name: name.trim(),
      color,
      currency: creditCurrency,
      statementDay: statementDay ? Math.max(1, Math.min(31, parseInt(statementDay))) : undefined,
      dueDay: dueDay ? Math.max(1, Math.min(31, parseInt(dueDay))) : undefined,
      creditLimit: creditLimit ? parseFloat(creditLimit) : undefined,
    });
    toast.success("Card added");
    reset();
    setOpen(false);
  }

  return (
    <div className="rounded-lg border border-border/60 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CardIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Credit cards</h3>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New credit card</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amex Gold" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Currency</Label>
                  <Select value={creditCurrency} onValueChange={setCreditCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Credit limit (optional)</Label>
                  <Input type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="5000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Statement day</Label>
                  <Input type="number" min={1} max={31} value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="1" />
                </div>
                <div>
                  <Label>Due day</Label>
                  <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="15" />
                </div>
              </div>
              <div>
                <Label>Color</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background ${color === c ? "ring-foreground" : "ring-transparent"}`}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit}>Add card</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {cards.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No cards yet. Add a card to track the debt you accumulate from credit-card purchases and pay it down via transfers.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {cards.map((c) => {
            const debt = debtByCard.get(c.id) ?? 0;
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/40 p-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.currency}
                      {c.statementDay ? ` · stmt ${c.statementDay}` : ""}
                      {c.dueDay ? ` · due ${c.dueDay}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className={`text-sm font-mono ${debt > 0 ? "text-destructive" : "text-emerald-500"}`}>
                      {formatMoney(debt, currency)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">balance owed</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      removeCreditCard(c.id);
                      toast.success("Card removed");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
