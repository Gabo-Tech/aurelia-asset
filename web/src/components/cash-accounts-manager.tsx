import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/design/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore, useMoney } from "@/lib/store";
import {
  expandCashflows,
  valuesByEntry,
  cashAccountImpact,
  defaultCashAccountId,
} from "@/lib/cashflow-math";
import { formatMoney } from "@/lib/format";
import type { CashAccount } from "@/lib/types";
import { DEFAULT_CASH_ACCOUNT } from "@/lib/types";

const COLORS = ["#3e5871", "#3d6b4f", "#b7893a", "#8c2e22", "#6366f1", "#0ea5e9"];

export function CashAccountsManager() {
  const { t } = useTranslation();
  const { state, addCashAccount, updateCashAccount, removeCashAccount } = useStore();
  const { currency, toDisplay, privacy, MASK } = useMoney();
  const accounts = state.cashAccounts?.length ? state.cashAccounts : [DEFAULT_CASH_ACCOUNT];
  const defaultId = defaultCashAccountId(accounts);

  const balances = useMemo(() => {
    const expanded = expandCashflows(state.cashflows);
    const values = valuesByEntry(expanded, toDisplay);
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, 0);
    for (const e of expanded) {
      const v = values.get(e.id) ?? 0;
      for (const a of accounts) {
        map.set(a.id, (map.get(a.id) ?? 0) + cashAccountImpact(e, a.id, v, defaultId));
      }
    }
    return map;
  }, [accounts, state.cashflows, toDisplay, defaultId]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CashAccount | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const startAdd = () => {
    setEditing(null);
    setName("");
    setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    setOpen(true);
  };

  const startEdit = (a: CashAccount) => {
    setEditing(a);
    setName(a.name);
    setColor(a.color);
    setOpen(true);
  };

  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (editing) {
      updateCashAccount(editing.id, { name: n, color });
      toast.success(t("cashflow.accounts.updated", { defaultValue: "Account updated" }));
    } else {
      addCashAccount({ name: n, color, currency });
      toast.success(t("cashflow.accounts.added", { defaultValue: "Account added" }));
    }
    setOpen(false);
  };

  return (
    <div className="space-y-3" data-tour="cash-accounts">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          {t("cashflow.accounts.title", { defaultValue: "Cash accounts" })}
        </div>
        <Button size="sm" variant="outline" className="h-9 gap-1" onClick={startAdd}>
          <Plus className="h-4 w-4" />
          {t("cashflow.accounts.add", { defaultValue: "Add account" })}
        </Button>
      </div>
      <div className="space-y-2">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
          >
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: a.color }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {a.name}
                {a.isDefault || a.id === defaultId ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("cashflow.accounts.default", { defaultValue: "Default" })}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {privacy ? MASK : formatMoney(balances.get(a.id) ?? 0, currency)}
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() => startEdit(a)}
              aria-label={t("common.edit", { defaultValue: "Edit" })}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              disabled={accounts.length <= 1 || a.isDefault}
              onClick={() => {
                if (!confirm(t("cashflow.accounts.deleteConfirm", { defaultValue: "Delete this account?" })))
                  return;
                removeCashAccount(a.id);
              }}
              aria-label={t("common.delete", { defaultValue: "Delete" })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={
          editing
            ? t("cashflow.accounts.editTitle", { defaultValue: "Edit account" })
            : t("cashflow.accounts.addTitle", { defaultValue: "New cash account" })
        }
        footer={
          <Button onClick={save}>{t("common.save", { defaultValue: "Save" })}</Button>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>{t("cashflow.accounts.name", { defaultValue: "Name" })}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("cashflow.accounts.namePlaceholder", {
                defaultValue: "Checking, Savings…",
              })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>{t("cashflow.accounts.color", { defaultValue: "Color" })}</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-8 w-8 rounded-full ring-offset-background ${
                    color === c ? "ring-2 ring-primary ring-offset-2" : ""
                  }`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          {editing && !editing.isDefault ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                updateCashAccount(editing.id, { isDefault: true });
                toast.success(
                  t("cashflow.accounts.setDefault", { defaultValue: "Set as default cash account" }),
                );
                setOpen(false);
              }}
            >
              {t("cashflow.accounts.makeDefault", { defaultValue: "Make default" })}
            </Button>
          ) : null}
        </div>
      </ResponsiveDialog>
    </div>
  );
}
