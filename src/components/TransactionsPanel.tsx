import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Card, CardHelperText, CardActions, PrimaryButton, SecondaryButton, SectionHeader, Metric, chipLabelStyle, chipContainerStyle } from "@/components/ui";
import { useStore, useMoney } from "@/lib/store";
import type { HoldingTransaction } from "@/lib/types";
import { rhythm, spacing } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";

type KindFilter = "all" | "buy" | "sell";

export function TransactionsPanel() {
  const { t } = useTranslation();
  const colors = useColors();
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

  const chipBase = (on: boolean) => [
    styles.chip,
    {
      backgroundColor: on ? colors.accentSoft : colors.surfaceAlt,
      borderColor: on ? colors.accent : colors.border,
    },
  ];
  const inputStyle = [
    styles.input,
    {
      borderColor: colors.border,
      color: colors.text,
      backgroundColor: colors.surfaceAlt,
    },
  ];

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
            style={chipBase(kindFilter === k)}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={() => setHoldingFilter("all")}
          style={chipBase(holdingFilter === "all")}
        >
          <Text style={[styles.chipText, { color: colors.text }]}>All holdings</Text>
        </Pressable>
        {state.holdings.map((h) => (
          <Pressable
            key={h.id}
            onPress={() => setHoldingFilter(h.id)}
            style={chipBase(holdingFilter === h.id)}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{h.symbol}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sub, { color: colors.text }]}>
        {editing ? "Edit transaction" : "Add transaction"}
      </Text>
      <View style={styles.row}>
        {state.holdings.map((h) => (
          <Pressable
            key={h.id}
            onPress={() => {
              setFormHolding(h.id);
              if (!formPrice) setFormPrice(String(h.currentPrice || ""));
            }}
            style={chipBase(formHolding === h.id)}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{h.symbol}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        {(["buy", "sell"] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setFormKind(k)}
            style={chipBase(formKind === k)}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={inputStyle}
        value={formQty}
        onChangeText={setFormQty}
        placeholder="Quantity"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
      />
      <TextInput
        style={inputStyle}
        value={formPrice}
        onChangeText={setFormPrice}
        placeholder="Price per unit"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
      />
      <TextInput
        style={inputStyle}
        value={formFees}
        onChangeText={setFormFees}
        placeholder="Fees (optional)"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
      />
      <CardActions>
      <PrimaryButton
        fullWidth
        label={editing ? "Save changes" : "Add transaction"}
        onPress={save}
      />
      {editing ? (
        <SecondaryButton fullWidth label="Cancel edit" onPress={() => setEditing(null)} />
      ) : null}
      </CardActions>

      <Text style={[styles.sub, { color: colors.text }]}>
        Ledger ({rows.length})
      </Text>
      {rows.length === 0 ? (
        <CardHelperText>
          {state.transactions?.length
            ? t("more.tpEmptyFiltered", {
                defaultValue: "No transactions match this filter.",
              })
            : t("more.tpEmpty", {
                defaultValue: "No transactions yet. Add a buy or sell to start tracking.",
              })}
        </CardHelperText>
      ) : (
        rows.map((tx) => {
          const h = state.holdings.find((x) => x.id === tx.holdingId);
          return (
            <View key={tx.id} style={[styles.txRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.txTitle, { color: colors.text }]}>
                {tx.kind.toUpperCase()} {h?.symbol ?? "?"} · {tx.quantity} @{" "}
                {mask(tx.pricePerUnit, tx.currency)}
              </Text>
              <CardHelperText>
                {tx.date.slice(0, 10)}
                {tx.fees ? ` · fees ${mask(tx.fees, tx.currency)}` : ""}
              </CardHelperText>
              <View style={styles.row}>
                <SecondaryButton label="Edit" onPress={() => openEdit(tx)} />
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    ...chipContainerStyle,
    paddingHorizontal: 10,
    minHeight: 28,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
  },
  chipText: { ...chipLabelStyle, fontSize: 11, lineHeight: 14, textTransform: "capitalize" },
  sub: { fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  txRow: {
    gap: rhythm.tight,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  txTitle: { fontWeight: "600", fontSize: 13 },
});
