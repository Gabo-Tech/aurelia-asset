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
import {
  Screen,
  ScreenStack,
  Header,
  Card,
  CardTitle,
  CardHelperText,
  CardCopy,
  PrimaryButton,
  SecondaryButton,
  MetricRow,
  SegmentedControl,
  Chip,
  EmptyState,
  Field,
  FormSheet,
  chipLabelStyle,
  chipContainerStyle,
} from "@/components/ui";
import { SankeyChart } from "@/components/SankeyChart";
import { CreditCardsManager } from "@/components/CreditCardsManager";
import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { CategoriesManager } from "@/components/CategoriesManager";
import { CashflowUpcoming } from "@/components/CashflowUpcoming";
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
import { spacing } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";

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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { state, addCashflow, updateCashflow, removeCashflow } = useStore();
  const { mask, toDisplay, currency, fmt } = useMoney();
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"income" | "expense" | "transfer">("expense");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("this-month");
  const [mode, setMode] = useState<"activity" | "upcoming" | "insights" | "accounts">("activity");
  const [showSankey, setShowSankey] = useState(true);
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "monthly" | "yearly">("none");
  const [whenSchedule, setWhenSchedule] = useState<"one-time" | "recurring" | "installments">(
    "one-time",
  );
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
  const [formOpen, setFormOpen] = useState(false);

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

  /** Category names that appear in the current period (and kind filter), for chip visibility. */
  const categoriesWithData = useMemo(() => {
    const { from, until } = periodRange(period);
    const names = new Set<string>();
    for (const e of expandCashflows(state.cashflows, until)) {
      const d = new Date(e.date);
      if (d < from || d > until) continue;
      if (kindFilter !== "all" && e.kind !== kindFilter) continue;
      if (e.kind === "transfer") continue;
      const name = e.kind === "income" ? e.source : e.category || e.source;
      if (name?.trim()) names.add(name.trim());
    }
    return names;
  }, [state.cashflows, period, kindFilter]);

  const filterCategories = useMemo(() => {
    if (kindFilter === "transfer") return [];
    const base =
      kindFilter === "income"
        ? incomeCats
        : kindFilter === "expense"
          ? expenseCats
          : state.categories;
    const withData = base.filter((c) => categoriesWithData.has(c.name));
    // Include orphan labels that appear on entries but are not in the category list
    const known = new Set(withData.map((c) => c.name));
    const orphans = [...categoriesWithData]
      .filter((name) => !known.has(name))
      .map((name) => ({
        id: `orphan:${name}`,
        name,
        color: colors.muted,
        kind: "expense" as const,
        group: "expense" as const,
      }));
    return [...withData, ...orphans];
  }, [kindFilter, incomeCats, expenseCats, state.categories, categoriesWithData]);

  React.useEffect(() => {
    if (
      categoryFilter !== "all" &&
      !filterCategories.some((c) => c.name === categoryFilter)
    ) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, filterCategories]);

  const accountOptions = useMemo(() => {
    const cashAccounts = state.cashAccounts?.length
      ? state.cashAccounts
      : [{ id: "cash-default", name: "Cash", isDefault: true as const }];
    const items: { id: string; label: string }[] = cashAccounts.map((a) => ({
      id: a.isDefault ? "liquidity" : `cash:${a.id}`,
      label: a.isDefault ? `${a.name} (default)` : a.name,
    }));
    if (!items.some((a) => a.id === "liquidity")) {
      items.unshift({ id: "liquidity", label: "Liquidity (cash)" });
    }
    for (const h of state.holdings ?? []) {
      items.push({ id: `holding:${h.id}`, label: `${h.symbol} · ${h.name}` });
    }
    for (const c of state.creditCards ?? []) {
      items.push({ id: `credit:${c.id}`, label: c.name });
    }
    return items;
  }, [state.holdings, state.creditCards, state.cashAccounts]);

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
    setRecurrence("monthly");
    setWhenSchedule("one-time");
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
      Alert.alert(
        t("common.checkFields", { defaultValue: "Check your entries" }),
        t("cashflow.needLabelAmount", { defaultValue: "Enter a label and an amount greater than 0." }),
      );
      return;
    }
    if (kind === "transfer" && fromAccount === toAccount) {
      Alert.alert(
        t("common.checkFields", { defaultValue: "Check your entries" }),
        t("cashflow.transferAccountsDiffer", {
          defaultValue: "From and to accounts must be different.",
        }),
      );
      return;
    }
    const cat =
      kind === "expense"
        ? expenseCats.find((c) => c.id === categoryId)?.name || source.trim()
        : kind === "income"
          ? incomeCats.find((c) => c.id === categoryId)?.name ||
            incomeCats[0]?.name ||
            source.trim()
          : "Transfer";
    const count = Math.max(2, Math.min(60, parseInt(instCount, 10) || 3));
    const useInstallments = kind === "expense" && whenSchedule === "installments";
    const useRecurring = whenSchedule === "recurring";
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
        useRecurring && !useInstallments
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
    setFormOpen(false);
  }

  function openAddForm() {
    resetForm();
    setFormOpen(true);
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
    setRecurrence(entry.recurrence?.frequency ?? "monthly");
    if (entry.installmentPlan) setWhenSchedule("installments");
    else if (entry.recurrence) setWhenSchedule("recurring");
    else setWhenSchedule("one-time");
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
    } else if (entry.kind === "income") {
      const cat = incomeCats.find((c) => c.name === entry.category || c.name === entry.source);
      setCategoryId(cat?.id ?? null);
    } else {
      setCategoryId(null);
    }
    setMode("activity");
    setFormOpen(true);
  }

  function onDelete(id: string, parentId: string, isOccurrence: boolean) {
    const target = isOccurrence ? parentId : id;
    const entry = state.cashflows.find((c) => c.id === target);
    const isRecurring = !!entry?.recurrence || isOccurrence;
    Alert.alert(
      t("common.delete", { defaultValue: "Delete" }),
      isRecurring
        ? t("more.entriesDeleteRecurringConfirm", {
            defaultValue: "Delete the entire recurring entry and all its occurrences?",
          })
        : t("cashflow.deleteConfirm", { defaultValue: "Remove this cashflow entry?" }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("common.delete", { defaultValue: "Delete" }),
          style: "destructive",
          onPress: () => removeCashflow(target),
        },
      ],
    );
  }

  const periods: { id: Period; label: string }[] = [
    { id: "this-month", label: "This month" },
    { id: "last-month", label: "Last month" },
    { id: "ytd", label: "YTD" },
    { id: "all", label: "All" },
  ];

  const kindFilterLabels: Record<typeof kindFilter, string> = {
    all: t("more.entriesAll", { defaultValue: "All" }),
    income: t("more.entriesIncome", { defaultValue: "Income" }),
    expense: t("cashflow.expense", { defaultValue: "Expense" }),
    transfer: t("cashflow.transfer", { defaultValue: "Transfer" }),
  };

  return (
    <Screen avoidKeyboard={false}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Header title={t("nav.cashflow")} subtitle={t("cashflow.subtitle")} />
        <ScreenStack>

        <SegmentedControl
          options={[
            { id: "activity" as const, label: t("cashflow.mode.activity") },
            { id: "upcoming" as const, label: t("cashflow.mode.upcoming") },
            { id: "insights" as const, label: t("cashflow.mode.insights") },
            { id: "accounts" as const, label: t("cashflow.mode.accounts") },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === "activity" ? (
          <>
            <SegmentedControl
              options={periods.map((p) => ({ id: p.id, label: p.label }))}
              value={period}
              onChange={setPeriod}
            />
            <SegmentedControl
              options={(["all", "income", "expense", "transfer"] as const).map((k) => ({
                id: k,
                label: kindFilterLabels[k],
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
                  label={t("more.entriesAll", { defaultValue: "All" })}
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
              <MetricRow
                items={[
                  { label: `Income (${currency})`, value: mask(totals.income) },
                  { label: "Expenses", value: mask(totals.expense) },
                  { label: "Net", value: mask(totals.net) },
                  { label: "Liquidity impact", value: mask(totals.liquidity) },
                ]}
              />
              <View style={styles.buttonStack}>
                <PrimaryButton
                  compact
                  style={styles.buttonStackItem}
                  label={t("cashflow.addEntry", { defaultValue: "Add entry" })}
                  onPress={openAddForm}
                />
                <PrimaryButton
                  compact
                  style={styles.buttonStackItem}
                  label="Export period CSV"
                  onPress={() => void exportCsv()}
                />
                <PrimaryButton
                  compact
                  style={styles.buttonStackItem}
                  label={t("cashflow.exportPdf", { defaultValue: "Export PDF" })}
                  onPress={() => void exportPdf()}
                />
              </View>
            </Card>

            <Card>
              <CardTitle>{t("cashflow.upcoming.previewTitle")}</CardTitle>
              <CashflowUpcoming
                cashflows={state.cashflows}
                mask={mask}
                toDisplay={toDisplay}
                compact
                limit={5}
                initialDays={7}
                onViewAll={() => setMode("upcoming")}
                onEdit={(id) => {
                  onEdit(id);
                }}
              />
            </Card>

            <FormSheet
              visible={formOpen}
              title={editingId ? "Edit entry" : "Add entry"}
              onClose={() => {
                resetForm();
                setFormOpen(false);
              }}
              footer={
                <View style={styles.buttonStack}>
                  <PrimaryButton
                    label={editingId ? "Save changes" : "Add entry"}
                    onPress={onAdd}
                    style={{ flex: 1 }}
                  />
                  <SecondaryButton
                    label="Cancel"
                    onPress={() => {
                      resetForm();
                      setFormOpen(false);
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              }
            >
                <View style={styles.row}>
                  <Pressable
                    onPress={() => {
                      setKind("expense");
                      setCategoryId(null);
                    }}
                    style={[styles.kindBtn, kind === "expense" && styles.kindBtnActiveExpense]}
                  >
                    <Text style={styles.kindText}>Expense</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setKind("income");
                      setCategoryId(incomeCats[0]?.id ?? null);
                    }}
                    style={[styles.kindBtn, kind === "income" && styles.kindBtnActiveIncome]}
                  >
                    <Text style={styles.kindText}>Income</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setKind("transfer");
                      setCategoryId(null);
                    }}
                    style={[styles.kindBtn, kind === "transfer" && styles.kindBtnActiveTransfer]}
                  >
                    <Text style={styles.kindText}>Transfer</Text>
                  </Pressable>
                </View>
                {kind === "expense" || kind === "income" ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.catRow}
                  >
                    {(kind === "expense" ? expenseCats : incomeCats).map((c) => (
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
                {kind === "transfer" ? (
                  <CardHelperText>{t("cashflow.transferHint")}</CardHelperText>
                ) : null}
                <Field
                  label={
                    kind === "income"
                      ? t("cashflow.source", { defaultValue: "Source" })
                      : kind === "transfer"
                        ? t("cashflow.transferLabel", { defaultValue: "Transfer label" })
                        : t("cashflow.description", { defaultValue: "Description" })
                  }
                >
                  <TextInput
                    style={styles.input}
                    placeholder={
                      kind === "income"
                        ? "e.g. Salary"
                        : kind === "transfer"
                          ? "e.g. Card payment"
                          : "e.g. groceries"
                    }
                    placeholderTextColor={colors.muted}
                    value={source}
                    onChangeText={setSource}
                  />
                </Field>
                <Field
                  label={
                    amountKind === "percent"
                      ? t("cashflow.percent", { defaultValue: "Percent" })
                      : t("cashflow.amount", { defaultValue: "Amount" })
                  }
                >
                  <TextInput
                    style={styles.input}
                    placeholder={amountKind === "percent" ? "e.g. 10" : "0.00"}
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </Field>
                <Field label={t("cashflow.date", { defaultValue: "Date (YYYY-MM-DD)" })}>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                    value={entryDate}
                    onChangeText={setEntryDate}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
                <Field label={t("cashflow.currency", { defaultValue: "Currency" })}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.catRow}
                  >
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
                </Field>
                {kind === "transfer" ? (
                  <>
                    <Field label={t("cashflow.from", { defaultValue: "From" })}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.catRow}
                      >
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
                    </Field>
                    <Field label={t("cashflow.to", { defaultValue: "To" })}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.catRow}
                      >
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
                    </Field>
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
                        style={[
                          styles.kindBtn,
                          amountKind === "percent" && styles.kindBtnActiveTransfer,
                        ]}
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
                    <Field label={t("cashflow.paidFrom", { defaultValue: "Paid from" })}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.catRow}
                      >
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
                    </Field>
                  </>
                ) : null}
                {kind !== "transfer" && amountKind === "fixed" ? (
                  <>
                    <Text style={styles.label}>{t("cashflow.upcoming.whenLabel")}</Text>
                    <View style={styles.row}>
                      {(
                        [
                          ["one-time", t("cashflow.none")],
                          ["recurring", t("cashflow.recurrence")],
                          ...(kind === "expense"
                            ? [
                                [
                                  "installments",
                                  t("cashflow.splitInstallments", { defaultValue: "Installments" }),
                                ],
                              ]
                            : []),
                        ] as const
                      ).map(([mode, label]) => (
                        <Pressable
                          key={mode}
                          onPress={() => {
                            setWhenSchedule(mode as "recurring" | "one-time" | "installments");
                            setInstallments(mode === "installments");
                          }}
                          style={[
                            styles.kindBtn,
                            whenSchedule === mode && styles.kindBtnActiveIncome,
                          ]}
                        >
                          <Text style={styles.kindText}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {whenSchedule === "installments" ? (
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
                    {whenSchedule === "recurring" ? (
                      <>
                        <Text style={styles.label}>
                          {t("cashflow.frequency", { defaultValue: "Frequency" })}
                        </Text>
                        <View style={styles.row}>
                          {(["weekly", "monthly", "yearly"] as const).map((r) => (
                            <Pressable
                              key={r}
                              onPress={() => setRecurrence(r)}
                              style={[styles.kindBtn, recurrence === r && styles.kindBtnActiveIncome]}
                            >
                              <Text style={styles.kindText}>{r}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Field
                          label={t("cashflow.until", { defaultValue: "Until (optional YYYY-MM-DD)" })}
                          hint={t("cashflow.untilHint", {
                            defaultValue: "Leave empty for ongoing",
                          })}
                        >
                          <TextInput
                            style={styles.input}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={colors.muted}
                            value={recurUntil}
                            onChangeText={setRecurUntil}
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                        </Field>
                      </>
                    ) : null}
                  </>
                ) : null}
            </FormSheet>

            <CardTitle>Entries ({rows.length})</CardTitle>
            {rows.length === 0 ? (
              <EmptyState
                title={t("cashflow.emptyTitle", { defaultValue: "No entries yet" })}
                body={t("cashflow.emptyFlow", {
                  defaultValue: "Add some income and expenses to see your cashflow.",
                })}
                actionLabel={t("cashflow.addFirst", { defaultValue: "Add your first entry" })}
                onAction={openAddForm}
              />
            ) : (
              <>
                {rows.map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => onEdit(r.parentId || r.id)}
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
                <CardHelperText style={styles.centerHint}>
                  Tap to edit · Long-press to delete
                  {rows.some((r) => r.isOccurrence)
                    ? " · recurring rows edit the parent entry"
                    : ""}
                  .
                </CardHelperText>
              </>
            )}
          </>
        ) : null}

        {mode === "upcoming" ? (
          <>
            <CardCopy>
              <CardTitle>{t("cashflow.upcoming.title")}</CardTitle>
              <CardHelperText>{t("cashflow.upcoming.description")}</CardHelperText>
            </CardCopy>
            <CashflowUpcoming
              cashflows={state.cashflows}
              mask={mask}
              toDisplay={toDisplay}
              onEdit={(id) => {
                setMode("activity");
                onEdit(id);
              }}
            />
          </>
        ) : null}

        {mode === "insights" ? (
          <>
            <SegmentedControl
              options={periods.map((p) => ({ id: p.id, label: p.label }))}
              value={period}
              onChange={setPeriod}
            />
            <Card>
              <MetricRow
                items={[
                  { label: `Income (${currency})`, value: mask(totals.income) },
                  { label: "Expenses", value: mask(totals.expense) },
                  { label: "Net", value: mask(totals.net) },
                ]}
              />
            </Card>
            <View style={styles.rowBetween}>
              <CardTitle>By category</CardTitle>
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
              <CardTitle>Sankey</CardTitle>
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
            {showSankey ? (
              sankeyData && (expenseSlices.length > 0 || incomeSlices.length > 0) ? (
                <SankeyChart data={sankeyData} height={340} format={(v) => fmt(v)} />
              ) : (
                <EmptyState
                  title={t("cashflow.sankeyEmptyTitle", { defaultValue: "Not enough data" })}
                  body={t("cashflow.emptyFlow", {
                    defaultValue: "Add some income and expenses to see the flow.",
                  })}
                  actionLabel={t("cashflow.goActivity", { defaultValue: "Add entries" })}
                  onAction={() => setMode("activity")}
                />
              )
            ) : null}
          </>
        ) : null}

        {mode === "accounts" ? (
          <>
            <Card>
              <CardHelperText>{t("cashflow.accountsExplainer")}</CardHelperText>
            </Card>
            <CreditCardsManager />
            <CategoriesManager />
          </>
        ) : null}
        </ScreenStack>
      </ScrollView>
    </Screen>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  buttonStack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "stretch",
  },
  buttonStackItem: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 140,
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: {
    ...chipContainerStyle,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pillText: { ...chipLabelStyle, color: colors.muted },
  pillTextActive: { color: colors.text, fontWeight: "600" },
  label: { color: colors.muted, marginBottom: spacing.sm },
  row: { flexDirection: "row", marginBottom: spacing.sm, gap: 8 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  link: { color: colors.accent, fontSize: 13 },
  kindBtn: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  kindBtnActiveExpense: { borderColor: colors.expense, backgroundColor: "#ef444422" },
  kindBtnActiveIncome: { borderColor: colors.income, backgroundColor: "#22c55e22" },
  kindBtnActiveTransfer: { borderColor: colors.accent, backgroundColor: "#3d9a8b22" },
  kindText: { ...chipLabelStyle, color: colors.text },
  catRow: { marginBottom: 8 },
  catChip: {
    ...chipContainerStyle,
    paddingHorizontal: 10,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  catChipText: { ...chipLabelStyle, color: colors.text },
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
  centerHint: { textAlign: "center" },
});
}
