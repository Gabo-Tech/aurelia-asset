import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Card, PrimaryButton, Metric } from "@/components/ui";
import { useStore, useMoney } from "@/lib/store";
import { expandCashflows, cardDebtImpact, valuesByEntry } from "@/lib/cashflow-math";
import type { CreditCard } from "@/lib/types";
import { PALETTE } from "@/lib/types";
import { colors, spacing } from "@/theme/colors";

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
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? colors.accent,
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

function toPatch(f: FormState): Omit<CreditCard, "id"> {
  return {
    name: f.name.trim(),
    color: f.color,
    currency: f.currency,
    statementDay: f.statementDay
      ? Math.max(1, Math.min(31, parseInt(f.statementDay, 10) || 1))
      : undefined,
    dueDay: f.dueDay ? Math.max(1, Math.min(31, parseInt(f.dueDay, 10) || 1)) : undefined,
    creditLimit: f.creditLimit ? parseFloat(f.creditLimit) : undefined,
  };
}

export function CreditCardsManager() {
  const { t } = useTranslation();
  const { state, addCreditCard, updateCreditCard, removeCreditCard, addCashflow } = useStore();
  const { currency, toDisplay, mask } = useMoney();
  const cards = state.creditCards ?? [];

  const debtByCard = useMemo(() => {
    const expanded = expandCashflows(state.cashflows, new Date());
    const values = valuesByEntry(expanded, toDisplay);
    const map = new Map<string, number>();
    for (const e of expanded) {
      const v = values.get(e.id) ?? toDisplay(e.amount, e.currency);
      for (const c of cards) {
        const d = cardDebtImpact(e, c.id, v);
        if (d !== 0) map.set(c.id, (map.get(c.id) ?? 0) + d);
      }
    }
    return map;
  }, [state.cashflows, cards, toDisplay]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(currency));
  const [payCard, setPayCard] = useState<CreditCard | null>(null);
  const [payAmount, setPayAmount] = useState("");

  function openAdd() {
    setEditing(null);
    setForm(emptyForm(currency));
    setFormOpen(true);
  }

  function openEdit(c: CreditCard) {
    setEditing(c);
    setForm(fromCard(c));
    setFormOpen(true);
  }

  function submitForm() {
    if (!form.name.trim()) {
      Alert.alert("Invalid", t("cards.nameRequired", { defaultValue: "Name required" }));
      return;
    }
    const patch = toPatch(form);
    if (editing) {
      updateCreditCard(editing.id, patch);
    } else {
      addCreditCard(patch);
    }
    setFormOpen(false);
    setEditing(null);
  }

  function confirmRemove(c: CreditCard) {
    Alert.alert(
      t("cards.removeConfirm", { defaultValue: `Remove ${c.name}?`, name: c.name }),
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => removeCreditCard(c.id),
        },
      ],
    );
  }

  function submitPay() {
    if (!payCard) return;
    const n = Number(payAmount);
    if (!isFinite(n) || n <= 0) {
      Alert.alert("Invalid", "Enter a payment amount > 0");
      return;
    }
    addCashflow({
      kind: "transfer",
      source: "",
      category: t("cards.paymentCategory", { defaultValue: "Card payment" }),
      amount: n,
      currency: payCard.currency,
      date: new Date().toISOString(),
      fromAccount: "liquidity",
      toAccount: `credit:${payCard.id}`,
      description: t("cards.paymentTo", {
        defaultValue: `Payment to ${payCard.name}`,
        name: payCard.name,
      }),
    });
    setPayCard(null);
    setPayAmount("");
  }

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>{t("cards.title", { defaultValue: "Credit cards" })}</Text>
        <Pressable onPress={openAdd}>
          <Text style={styles.link}>{t("cards.add", { defaultValue: "Add" })}</Text>
        </Pressable>
      </View>

      {cards.length === 0 ? (
        <Text style={styles.empty}>{t("cards.empty", { defaultValue: "No cards yet." })}</Text>
      ) : (
        cards.map((c) => {
          const debt = debtByCard.get(c.id) ?? 0;
          const limit = c.creditLimit ?? 0;
          const used = Math.max(0, debt);
          const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
          const available = limit > 0 ? Math.max(0, limit - used) : null;
          const overLimit = limit > 0 && used > limit;
          return (
            <View key={c.id} style={styles.cardRow}>
              <View style={styles.cardTop}>
                <View style={[styles.dot, { backgroundColor: c.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{c.name}</Text>
                  <Text style={styles.meta}>
                    {c.currency}
                    {c.statementDay ? ` · stmt ${c.statementDay}` : ""}
                    {c.dueDay ? ` · due ${c.dueDay}` : ""}
                  </Text>
                </View>
              </View>
              <Metric
                label={t("cards.balanceOwed", { defaultValue: "Balance owed" })}
                value={mask(debt)}
              />
              {limit > 0 ? (
                <>
                  <View style={styles.limitRow}>
                    <Text style={styles.meta}>
                      {t("cards.limit", { defaultValue: "Limit" })}: {mask(limit)}
                      {available != null
                        ? ` · ${t("cards.available", { defaultValue: "Avail" })}: ${mask(available)}`
                        : ""}
                      {overLimit ? " · over limit" : ""}
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: overLimit ? colors.danger : c.color,
                        },
                      ]}
                    />
                  </View>
                </>
              ) : null}
              <View style={styles.actions}>
                <PrimaryButton
                  label={t("cards.pay", { defaultValue: "Pay" })}
                  onPress={() => {
                    setPayCard(c);
                    setPayAmount(debt > 0 ? String(Math.round(debt * 100) / 100) : "");
                  }}
                />
                <PrimaryButton label="Edit" onPress={() => openEdit(c)} />
                <PrimaryButton label="Delete" onPress={() => confirmRemove(c)} />
              </View>
            </View>
          );
        })
      )}

      {formOpen ? (
        <View style={styles.form}>
          <Text style={styles.title}>
            {editing
              ? t("cards.editCard", { defaultValue: "Edit card" })
              : t("cards.newCard", { defaultValue: "New card" })}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("cards.name", { defaultValue: "Name" })}
            placeholderTextColor={colors.muted}
            value={form.name}
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
          />
          <TextInput
            style={styles.input}
            placeholder={t("cards.creditLimit", { defaultValue: "Credit limit" })}
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={form.creditLimit}
            onChangeText={(creditLimit) => setForm((f) => ({ ...f, creditLimit }))}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.half]}
              placeholder="Statement day"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              value={form.statementDay}
              onChangeText={(statementDay) => setForm((f) => ({ ...f, statementDay }))}
            />
            <TextInput
              style={[styles.input, styles.half]}
              placeholder="Due day"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              value={form.dueDay}
              onChangeText={(dueDay) => setForm((f) => ({ ...f, dueDay }))}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.swatches}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setForm((f) => ({ ...f, color: c }))}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  form.color === c && styles.swatchOn,
                ]}
              />
            ))}
          </ScrollView>
          <PrimaryButton label="Save" onPress={submitForm} />
          <View style={{ height: 8 }} />
          <PrimaryButton
            label="Cancel"
            onPress={() => {
              setFormOpen(false);
              setEditing(null);
            }}
          />
        </View>
      ) : null}

      {payCard ? (
        <View style={styles.form}>
          <Text style={styles.title}>
            {t("cards.pay", { defaultValue: "Pay" })} · {payCard.name}
          </Text>
          <Text style={styles.meta}>
            {t("cards.balanceOwed", { defaultValue: "Balance owed" })}:{" "}
            {mask(debtByCard.get(payCard.id) ?? 0)}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Amount"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={payAmount}
            onChangeText={setPayAmount}
          />
          <PrimaryButton label="Record payment" onPress={submitPay} />
          <View style={{ height: 8 }} />
          <PrimaryButton
            label="Cancel"
            onPress={() => {
              setPayCard(null);
              setPayAmount("");
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: { color: colors.text, fontWeight: "700", marginBottom: 8 },
  link: { color: colors.accent, fontWeight: "600" },
  empty: { color: colors.muted, fontSize: 13 },
  cardRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardName: { color: colors.text, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  limitRow: { marginBottom: 6 },
  barTrack: {
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  barFill: { height: "100%", borderRadius: 3 },
  actions: { gap: 8 },
  form: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    marginBottom: 8,
    backgroundColor: colors.surfaceAlt,
  },
  row: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
  swatches: { marginBottom: 12 },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchOn: { borderColor: colors.text },
});
