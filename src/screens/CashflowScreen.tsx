import React, { useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  TextInput,
  View,
  Alert,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import { startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { Screen, Header, Card, PrimaryButton, Metric, SegmentedControl, Chip } from "@/components/ui";
import { SankeyChart } from "@/components/SankeyChart";
import { CreditCardsManager } from "@/components/CreditCardsManager";
import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { CategoriesManager } from "@/components/CategoriesManager";
import { useStore, useMoney } from "@/lib/store";
import {
  expandCashflows,
  valuesByEntry,
  liquidityImpact,
} from "@/lib/cashflow-math";
import {
  buildStagedSankey,
  type SankeyBuildPrefs,
  type SankeyLabels,
} from "@/lib/sankey-build";
import { GROUP_COLORS, type CategoryGroup, type AccountRef } from "@/lib/types";
import { datedFilename, rowsToCsv, saveExportFile, exportMethodDescription } from "@/lib/export";
import { exportCashflowPdf } from "@/lib/cashflow-pdf";
import { formatMoney } from "@/lib/format";
import { CURRENCIES } from "@/lib/currency";
import { colors, spacing } from "@/theme/colors";

type Period = "this-month" | "last-month" | "ytd" | "all";

function periodRange(period: Period): { from: Date; until: Date } {
  const until = new Date();
  if (period === "this-month") return { from: startOfMonth(until), until: endOfMonth(until) };
  if (period === "last-month") {
    const d = subMonths(until, 1);
    return { from: startOfMonth(d), until: endOfMonth(d) };
  }
  if (period === "ytd") return { from: startOfYear(until), until };
  return { from: new Date(0), until };
}

const DEFAULT_PREFS: SankeyBuildPrefs = {
  nodeColors: {},
  incomeOrder: [],
  expenseOrder: [],
  accountOrder: [],
  stages: { categories: true, descriptions: false },
};

export function CashflowScreen() {
  const { t } = useTranslation();
  const { state, addCashflow, updateCashflow, removeCashflow } = useStore();
  const { mask, toDisplay, currency, fmt } = useMoney();
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"income" | "expense" | "transfer">("expense");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("this-month");
  const [showSankey, setShowSankey] = useState(true);
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "monthly" | "yearly">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("liquidity");
  const [installments, setInstallments] = useState(false);
  const [instCount, setInstCount] = useState("3");
  const [instFreq, setInstFreq] = useState<"weekly" | "monthly">("monthly");
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [amountKind, setAmountKind] = useState<"fixed" | "percent">("fixed");
  const [percentOf, setPercentOf] = useState<string>("all-income");
  const [kindFilter, setKindFilter] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sankeyStages, setSankeyStages] = useState({ categories: true, descriptions: false });
  const [fromAccount, setFromAccount] = useState<string>("liquidity");
  const [toAccount, setToAccount] = useState<string>("liquidity");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryCurrency, setEntryCurrency] = useState(currency);
  const [recurUntil, setRecurUntil] = useState("");

  const { rows, totals, sankeyData, chartData, periodLabel, expenseSlices, incomeSlices } =
    useMemo(() => {
    const { from, until } = periodRange(period);
    const expanded = expandCashflows(state.cashflows, until).filter((e) => {
      const d = new Date(e.date);
      if (d < from || d > until) return false;
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (categoryFilter !== "all") {
        const name = e.kind === "income" ? e.source : e.category || e.source;
        if (name !== categoryFilter) return false;
      }
      return true;
    });
    const values = valuesByEntry(expanded, toDisplay);
    let income = 0;
    let expense = 0;
    let liquidity = 0;
    const list = expanded
      .map((e) => {
        const v = values.get(e.id) ?? 0;
        if (e.kind === "income") income += v;
        if (e.kind === "expense") expense += v;
        liquidity += liquidityImpact(e, v);
        return {
          id: e.id,
          parentId: e.parentId,
          isOccurrence: e.isOccurrence,
          label: e.kind === "income" ? e.source : e.category || e.source,
          kind: e.kind,
          value: v,
          date: e.date?.slice(0, 10),
          description: e.description,
          paymentMethod: e.paymentMethod,
          installment: !!e.installmentPlan || (e.isOccurrence && e.id.includes("__inst")),
        };
      })
      .reverse();

    const chronological = [...expanded].sort(
      (a, b) => +new Date(a.date) - +new Date(b.date),
    );
    let balance = 0;
    const chart: { label: string; balance: number }[] = [];
    for (const e of chronological) {
      if (e.kind !== "income" && e.kind !== "expense") continue;
      const v = values.get(e.id) ?? 0;
      balance += e.kind === "income" ? v : -v;
      chart.push({
        label: (e.date ?? "").slice(5, 10),
        balance,
      });
    }

    const catByName = new Map(state.categories.map((c) => [c.name, c]));
    const labels: SankeyLabels = {
      totalIncome: t("cashflow.totalIncome", { defaultValue: "Total income" }),
      totalExpenses: t("cashflow.totalExpenses", { defaultValue: "Total expenses" }),
      totalSavings: t("cashflow.totalSavings", { defaultValue: "Savings" }),
      totalInvestments: t("cashflow.totalInvestments", { defaultValue: "Investments" }),
      saved: t("cashflow.saved", { defaultValue: "Saved" }),
      deficit: t("cashflow.deficit", { defaultValue: "Deficit" }),
      other: t("cashflow.other", { defaultValue: "Other" }),
      cashPool: t("cashflow.cashPool", { defaultValue: "Cash" }),
      general: t("cashflow.general", { defaultValue: "General" }),
    };
    const colorFor = (name: string, fallbackGroup: CategoryGroup) => {
      const cat = catByName.get(name);
      return cat?.color || GROUP_COLORS[fallbackGroup] || colors.accent;
    };
    const sankey = buildStagedSankey({
      entries: expanded.filter((e) => e.kind === "income" || e.kind === "expense"),
      valuesTop: values,
      catByName,
      colorFor,
      prefs: { ...DEFAULT_PREFS, stages: sankeyStages },
      labels,
    });

    const expenseByCat = new Map<string, number>();
    const incomeBySrc = new Map<string, number>();
    for (const e of expanded) {
      const v = values.get(e.id) ?? 0;
      if (e.kind === "expense" && v > 0) {
        const key = e.category || e.source || "Other";
        expenseByCat.set(key, (expenseByCat.get(key) ?? 0) + v);
      }
      if (e.kind === "income" && v > 0) {
        const key = e.source || e.category || "Other";
        incomeBySrc.set(key, (incomeBySrc.get(key) ?? 0) + v);
      }
    }
    const groupKeys = Object.keys(GROUP_COLORS) as CategoryGroup[];
    const expenseSlices = Array.from(expenseByCat.entries()).map(([label, value]) => ({
      label,
      value,
      color: catByName.get(label)?.color || colors.expense,
    }));
    const incomeSlices = Array.from(incomeBySrc.entries()).map(([label, value], i) => ({
      label,
      value,
      color:
        catByName.get(label)?.color ||
        GROUP_COLORS[groupKeys[i % groupKeys.length]!] ||
        colors.income,
    }));

    const periodLabels: Record<Period, string> = {
      "this-month": "This month",
      "last-month": "Last month",
      ytd: "Year to date",
      all: "All time",
    };

    return {
      rows: list,
      totals: { income, expense, net: income - expense, liquidity },
      sankeyData: sankey,
      chartData: chart,
      periodLabel: periodLabels[period],
      expenseSlices,
      incomeSlices,
    };
  }, [state.cashflows, state.categories, period, kindFilter, categoryFilter, sankeyStages, toDisplay, t]);

  const expenseCats = useMemo(
    () => state.categories.filter((c) => c.kind === "expense"),
    [state.categories],
  );
  const incomeCats = useMemo(
    () => state.categories.filter((c) => c.kind === "income"),
    [state.categories],
  );

  const filterCategories = useMemo(() => {
    if (kindFilter === "income") return incomeCats;
    if (kindFilter === "expense") return expenseCats;
    if (kindFilter === "transfer") return [];
    return state.categories;
  }, [kindFilter, incomeCats, expenseCats, state.categories]);

  const accountOptions = useMemo(() => {
    const items: { id: string; label: string }[] = [
      { id: "liquidity", label: "Liquidity (cash)" },
    ];
    for (const h of state.holdings ?? []) {
      items.push({ id: `holding:${h.id}`, label: `${h.symbol} · ${h.name}` });
    }
    for (const c of state.creditCards ?? []) {
      items.push({ id: `credit:${c.id}`, label: c.name });
    }
    return items;
  }, [state.holdings, state.creditCards]);

  const payMethods = useMemo(
    () => accountOptions.filter((a) => !a.id.startsWith("holding:")),
    [accountOptions],
  );

  const percentBases = useMemo(
    () =>
      state.cashflows
        .filter((e) => (e.amountKind ?? "fixed") === "fixed" && e.kind !== "transfer")
        .map((e) => ({
          id: e.id,
          label: `${e.kind === "income" ? e.source : e.category || e.source} · ${(e.date ?? "").slice(0, 10)}`,
        })),
    [state.cashflows],
  );

  function resetForm() {
    setSource("");
    setAmount("");
    setRecurrence("none");
    setInstallments(false);
    setPaymentMethod("liquidity");
    setFromAccount("liquidity");
    setToAccount("liquidity");
    setEntryDate(new Date().toISOString().slice(0, 10));
    setEntryCurrency(currency);
    setRecurUntil("");
    setAmountKind("fixed");
    setPercentOf("all-income");
    setEditingId(null);
  }

  function parseIsoDate(ymd: string): string {
    const d = new Date(`${ymd.trim()}T12:00:00`);
    return isFinite(+d) ? d.toISOString() : new Date().toISOString();
  }

  async function exportCsv() {
    const csvRows: unknown[][] = [
      ["kind", "label", "amount", "date"],
      ...rows.map((r) => [r.kind, r.label, r.value, r.date]),
    ];
    const filename = datedFilename("aurelia-cashflow", "csv");
    const method = await saveExportFile(filename, { text: rowsToCsv(csvRows) });
    Alert.alert("Export", exportMethodDescription(method, filename, t));
  }

  async function exportPdf() {
    if (!rows.length) {
      Alert.alert("Export", t("more.entriesNoneInRange", { defaultValue: "No entries in range" }));
      return;
    }
    try {
      const method = await exportCashflowPdf({
        periodLabel,
        currency,
        totals: { income: totals.income, expense: totals.expense, net: totals.net },
        rows: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          label: r.label,
          value: r.value,
          date: r.date,
          amountText: formatMoney(r.value, currency),
        })),
        chartData,
        filenameStem: `cashflow_${period}`,
        labels: {
          reportTitle: t("cashflow.pdfReportTitle", { defaultValue: "Cashflow Report" }),
          period: t("cashflow.pdfPeriod", { defaultValue: "Period" }),
          filters: t("cashflow.pdfFilters", {
            defaultValue: `Type: ${kindFilter} · Category: ${categoryFilter} · Currency: ${currency}`,
            type: kindFilter,
            category: categoryFilter,
            currency,
          }),
          income: t("cashflow.pdfIncome", { defaultValue: "Income" }),
          expenses: t("cashflow.pdfExpenses", { defaultValue: "Expenses" }),
          net: t("cashflow.pdfNet", { defaultValue: "Net" }),
          date: t("cashflow.pdfDate", { defaultValue: "Date" }),
          type: t("cashflow.pdfType", { defaultValue: "Type" }),
          sourceCategory: t("cashflow.pdfSourceCategory", { defaultValue: "Source / Category" }),
          amount: t("cashflow.pdfAmount", { defaultValue: "Amount" }),
          inCurrency: t("cashflow.pdfInCurrency", {
            defaultValue: `In ${currency}`,
            currency,
          }),
          balancePositive: t("cashflow.pdfBalancePositive", { defaultValue: "Balance ≥ 0" }),
          balanceNegative: t("cashflow.pdfBalanceNegative", { defaultValue: "Balance < 0" }),
        },
      });
      if (method === "cancelled") return;
      Alert.alert(
        "Export",
        t("more.entriesPdfExported", { defaultValue: "PDF exported" }),
      );
    } catch (e) {
      Alert.alert("Export failed", (e as Error).message);
    }
  }

  function onAdd() {
    const n = Number(amount);
    if (!source.trim() || !isFinite(n) || n <= 0) {
      Alert.alert("Invalid", "Enter a label and amount > 0");
      return;
    }
    if (kind === "transfer" && fromAccount === toAccount) {
      Alert.alert("Invalid", "From and to accounts must differ");
      return;
    }
    const cat =
      kind === "expense"
        ? expenseCats.find((c) => c.id === categoryId)?.name || source.trim()
        : kind === "income"
          ? incomeCats[0]?.name || ""
          : "Transfer";
    const count = Math.max(2, Math.min(60, parseInt(instCount, 10) || 3));
    const useInstallments = kind === "expense" && installments && recurrence === "none";
    const usePercent = amountKind === "percent" && !useInstallments && kind !== "transfer";
    const isoDate = parseIsoDate(entryDate);
    const payload = {
      kind,
      source: source.trim(),
      category: cat,
      amount: n,
      currency: entryCurrency || currency,
      date: isoDate,
      amountKind: usePercent ? ("percent" as const) : ("fixed" as const),
      percentOf: usePercent ? percentOf : undefined,
      recurrence:
        !useInstallments && recurrence !== "none"
          ? {
              frequency: recurrence as "weekly" | "monthly" | "yearly",
              until: recurUntil.trim() ? parseIsoDate(recurUntil) : undefined,
            }
          : undefined,
      paymentMethod:
        kind === "expense" ? (paymentMethod as AccountRef) : undefined,
      installmentPlan: useInstallments
        ? {
            total: n,
            count,
            frequency: instFreq,
            firstDueDate: isoDate,
          }
        : undefined,
      ...(kind === "transfer"
        ? {
            fromAccount: fromAccount as AccountRef,
            toAccount: toAccount as AccountRef,
          }
        : {}),
    };
    if (editingId) {
      updateCashflow(editingId, payload);
    } else {
      addCashflow(payload);
    }
    resetForm();
  }

  function onEdit(id: string) {
    const entry = state.cashflows.find((c) => c.id === id);
    if (!entry) return;
    setEditingId(entry.id);
    setKind(entry.kind);
    setSource(entry.source || entry.category || "");
    setAmount(
      entry.installmentPlan ? String(entry.installmentPlan.total) : String(entry.amount),
    );
    setRecurrence(entry.recurrence?.frequency ?? "none");
    setRecurUntil(entry.recurrence?.until?.slice(0, 10) ?? "");
    setPaymentMethod(entry.paymentMethod || "liquidity");
    setFromAccount(entry.fromAccount || "liquidity");
    setToAccount(entry.toAccount || "liquidity");
    setEntryDate((entry.date ?? new Date().toISOString()).slice(0, 10));
    setEntryCurrency(entry.currency || currency);
    setAmountKind(entry.amountKind ?? "fixed");
    setPercentOf(entry.percentOf || "all-income");
    if (entry.installmentPlan) {
      setInstallments(true);
      setInstCount(String(entry.installmentPlan.count));
      setInstFreq(entry.installmentPlan.frequency);
    } else {
      setInstallments(false);
    }
    if (entry.kind === "expense") {
      const cat = expenseCats.find((c) => c.name === entry.category);
      setCategoryId(cat?.id ?? null);
    }
  }

  function onDelete(id: string, parentId: string, isOccurrence: boolean) {
    const target = isOccurrence ? parentId : id;
    Alert.alert("Delete entry?", "Remove this cashflow entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => removeCashflow(target),
      },
    ]);
  }

  const periods: { id: Period; label: string }[] = [
    { id: "this-month", label: "This month" },
    { id: "last-month", label: "Last month" },
    { id: "ytd", label: "YTD" },
    { id: "all", label: "All" },
  ];

  return (
    <Screen>
      <ScrollView>
        <Header title={t("nav.cashflow", { defaultValue: "Cashflow" })} />

        <SegmentedControl
          options={periods.map((p) => ({ id: p.id, label: p.label }))}
          value={period}
          onChange={setPeriod}
        />
        <SegmentedControl
          options={(["all", "income", "expense", "transfer"] as const).map((k) => ({
            id: k,
            label: k,
          }))}
          value={kindFilter}
          onChange={(k) => {
            setKindFilter(k);
            setCategoryFilter("all");
          }}
        />
        {filterCategories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
            <Chip
              label="All"
              active={categoryFilter === "all"}
              onPress={() => setCategoryFilter("all")}
            />
            {filterCategories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                color={c.color}
                active={categoryFilter === c.name}
                onPress={() => setCategoryFilter(c.name)}
              />
            ))}
          </ScrollView>
        ) : null}

        <Card>
          <Metric label={`Income (${currency})`} value={mask(totals.income)} />
          <Metric label="Expenses" value={mask(totals.expense)} />
          <Metric label="Net" value={mask(totals.net)} />
          <Metric label="Liquidity impact" value={mask(totals.liquidity)} />
          <PrimaryButton label="Export period CSV" onPress={() => void exportCsv()} />
          <PrimaryButton
            label={t("cashflow.exportPdf", { defaultValue: "Export PDF" })}
            onPress={() => void exportPdf()}
          />
        </Card>

        <CreditCardsManager />
        <CategoriesManager />

        <View style={styles.rowBetween}>
          <Text style={styles.section}>By category</Text>
          <Pressable onPress={() => setShowBreakdown((v) => !v)}>
            <Text style={styles.link}>{showBreakdown ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>
        {showBreakdown ? (
          <>
            <CategoryBreakdown
              title="Expenses"
              filename="cashflow-expense-cats"
              slices={expenseSlices}
              format={(n) => mask(n)}
              emptyLabel="No expenses in this period."
            />
            <CategoryBreakdown
              title="Income"
              filename="cashflow-income-cats"
              slices={incomeSlices}
              format={(n) => mask(n)}
              emptyLabel="No income in this period."
            />
          </>
        ) : null}

        <View style={styles.rowBetween}>
          <Text style={styles.section}>Sankey</Text>
          <Pressable onPress={() => setShowSankey((v) => !v)}>
            <Text style={styles.link}>{showSankey ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>
        {showSankey ? (
          <View style={styles.pills}>
            <Pressable
              onPress={() =>
                setSankeyStages((s) => ({ ...s, categories: !s.categories }))
              }
              style={[styles.pill, sankeyStages.categories && styles.pillActive]}
            >
              <Text
                style={[
                  styles.pillText,
                  sankeyStages.categories && styles.pillTextActive,
                ]}
              >
                Categories
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                setSankeyStages((s) => ({ ...s, descriptions: !s.descriptions }))
              }
              style={[styles.pill, sankeyStages.descriptions && styles.pillActive]}
            >
              <Text
                style={[
                  styles.pillText,
                  sankeyStages.descriptions && styles.pillTextActive,
                ]}
              >
                Descriptions
              </Text>
            </Pressable>
          </View>
        ) : null}
        {showSankey && sankeyData ? (
          <SankeyChart data={sankeyData} height={340} format={(v) => fmt(v)} />
        ) : null}

        <Card>
          <Text style={styles.label}>{editingId ? "Edit entry" : "Quick add"}</Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => setKind("expense")}
              style={[styles.kindBtn, kind === "expense" && styles.kindBtnActiveExpense]}
            >
              <Text style={styles.kindText}>Expense</Text>
            </Pressable>
            <Pressable
              onPress={() => setKind("income")}
              style={[styles.kindBtn, kind === "income" && styles.kindBtnActiveIncome]}
            >
              <Text style={styles.kindText}>Income</Text>
            </Pressable>
            <Pressable
              onPress={() => setKind("transfer")}
              style={[styles.kindBtn, kind === "transfer" && styles.kindBtnActiveTransfer]}
            >
              <Text style={styles.kindText}>Transfer</Text>
            </Pressable>
          </View>
          {kind === "expense" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              {expenseCats.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  style={[
                    styles.catChip,
                    { borderColor: c.color },
                    categoryId === c.id && { backgroundColor: c.color + "33" },
                  ]}
                >
                  <Text style={styles.catChipText}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <TextInput
            style={styles.input}
            placeholder={
              kind === "income" ? "Source" : kind === "transfer" ? "Transfer label" : "Description / label"
            }
            placeholderTextColor={colors.muted}
            value={source}
            onChangeText={setSource}
          />
          <TextInput
            style={styles.input}
            placeholder={amountKind === "percent" ? "Percent (e.g. 10)" : "Amount"}
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            value={entryDate}
            onChangeText={setEntryDate}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.label}>Currency</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
            {CURRENCIES.slice(0, 12).map((c) => (
              <Pressable
                key={c.code}
                onPress={() => setEntryCurrency(c.code)}
                style={[
                  styles.catChip,
                  { borderColor: colors.border },
                  entryCurrency === c.code && {
                    backgroundColor: colors.accentSoft,
                    borderColor: colors.accent,
                  },
                ]}
              >
                <Text style={styles.catChipText}>{c.code}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {kind === "transfer" ? (
            <>
              <Text style={styles.label}>From</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
                {accountOptions.map((m) => (
                  <Pressable
                    key={`from-${m.id}`}
                    onPress={() => setFromAccount(m.id)}
                    style={[
                      styles.catChip,
                      { borderColor: colors.border },
                      fromAccount === m.id && {
                        backgroundColor: colors.accentSoft,
                        borderColor: colors.accent,
                      },
                    ]}
                  >
                    <Text style={styles.catChipText}>{m.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>To</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
                {accountOptions.map((m) => (
                  <Pressable
                    key={`to-${m.id}`}
                    onPress={() => setToAccount(m.id)}
                    style={[
                      styles.catChip,
                      { borderColor: colors.border },
                      toAccount === m.id && {
                        backgroundColor: colors.accentSoft,
                        borderColor: colors.accent,
                      },
                    ]}
                  >
                    <Text style={styles.catChipText}>{m.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
          {kind !== "transfer" && !installments ? (
            <>
              <Text style={styles.label}>Amount type</Text>
              <View style={styles.row}>
                <Pressable
                  onPress={() => setAmountKind("fixed")}
                  style={[styles.kindBtn, amountKind === "fixed" && styles.kindBtnActiveIncome]}
                >
                  <Text style={styles.kindText}>Fixed</Text>
                </Pressable>
                <Pressable
                  onPress={() => setAmountKind("percent")}
                  style={[styles.kindBtn, amountKind === "percent" && styles.kindBtnActiveTransfer]}
                >
                  <Text style={styles.kindText}>Percent</Text>
                </Pressable>
              </View>
              {amountKind === "percent" ? (
                <>
                  <View style={styles.row}>
                    <Pressable
                      onPress={() => setPercentOf("all-income")}
                      style={[
                        styles.kindBtn,
                        percentOf === "all-income" && styles.kindBtnActiveIncome,
                      ]}
                    >
                      <Text style={styles.kindText}>of income</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPercentOf("all-expense")}
                      style={[
                        styles.kindBtn,
                        percentOf === "all-expense" && styles.kindBtnActiveExpense,
                      ]}
                    >
                      <Text style={styles.kindText}>of expenses</Text>
                    </Pressable>
                  </View>
                  {percentBases.length > 0 ? (
                    <>
                      <Text style={styles.label}>Or of specific entry</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.catRow}
                      >
                        {percentBases.map((b) => (
                          <Pressable
                            key={b.id}
                            onPress={() => setPercentOf(b.id)}
                            style={[
                              styles.catChip,
                              { borderColor: colors.border },
                              percentOf === b.id && {
                                backgroundColor: colors.accentSoft,
                                borderColor: colors.accent,
                              },
                            ]}
                          >
                            <Text style={styles.catChipText}>{b.label}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          {kind === "expense" ? (
            <>
              <Text style={styles.label}>Paid from</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
                {payMethods.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => setPaymentMethod(m.id)}
                    style={[
                      styles.catChip,
                      { borderColor: colors.border },
                      paymentMethod === m.id && {
                        backgroundColor: colors.accentSoft,
                        borderColor: colors.accent,
                      },
                    ]}
                  >
                    <Text style={styles.catChipText}>{m.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => {
                  setInstallments((v) => !v);
                  if (!installments) setRecurrence("none");
                }}
                style={[styles.kindBtn, installments && styles.kindBtnActiveTransfer]}
              >
                <Text style={styles.kindText}>
                  {installments ? "✓ Installment plan" : "Split into installments"}
                </Text>
              </Pressable>
              {installments ? (
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Count"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    value={instCount}
                    onChangeText={setInstCount}
                  />
                  {(["monthly", "weekly"] as const).map((f) => (
                    <Pressable
                      key={f}
                      onPress={() => setInstFreq(f)}
                      style={[styles.kindBtn, instFreq === f && styles.kindBtnActiveIncome]}
                    >
                      <Text style={styles.kindText}>{f}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
          {!installments ? (
            <>
              <Text style={styles.label}>Recurrence</Text>
              <View style={styles.row}>
                {(["none", "weekly", "monthly", "yearly"] as const).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRecurrence(r)}
                    style={[styles.kindBtn, recurrence === r && styles.kindBtnActiveIncome]}
                  >
                    <Text style={styles.kindText}>{r}</Text>
                  </Pressable>
                ))}
              </View>
              {recurrence !== "none" ? (
                <>
                  <Text style={styles.label}>Until (optional YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Leave empty = ongoing"
                    placeholderTextColor={colors.muted}
                    value={recurUntil}
                    onChangeText={setRecurUntil}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              ) : null}
            </>
          ) : null}
          <PrimaryButton label={editingId ? "Save changes" : "Add entry"} onPress={onAdd} />
          {editingId ? (
            <PrimaryButton label="Cancel edit" onPress={resetForm} />
          ) : null}
        </Card>

        <Text style={styles.section}>Entries ({rows.length})</Text>
        {rows.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => !r.isOccurrence && onEdit(r.parentId || r.id)}
            onLongPress={() => onDelete(r.id, r.parentId, r.isOccurrence)}
          >
            <Card>
              <View style={styles.rowBetween}>
                <Text
                  style={[
                    styles.rowTitle,
                    {
                      color:
                        r.kind === "income"
                          ? colors.income
                          : r.kind === "transfer"
                            ? colors.accent
                            : colors.expense,
                    },
                  ]}
                >
                  {r.kind.toUpperCase()} · {r.label}
                </Text>
                <Text style={styles.rowValue}>{mask(r.value)}</Text>
              </View>
              <Text style={styles.rowMeta}>
                {r.date}
                {r.description ? ` · ${r.description}` : ""}
                {r.isOccurrence ? " · recurring" : ""}
                {r.installment ? " · installment" : ""}
                {r.paymentMethod?.startsWith("credit:") ? " · card" : ""}
              </Text>
            </Card>
          </Pressable>
        ))}
        {rows.length === 0 ? (
          <Card>
            <Text style={styles.empty}>No cashflow entries in this period.</Text>
          </Card>
        ) : (
          <Text style={styles.hint}>Tap to edit · Long-press to delete.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pillText: { color: colors.muted, fontSize: 12 },
  pillTextActive: { color: colors.text, fontWeight: "600" },
  section: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 4,
    fontSize: 15,
  },
  label: { color: colors.muted, marginBottom: 8 },
  row: { flexDirection: "row", marginBottom: spacing.sm, gap: 8 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  link: { color: colors.accent, fontSize: 13 },
  kindBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
  },
  kindBtnActiveExpense: { borderColor: colors.expense, backgroundColor: "#ef444422" },
  kindBtnActiveIncome: { borderColor: colors.income, backgroundColor: "#22c55e22" },
  kindBtnActiveTransfer: { borderColor: colors.accent, backgroundColor: "#3d9a8b22" },
  kindText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  catRow: { marginBottom: 8 },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6,
  },
  catChipText: { color: colors.text, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    marginBottom: 8,
    backgroundColor: colors.surfaceAlt,
  },
  rowTitle: { fontWeight: "600", flex: 1, paddingRight: 8 },
  rowValue: { color: colors.text, fontWeight: "700" },
  rowMeta: { color: colors.muted, marginTop: 4, fontSize: 12 },
  empty: { color: colors.muted },
  hint: { color: colors.muted, fontSize: 12, marginBottom: 24, textAlign: "center" },
});
