import React, { useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  View,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  Screen,
  Header,
  Card,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  MetricRow,
  EmptyState,
  Field,
  FormSheet,
  chipLabelStyle,
  chipContainerStyle,
} from "@/components/ui";
import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { TransactionsPanel } from "@/components/TransactionsPanel";
import { useStore, useMoney } from "@/lib/store";
import { fetchCurrentQuote, searchAssets } from "@/lib/finance";
import { spacing } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";
import { PALETTE, type Holding, type HoldingHorizon, type AssetType } from "@/lib/types";
import { datedFilename, rowsToCsv, saveExportFile, exportMethodDescription } from "@/lib/export";
import { parseCsvHistory, formatCsvHistory } from "@/lib/price-history-csv";
import { formatHoldingQuantity } from "@/lib/format";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { RootTabParamList } from "@/navigation/RootNavigator";

type SortKey = "value" | "symbol" | "type";
type TypeFilter = "all" | AssetType;

export function HoldingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { state, addHolding, updateHolding, removeHolding, addTransaction } = useStore();
  const { mask, toDisplay, currency, privacy } = useMoney();
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("1");
  const [mode, setMode] = useState<"stock" | "crypto" | "custom">("stock");
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [txHoldingId, setTxHoldingId] = useState<string | null>(null);
  const [txQty, setTxQty] = useState("1");
  const [txPrice, setTxPrice] = useState("");
  const [txFees, setTxFees] = useState("");
  const [txKind, setTxKind] = useState<"buy" | "sell">("buy");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [horizonFilter, setHorizonFilter] = useState<"all" | HoldingHorizon>("all");
  const [sort, setSort] = useState<SortKey>("value");
  const [editing, setEditing] = useState<Holding | null>(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editManual, setEditManual] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editHorizon, setEditHorizon] = useState<HoldingHorizon>("long");
  const [editColor, setEditColor] = useState(colors.accent);
  const [editHistoryText, setEditHistoryText] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customHistoryText, setCustomHistoryText] = useState("");

  const totals = useMemo(() => {
    const value = state.holdings.reduce(
      (s, h) => s + toDisplay(h.quantity * h.currentPrice, h.priceCurrency),
      0,
    );
    const long = state.holdings
      .filter((h) => (h.horizon ?? "long") === "long")
      .reduce((s, h) => s + toDisplay(h.quantity * h.currentPrice, h.priceCurrency), 0);
    return { value, long, short: value - long };
  }, [state.holdings, toDisplay]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = state.holdings.filter((h) => {
      if (typeFilter !== "all" && h.type !== typeFilter) return false;
      if (horizonFilter !== "all" && (h.horizon ?? "long") !== horizonFilter) return false;
      if (!q) return true;
      return (
        h.symbol.toLowerCase().includes(q) ||
        h.name.toLowerCase().includes(q) ||
        (h.notes ?? "").toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sort === "type") return a.type.localeCompare(b.type) || a.symbol.localeCompare(b.symbol);
      const va = toDisplay(a.quantity * a.currentPrice, a.priceCurrency);
      const vb = toDisplay(b.quantity * b.currentPrice, b.priceCurrency);
      return vb - va;
    });
    return list;
  }, [state.holdings, query, typeFilter, horizonFilter, sort, toDisplay]);

  const allocation = useMemo(
    () =>
      state.holdings.map((h) => ({
        label: h.symbol,
        value: Math.max(0, toDisplay(h.quantity * h.currentPrice, h.priceCurrency)),
        color: h.color || colors.accent,
        detail: formatHoldingQuantity(h.quantity, h.symbol, h.type, privacy),
      })),
    [state.holdings, toDisplay, privacy],
  );

  async function onAdd() {
    const q = Number(qty);
    const sym = symbol.trim().toUpperCase();
    if (!sym || !isFinite(q) || q <= 0) {
      Alert.alert(
        t("common.checkFields", { defaultValue: "Check your entries" }),
        "Enter symbol and quantity",
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === "custom") {
        const history = parseCsvHistory(customHistoryText);
        const manual = customPrice.trim() ? Number(customPrice) : undefined;
        const lastHist = history.length ? history[history.length - 1]!.p : undefined;
        const price = manual ?? lastHist ?? 0;
        if (manual != null && (!isFinite(manual) || manual < 0)) {
          Alert.alert(t("common.checkFields", { defaultValue: "Check your entries" }), "Price must be ≥ 0");
          return;
        }
        addHolding({
          symbol: sym,
          name: customName.trim() || sym,
          type: "other",
          quantity: q,
          currentPrice: price,
          manualPrice: manual,
          priceCurrency: currency,
          color: PALETTE[state.holdings.length % PALETTE.length]!,
          customHistory: history.length ? history : undefined,
          horizon: "long",
          lastPriceAt: Date.now(),
        });
        setSymbol("");
        setQty("1");
        setCustomName("");
        setCustomPrice("");
        setCustomHistoryText("");
        setAddOpen(false);
        return;
      }

      let name = sym;
      let type: Holding["type"] = mode === "crypto" ? "crypto" : "stock";
      let coinGeckoId: string | undefined;
      try {
        const hits = await searchAssets(sym, mode);
        const hit = hits.find((h) => h.symbol.toUpperCase() === sym) ?? hits[0];
        if (hit) {
          name = hit.name || sym;
          type = hit.type;
          coinGeckoId = hit.coinGeckoId;
        }
      } catch {
        /* offline */
      }
      const draft: Holding = {
        id: "tmp",
        symbol: sym,
        name,
        type,
        quantity: q,
        currentPrice: 0,
        priceCurrency: currency,
        color: PALETTE[state.holdings.length % PALETTE.length]!,
        coinGeckoId,
        horizon: "long",
      };
      try {
        const quote = await fetchCurrentQuote(draft);
        draft.currentPrice = quote.price ?? 0;
        draft.priceCurrency = quote.currency || currency;
        draft.lastPriceAt = Date.now();
      } catch {
        /* manual */
      }
      const { id: _id, ...rest } = draft;
      addHolding(rest);
      setSymbol("");
      setQty("1");
      setAddOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function refreshPrices() {
    setBusy(true);
    try {
      for (const h of state.holdings) {
        try {
          const quote = await fetchCurrentQuote(h);
          if (quote?.price != null) {
            updateHolding(h.id, {
              currentPrice: quote.price,
              lastPriceAt: Date.now(),
              priceCurrency: quote.currency || h.priceCurrency,
            });
          }
        } catch {
          /* skip */
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function onDelete(h: Holding) {
    Alert.alert(`Remove ${h.symbol}?`, "Deletes the holding and its transactions.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeHolding(h.id) },
    ]);
  }

  function openEdit(h: Holding) {
    setEditing(h);
    setEditName(h.name);
    setEditQty(String(h.quantity));
    setEditManual(h.manualPrice != null ? String(h.manualPrice) : "");
    setEditNotes(h.notes ?? "");
    setEditHorizon(h.horizon ?? "long");
    setEditColor(h.color || colors.accent);
    setEditHistoryText(formatCsvHistory(h.customHistory ?? []));
  }

  function saveEdit() {
    if (!editing) return;
    const q = Number(editQty);
    const manual = editManual.trim() ? Number(editManual) : undefined;
    if (!editName.trim() || !isFinite(q) || q < 0) {
      Alert.alert(t("common.checkFields", { defaultValue: "Check your entries" }), "Enter name and quantity");
      return;
    }
    if (manual != null && (!isFinite(manual) || manual < 0)) {
      Alert.alert(t("common.checkFields", { defaultValue: "Check your entries" }), "Manual price must be ≥ 0");
      return;
    }
    const history = parseCsvHistory(editHistoryText);
    const lastHist = history.length ? history[history.length - 1]!.p : undefined;
    updateHolding(editing.id, {
      name: editName.trim(),
      quantity: q,
      manualPrice: manual,
      currentPrice: manual != null ? manual : lastHist ?? editing.currentPrice,
      notes: editNotes.trim() || undefined,
      horizon: editHorizon,
      color: editColor,
      customHistory: history.length ? history : undefined,
    });
    setEditing(null);
  }

  function submitTx() {
    if (!txHoldingId) return;
    const h = state.holdings.find((x) => x.id === txHoldingId);
    if (!h) return;
    const q = Number(txQty);
    const p = Number(txPrice || h.currentPrice);
    const fees = txFees.trim() ? Number(txFees) : undefined;
    if (!isFinite(q) || q <= 0 || !isFinite(p) || p < 0) {
      Alert.alert(t("common.checkFields", { defaultValue: "Check your entries" }), "Enter quantity and price");
      return;
    }
    if (fees != null && (!isFinite(fees) || fees < 0)) {
      Alert.alert(t("common.checkFields", { defaultValue: "Check your entries" }), "Fees must be ≥ 0");
      return;
    }
    addTransaction({
      holdingId: h.id,
      kind: txKind,
      date: new Date().toISOString(),
      quantity: q,
      pricePerUnit: p,
      fees,
      currency: h.priceCurrency || currency,
    });
    setTxHoldingId(null);
    setTxQty("1");
    setTxPrice("");
    setTxFees("");
  }

  async function exportCsv() {
    const rows: unknown[][] = [
      ["symbol", "name", "type", "quantity", "price", "currency", "horizon", "value", "notes"],
      ...state.holdings.map((h) => [
        h.symbol,
        h.name,
        h.type,
        h.quantity,
        h.currentPrice,
        h.priceCurrency || "",
        h.horizon ?? "long",
        toDisplay(h.quantity * h.currentPrice, h.priceCurrency),
        h.notes || "",
      ]),
    ];
    const filename = datedFilename("aurelia-holdings", "csv");
    const method = await saveExportFile(filename, { text: rowsToCsv(rows) });
    Alert.alert("Export", exportMethodDescription(method, filename, t));
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Header title={t("nav.holdings", { defaultValue: "Holdings" })} />
        <Card>
          <MetricRow
            items={[
              { label: "Portfolio value", value: mask(totals.value) },
              { label: "Long-term", value: mask(totals.long) },
              { label: "Short / cash-like", value: mask(totals.short) },
            ]}
          />
          <View style={{ height: 8 }} />
          <SecondaryButton
            label={t("holdings.viewHistory", { defaultValue: "View performance history" })}
            onPress={() => navigation.navigate("Performance")}
          />
        </Card>

        {allocation.some((a) => a.value > 0) ? (
          <CategoryBreakdown
            title="Allocation"
            filename="holdings-allocation"
            slices={allocation}
            format={(n) => mask(n)}
          />
        ) : null}

        <TransactionsPanel />

        <Card>
          <PrimaryButton label="Add holding" onPress={() => setAddOpen(true)} />
          <View style={{ height: 8 }} />
          <View style={styles.row}>
            <PrimaryButton compact style={{ flex: 1 }} label="Refresh" onPress={refreshPrices} disabled={busy} />
            <PrimaryButton
              compact
              style={{ flex: 1 }}
              label="Export holdings CSV"
              onPress={() => void exportCsv()}
            />
          </View>
        </Card>

        <FormSheet
          visible={addOpen}
          title="Add holding"
          onClose={() => setAddOpen(false)}
          footer={
            <View style={styles.row}>
              <PrimaryButton
                style={{ flex: 1 }}
                label={busy ? "…" : "Add holding"}
                onPress={onAdd}
                disabled={busy}
              />
              <SecondaryButton style={{ flex: 1 }} label="Cancel" onPress={() => setAddOpen(false)} />
            </View>
          }
        >
          <View style={styles.row}>
            <Pressable
              onPress={() => setMode("stock")}
              style={[styles.chip, mode === "stock" && styles.chipOn]}
            >
              <Text style={styles.chipText}>Stock/ETF</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("crypto")}
              style={[styles.chip, mode === "crypto" && styles.chipOn]}
            >
              <Text style={styles.chipText}>Crypto</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("custom")}
              style={[styles.chip, mode === "custom" && styles.chipOn]}
            >
              <Text style={styles.chipText}>Custom</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            placeholder={mode === "custom" ? "Symbol" : "Symbol (AAPL, BTC…)"}
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            value={symbol}
            onChangeText={setSymbol}
          />
          {mode === "custom" ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor={colors.muted}
                value={customName}
                onChangeText={setCustomName}
              />
              <TextInput
                style={styles.input}
                placeholder="Manual price (optional)"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                value={customPrice}
                onChangeText={setCustomPrice}
              />
              <Text style={styles.meta}>Price history (date,price per line)</Text>
              <TextInput
                style={[styles.input, styles.notes]}
                placeholder={"2024-01-01,100\n2024-06-01,110"}
                placeholderTextColor={colors.muted}
                value={customHistoryText}
                onChangeText={setCustomHistoryText}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : null}
          <TextInput
            style={styles.input}
            placeholder="Quantity"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={qty}
            onChangeText={setQty}
          />
        </FormSheet>

        <Card>
          <Text style={styles.title}>Filter</Text>
          <TextInput
            style={styles.input}
            placeholder="Search symbol, name, notes…"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(
              [
                ["all", "All types"],
                ["stock", "Stock"],
                ["etf", "ETF"],
                ["crypto", "Crypto"],
                ["metal", "Metal"],
                ["other", "Other"],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => setTypeFilter(id)}
                style={[styles.chip, typeFilter === id && styles.chipOn]}
              >
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.row}>
            {(["all", "long", "short"] as const).map((h) => (
              <Pressable
                key={h}
                onPress={() => setHorizonFilter(h)}
                style={[styles.chip, horizonFilter === h && styles.chipOn]}
              >
                <Text style={styles.chipText}>{h}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            {(["value", "symbol", "type"] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setSort(s)}
                style={[styles.chip, sort === s && styles.chipOn]}
              >
                <Text style={styles.chipText}>Sort: {s}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.meta}>
            Showing {filtered.length} / {state.holdings.length}
          </Text>
        </Card>

        {filtered.map((h) => {
          const value = toDisplay(h.quantity * h.currentPrice, h.priceCurrency);
          const qtyLabel = formatHoldingQuantity(h.quantity, h.symbol, h.type, privacy);
          const txs = state.transactions.filter((tx) => tx.holdingId === h.id).slice(-3);
          return (
            <Card key={h.id}>
              <Pressable onPress={() => openEdit(h)} onLongPress={() => onDelete(h)}>
                <View style={styles.cardTop}>
                  <View style={[styles.dot, { backgroundColor: h.color || colors.accent }]} />
                  <View style={styles.cardHead}>
                    <Text style={styles.title}>
                      {h.symbol} · {h.name}
                    </Text>
                    <Text style={styles.valueInline}>{mask(value)}</Text>
                  </View>
                </View>
                <Text style={styles.qtyLine}>{qtyLabel}</Text>
                <Text style={styles.meta}>
                  {h.type} · {h.horizon ?? "long"} ·{" "}
                  {h.manualPrice != null
                    ? t("holdings.manualPrice", { defaultValue: "Manual price" })
                    : t("holdings.price", { defaultValue: "Price" })}{" "}
                  {mask(h.currentPrice, h.priceCurrency)}
                  {h.notes ? ` · ${h.notes}` : ""}
                </Text>
                <MetricRow
                  items={[
                    {
                      label:
                        h.manualPrice != null
                          ? t("holdings.manualPrice", { defaultValue: "Manual price" })
                          : t("holdings.price", { defaultValue: "Price" }),
                      value: mask(h.currentPrice, h.priceCurrency),
                    },
                    {
                      label: t("holdings.value", { defaultValue: "Value" }),
                      value: mask(value),
                    },
                  ]}
                />
              </Pressable>
              <View style={[styles.row, styles.actionsCenter]}>
                <PrimaryButton compact style={{ flex: 1 }} label="Edit" onPress={() => openEdit(h)} />
                <PrimaryButton
                  compact
                  style={{ flex: 1 }}
                  label="Buy/Sell"
                  onPress={() => {
                    setTxHoldingId(h.id);
                    setTxPrice(String(h.currentPrice || ""));
                  }}
                />
              </View>
              {txs.map((tx) => (
                <Text key={tx.id} style={styles.tx}>
                  {tx.kind.toUpperCase()} {tx.quantity} @ {mask(tx.pricePerUnit, tx.currency)} ·{" "}
                  {tx.date.slice(0, 10)}
                </Text>
              ))}
            </Card>
          );
        })}

        <FormSheet
          visible={!!editing}
          title={`Edit ${editing?.symbol ?? ""}`}
          onClose={() => setEditing(null)}
          footer={
            <View style={styles.row}>
              <PrimaryButton style={{ flex: 1 }} label="Save" onPress={saveEdit} />
              <SecondaryButton style={{ flex: 1 }} label="Cancel" onPress={() => setEditing(null)} />
            </View>
          }
        >
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor={colors.muted}
            value={editName}
            onChangeText={setEditName}
          />
          <TextInput
            style={styles.input}
            placeholder="Quantity"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={editQty}
            onChangeText={setEditQty}
          />
          <TextInput
            style={styles.input}
            placeholder="Manual price (optional)"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={editManual}
            onChangeText={setEditManual}
          />
          <TextInput
            style={[styles.input, styles.notes]}
            placeholder="Notes"
            placeholderTextColor={colors.muted}
            value={editNotes}
            onChangeText={setEditNotes}
            multiline
          />
          <Text style={styles.meta}>
            Custom price history (date,price): {parseCsvHistory(editHistoryText).length} points
          </Text>
          <TextInput
            style={[styles.input, styles.notes]}
            placeholder={"2024-01-01,100\n2024-06-01,110"}
            placeholderTextColor={colors.muted}
            value={editHistoryText}
            onChangeText={setEditHistoryText}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.row}>
            <Pressable
              onPress={() => setEditHorizon("long")}
              style={[styles.chip, editHorizon === "long" && styles.chipOn]}
            >
              <Text style={styles.chipText}>Long</Text>
            </Pressable>
            <Pressable
              onPress={() => setEditHorizon("short")}
              style={[styles.chip, editHorizon === "short" && styles.chipOn]}
            >
              <Text style={styles.chipText}>Short / cash-like</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setEditColor(c)}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  editColor === c && styles.swatchOn,
                ]}
              />
            ))}
          </ScrollView>
          {editing ? (
            <DangerButton label="Delete holding" onPress={() => onDelete(editing)} />
          ) : null}
        </FormSheet>

        <FormSheet
          visible={!!txHoldingId}
          title="Buy / sell"
          onClose={() => setTxHoldingId(null)}
          footer={
            <View style={styles.row}>
              <PrimaryButton style={{ flex: 1 }} label="Save transaction" onPress={submitTx} />
              <SecondaryButton style={{ flex: 1 }} label="Cancel" onPress={() => setTxHoldingId(null)} />
            </View>
          }
        >
          <View style={styles.row}>
            <Pressable
              onPress={() => setTxKind("buy")}
              style={[styles.chip, txKind === "buy" && styles.chipOn]}
            >
              <Text style={styles.chipText}>Buy</Text>
            </Pressable>
            <Pressable
              onPress={() => setTxKind("sell")}
              style={[styles.chip, txKind === "sell" && styles.chipOn]}
            >
              <Text style={styles.chipText}>Sell</Text>
            </Pressable>
          </View>
          <Field label="Quantity">
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={txQty}
              onChangeText={setTxQty}
            />
          </Field>
          <Field label="Price per unit">
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={txPrice}
              onChangeText={setTxPrice}
            />
          </Field>
          <Field label="Fees (optional)">
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={txFees}
              onChangeText={setTxFees}
            />
          </Field>
        </FormSheet>

        {state.holdings.length === 0 ? (
          <EmptyState
            title={t("holdings.emptyTitle", { defaultValue: "No holdings yet" })}
            body={t("holdings.emptyBody", {
              defaultValue:
                "Add a stock, crypto, or custom asset. Or import a backup from Settings under More.",
            })}
            actionLabel="Add holding"
            onAction={() => setAddOpen(true)}
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" body="Try a different search or filter." />
        ) : (
          <Text style={styles.hint}>Tap to edit · Long-press to delete.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    marginBottom: 8,
    backgroundColor: colors.surfaceAlt,
  },
  notes: { minHeight: 72, textAlignVertical: "top" },
  row: { flexDirection: "row", marginBottom: spacing.sm, flexWrap: "wrap", gap: 8 },
  actionsCenter: { justifyContent: "center", alignItems: "stretch", flexWrap: "nowrap" },
  title: { color: colors.text, fontWeight: "700", flex: 1, marginBottom: 0 },
  empty: { color: colors.muted },
  hint: { color: colors.muted, fontSize: 12, textAlign: "center", marginBottom: 24 },
  meta: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  qtyLine: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginTop: 6,
    marginBottom: 4,
    fontVariant: ["tabular-nums"],
  },
  cardHead: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  valueInline: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  chip: {
    ...chipContainerStyle,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { ...chipLabelStyle, color: colors.text },
  tx: { color: colors.muted, fontSize: 12, marginTop: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
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
}
