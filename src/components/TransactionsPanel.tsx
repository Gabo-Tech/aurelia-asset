import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Card, PrimaryButton, SecondaryButton, SectionHeader, Metric, chipLabelStyle, chipContainerStyle } from "@/components/ui";
import { useStore, useMoney } from "@/lib/store";
import type { HoldingTransaction } from "@/lib/types";
import { colors, spacing } from "@/theme/colors";

type KindFilter = "all" | "buy" | "sell";

export function TransactionsPanel() {
  const { t } = useTranslation();
  const { state, addTransaction, updateTransaction, removeTransaction } = useStore();
  const { mask, currency } = useMoney();
  const [open, setOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [holdingFilter, setHoldingFilter] = useState<string>("all");
  const [editing, setEditing] = useState<HoldingTransaction | null>(null);
  const [formHolding, setFormHolding] = useState<string>("");
  const [formKind, setFormKind] = useState<"buy" | "sell">("buy");
  const [formQty, setFormQty] = useState("1");
  const [formPrice, setFormPrice] = useState("");
  const [formFees, setFormFees] = useState("");

  const rows = useMemo(() => {
    let list = [...(state.transactions ?? [])];
    if (kindFilter !== "all") list = list.filter((tx) => tx.kind === kindFilter);
    if (holdingFilter !== "all") list = list.filter((tx) => tx.holdingId === holdingFilter);
    list.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    return list;
  }, [state.transactions, kindFilter, holdingFilter]);

  const totals = useMemo(() => {
    let buy = 0;
    let sell = 0;
    for (const tx of rows) {
      const h = state.holdings.find((x) => x.id === tx.holdingId);
      const ccy = tx.currency || h?.priceCurrency || currency;
      const cost = tx.quantity * tx.pricePerUnit + (tx.fees ?? 0);
      // useMoney mask converts; for totals we approximate in display via quantity*price
      // Prefer storing as-is and formatting per row; sum in display currency via toDisplay would be better.
      void ccy;
      if (tx.kind === "buy") buy += cost;
      else sell += cost;
    }
    return { buy, sell, net: sell - buy };
  }, [rows, state.holdings, currency]);

  function openAdd() {
    const first = state.holdings[0];
    setEditing(null);
    setFormHolding(first?.id ?? "");
    setFormKind("buy");
    setFormQty("1");
    setFormPrice(first ? String(first.currentPrice || "") : "");
    setFormFees("");
  }

  function openEdit(tx: HoldingTransaction) {
    setEditing(tx);
    setFormHolding(tx.holdingId);
    setFormKind(tx.kind);
    setFormQty(String(tx.quantity));
    setFormPrice(String(tx.pricePerUnit));
    setFormFees(tx.fees != null ? String(tx.fees) : "");
  }

  function save() {
    const q = Number(formQty);
    const p = Number(formPrice);
    const fees = formFees.trim() ? Number(formFees) : undefined;
    if (!formHolding || !isFinite(q) || q <= 0 || !isFinite(p) || p < 0) {
      Alert.alert("Invalid", "Enter holding, quantity, and price");
      return;
    }
    if (fees != null && (!isFinite(fees) || fees < 0)) {
      Alert.alert("Invalid", "Fees must be ≥ 0");
      return;
    }
    const h = state.holdings.find((x) => x.id === formHolding);
    const payload = {
      holdingId: formHolding,
      kind: formKind,
      date: editing?.date ?? new Date().toISOString(),
      quantity: q,
      pricePerUnit: p,
      fees,
      currency: h?.priceCurrency || currency,
    };
    if (editing) {
      updateTransaction(editing.id, payload);
    } else {
      addTransaction(payload);
    }
    setEditing(null);
    setFormHolding("");
  }

  if (!open) {
    return (
      <SectionHeader
        title={t("holdings.transactions", { defaultValue: "Transactions" })}
        actionLabel={`View (${state.transactions?.length ?? 0})`}
        onAction={() => {
          setOpen(true);
          openAdd();
        }}
      />
    );
  }

  return (
    <Card>
      <SectionHeader
        title={t("holdings.transactions", { defaultValue: "Transactions" })}
        actionLabel="Done"
        onAction={() => {
          setOpen(false);
          setEditing(null);
        }}
      />
      <Metric label="Buys (raw)" value={mask(totals.buy)} />
      <Metric label="Sells (raw)" value={mask(totals.sell)} />

      <View style={styles.row}>
        {(["all", "buy", "sell"] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setKindFilter(k)}
            style={[styles.chip, kindFilter === k && styles.chipOn]}
          >
            <Text style={styles.chipText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={() => setHoldingFilter("all")}
          style={[styles.chip, holdingFilter === "all" && styles.chipOn]}
        >
          <Text style={styles.chipText}>All holdings</Text>
        </Pressable>
        {state.holdings.map((h) => (
          <Pressable
            key={h.id}
            onPress={() => setHoldingFilter(h.id)}
            style={[styles.chip, holdingFilter === h.id && styles.chipOn]}
          >
            <Text style={styles.chipText}>{h.symbol}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sub}>{editing ? "Edit transaction" : "Add transaction"}</Text>
      <View style={styles.row}>
        {state.holdings.map((h) => (
          <Pressable
            key={h.id}
            onPress={() => {
              setFormHolding(h.id);
              if (!formPrice) setFormPrice(String(h.currentPrice || ""));
            }}
            style={[styles.chip, formHolding === h.id && styles.chipOn]}
          >
            <Text style={styles.chipText}>{h.symbol}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        {(["buy", "sell"] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setFormKind(k)}
            style={[styles.chip, formKind === k && styles.chipOn]}
          >
            <Text style={styles.chipText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={formQty}
        onChangeText={setFormQty}
        placeholder="Quantity"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
      />
      <TextInput
        style={styles.input}
        value={formPrice}
        onChangeText={setFormPrice}
        placeholder="Price per unit"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
      />
      <TextInput
        style={styles.input}
        value={formFees}
        onChangeText={setFormFees}
        placeholder="Fees (optional)"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
      />
      <PrimaryButton label={editing ? "Save changes" : "Add transaction"} onPress={save} />
      {editing ? (
        <>
          <View style={{ height: 8 }} />
          <SecondaryButton label="Cancel edit" onPress={() => setEditing(null)} />
        </>
      ) : null}

      <Text style={[styles.sub, { marginTop: spacing.md }]}>
        Ledger ({rows.length})
      </Text>
      {rows.length === 0 ? (
        <Text style={styles.meta}>
          {state.transactions?.length
            ? t("more.tpEmptyFiltered", {
                defaultValue: "No transactions match this filter.",
              })
            : t("more.tpEmpty", {
                defaultValue: "No transactions yet. Add a buy or sell to start tracking.",
              })}
        </Text>
      ) : (
        rows.map((tx) => {
          const h = state.holdings.find((x) => x.id === tx.holdingId);
          return (
            <View key={tx.id} style={styles.txRow}>
              <Text style={styles.txTitle}>
                {tx.kind.toUpperCase()} {h?.symbol ?? "?"} · {tx.quantity} @{" "}
                {mask(tx.pricePerUnit, tx.currency)}
              </Text>
              <Text style={styles.meta}>
                {tx.date.slice(0, 10)}
                {tx.fees ? ` · fees ${mask(tx.fees, tx.currency)}` : ""}
              </Text>
              <View style={styles.row}>
                <SecondaryButton label="Edit" onPress={() => openEdit(tx)} />
                <View style={{ width: 8 }} />
                <SecondaryButton
                  label="Delete"
                  destructive
                  onPress={() =>
                    Alert.alert("Delete transaction?", undefined, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => removeTransaction(tx.id),
                      },
                    ])
                  }
                />
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  chip: {
    ...chipContainerStyle,
    paddingHorizontal: 10,
    minHeight: 28,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { ...chipLabelStyle, fontSize: 11, lineHeight: 14, textTransform: "capitalize" },
  sub: { color: colors.text, fontWeight: "600", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    marginBottom: 8,
    backgroundColor: colors.surfaceAlt,
  },
  meta: { color: colors.muted, fontSize: 12 },
  txRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 8,
  },
  txTitle: { color: colors.text, fontWeight: "600", fontSize: 13 },
});
