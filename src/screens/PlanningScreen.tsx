import React, { useMemo, useState } from "react";
import { ScrollView, Text, StyleSheet, TextInput, Alert, View, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import {
  Screen,
  Header,
  Card,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  Metric,
  MetricRow,
  EmptyState,
  Field,
  SegmentedControl,
  FormSheet,
  chipLabelStyle,
  chipContainerStyle,
} from "@/components/ui";
import { ChartFrame } from "@/components/ChartFrame";
import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { useStore, useMoney } from "@/lib/store";
import { amortize } from "@/lib/finance/amortization";
import { expandCashflows, valuesByEntry } from "@/lib/cashflow-math";
import { spacing } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";
import { PALETTE, type SavingsGoal, type Loan, type ForecastScenario, type BudgetPlan, type BudgetPeriodType } from "@/lib/types";
import { computePlanWindow, spentByCategoryId } from "@/lib/budget-window";

export function PlanningScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const {
    state,
    addGoal,
    updateGoal,
    removeGoal,
    addBudgetPlan,
    updateBudgetPlan,
    removeBudgetPlan,
    duplicateBudgetPlan,
    setMainBudgetPlan,
    addBudgetItem,
    updateBudgetItem,
    removeBudgetItem,
    addLoan,
    updateLoan,
    removeLoan,
    addForecastScenario,
    updateForecastScenario,
    removeForecastScenario,
    duplicateForecastScenario,
    setMainForecastScenario,
  } = useStore();
  const { mask, currency, toDisplay } = useMoney();

  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [loanName, setLoanName] = useState("");
  const [loanPrincipal, setLoanPrincipal] = useState("");
  const [loanApr, setLoanApr] = useState("5");
  const [loanMonths, setLoanMonths] = useState("120");
  const [loanExtra, setLoanExtra] = useState("");
  const [tab, setTab] = useState<"goals" | "budgets" | "loans" | "forecast">("goals");
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addLoanOpen, setAddLoanOpen] = useState(false);

  const [editGoal, setEditGoal] = useState<SavingsGoal | null>(null);
  const [gName, setGName] = useState("");
  const [gTarget, setGTarget] = useState("");
  const [gCurrent, setGCurrent] = useState("");
  const [gDate, setGDate] = useState("");
  const [gNotes, setGNotes] = useState("");

  const [editLoan, setEditLoan] = useState<Loan | null>(null);
  const [lName, setLName] = useState("");
  const [lPrincipal, setLPrincipal] = useState("");
  const [lApr, setLApr] = useState("");
  const [lMonths, setLMonths] = useState("");
  const [lExtra, setLExtra] = useState("");
  const [lNotes, setLNotes] = useState("");
  const [showSchedule, setShowSchedule] = useState<string | null>(null);

  const [editPlan, setEditPlan] = useState<BudgetPlan | null>(null);
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pPeriodType, setPPeriodType] = useState<BudgetPeriodType>("monthly");
  const [pPeriodDays, setPPeriodDays] = useState("30");
  const [lineLabel, setLineLabel] = useState("");
  const [lineAmount, setLineAmount] = useState("");
  const [lineCategoryId, setLineCategoryId] = useState<string | null>(null);
  const [editLineId, setEditLineId] = useState<string | null>(null);

  const [editScenario, setEditScenario] = useState<ForecastScenario | null>(null);
  const [sName, setSName] = useState("");
  const [sMonths, setSMonths] = useState("12");
  const [sInc, setSInc] = useState("0");
  const [sExp, setSExp] = useState("0");
  const [sNotes, setSNotes] = useState("");

  const monthly = useMemo(() => {
    const until = new Date();
    const start = new Date(until.getFullYear(), until.getMonth(), 1);
    const expanded = expandCashflows(state.cashflows, until).filter((e) => {
      const d = new Date(e.date);
      return d >= start && d <= until;
    });
    const values = valuesByEntry(expanded, toDisplay);
    let income = 0;
    let expense = 0;
    for (const e of expanded) {
      const v = values.get(e.id) ?? 0;
      if (e.kind === "income") income += v;
      if (e.kind === "expense") expense += v;
    }
    return { income, expense, surplus: income - expense };
  }, [state.cashflows, toDisplay]);

  function onAddGoal() {
    const target = Number(goalTarget);
    if (!goalName.trim() || !isFinite(target) || target <= 0) {
      Alert.alert(
        t("common.checkFields", { defaultValue: "Check your entries" }),
        t("planning.goals.needNameTarget", {
          defaultValue: "Enter a name and target amount.",
        }),
      );
      return;
    }
    addGoal({
      name: goalName.trim(),
      targetAmount: target,
      currentAmount: 0,
      targetDate: goalDate.trim() || undefined,
      color: colors.accent,
      currency,
    });
    setGoalName("");
    setGoalTarget("");
    setGoalDate("");
    setAddGoalOpen(false);
  }

  function openGoal(g: SavingsGoal) {
    setEditGoal(g);
    setGName(g.name);
    setGTarget(String(g.targetAmount));
    setGCurrent(String(g.currentAmount));
    setGDate(g.targetDate?.slice(0, 10) ?? "");
    setGNotes(g.notes ?? "");
  }

  function saveGoal() {
    if (!editGoal) return;
    const target = Number(gTarget);
    const current = Number(gCurrent);
    if (!gName.trim() || !isFinite(target) || target <= 0 || !isFinite(current) || current < 0) {
      Alert.alert("Invalid", "Check name, target, and current amounts");
      return;
    }
    updateGoal(editGoal.id, {
      name: gName.trim(),
      targetAmount: target,
      currentAmount: current,
      targetDate: gDate.trim() || undefined,
      notes: gNotes.trim() || undefined,
    });
    setEditGoal(null);
  }

  function onAddLoan() {
    const principal = Number(loanPrincipal);
    const apr = Number(loanApr);
    const termMonths = Number(loanMonths);
    const extra = loanExtra.trim() ? Number(loanExtra) : undefined;
    if (!loanName.trim() || !isFinite(principal) || principal <= 0) {
      Alert.alert("Invalid", "Enter loan name and principal");
      return;
    }
    addLoan({
      name: loanName.trim(),
      principal,
      apr: isFinite(apr) ? apr : 0,
      termMonths: Math.max(1, termMonths || 12),
      startDate: new Date().toISOString(),
      extraMonthly: extra != null && isFinite(extra) ? extra : undefined,
      color: PALETTE[(state.loans?.length ?? 0) % PALETTE.length]!,
      currency,
    });
    setLoanName("");
    setLoanPrincipal("");
    setLoanExtra("");
    setAddLoanOpen(false);
  }

  function openLoan(loan: Loan) {
    setEditLoan(loan);
    setLName(loan.name);
    setLPrincipal(String(loan.principal));
    setLApr(String(loan.apr));
    setLMonths(String(loan.termMonths));
    setLExtra(loan.extraMonthly != null ? String(loan.extraMonthly) : "");
    setLNotes(loan.notes ?? "");
  }

  function saveLoan() {
    if (!editLoan) return;
    const principal = Number(lPrincipal);
    const apr = Number(lApr);
    const termMonths = Number(lMonths);
    const extra = lExtra.trim() ? Number(lExtra) : undefined;
    if (!lName.trim() || !isFinite(principal) || principal <= 0) {
      Alert.alert("Invalid", "Check loan fields");
      return;
    }
    updateLoan(editLoan.id, {
      name: lName.trim(),
      principal,
      apr: isFinite(apr) ? apr : 0,
      termMonths: Math.max(1, termMonths || 12),
      extraMonthly: extra != null && isFinite(extra) ? extra : undefined,
      notes: lNotes.trim() || undefined,
    });
    setEditLoan(null);
  }

  function openPlan(p: BudgetPlan) {
    setEditPlan(p);
    setPName(p.name);
    setPDesc(p.description ?? "");
    setPPeriodType(p.periodType ?? "monthly");
    setPPeriodDays(String(p.periodDays ?? 30));
    setEditLineId(null);
    setLineLabel("");
    setLineAmount("");
    setLineCategoryId(null);
  }

  function savePlanMeta() {
    if (!editPlan) return;
    if (!pName.trim()) {
      Alert.alert("Invalid", "Plan name required");
      return;
    }
    const days = Math.max(1, Math.min(3650, parseInt(pPeriodDays, 10) || 30));
    updateBudgetPlan(editPlan.id, {
      name: pName.trim(),
      description: pDesc.trim() || undefined,
      periodType: pPeriodType,
      periodDays: pPeriodType === "custom" ? days : undefined,
    });
    setEditPlan(null);
  }

  function saveBudgetLine() {
    if (!editPlan) return;
    const amount = Number(lineAmount);
    if (!lineLabel.trim() || !isFinite(amount) || amount < 0) {
      Alert.alert("Invalid", "Enter line label and amount");
      return;
    }
    if (editLineId) {
      updateBudgetItem(editPlan.id, editLineId, {
        label: lineLabel.trim(),
        amount,
        currency,
        categoryId: lineCategoryId || undefined,
      });
    } else {
      addBudgetItem(editPlan.id, {
        label: lineLabel.trim(),
        amount,
        currency,
        categoryId: lineCategoryId || undefined,
      });
    }
    setLineLabel("");
    setLineAmount("");
    setLineCategoryId(null);
    setEditLineId(null);
  }

  const expenseCats = useMemo(
    () => state.categories.filter((c) => c.kind === "expense"),
    [state.categories],
  );

  const planSpendMaps = useMemo(() => {
    const maps = new Map<string, Map<string, number>>();
    for (const p of state.budgetPlans ?? []) {
      const window = computePlanWindow(p);
      maps.set(p.id, spentByCategoryId(state.cashflows, state.categories, window, toDisplay));
    }
    return maps;
  }, [state.budgetPlans, state.cashflows, state.categories, toDisplay]);

  const catNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of state.categories) m.set(c.id, c.name);
    return m;
  }, [state.categories]);

  function openScenario(s: ForecastScenario) {
    setEditScenario(s);
    setSName(s.name);
    setSMonths(String(s.months));
    setSInc(String(s.monthlyIncomeAdjust ?? 0));
    setSExp(String(s.monthlyExpenseAdjust ?? 0));
    setSNotes(s.notes ?? s.description ?? "");
  }

  function saveScenario() {
    if (!editScenario) return;
    const months = Math.max(1, Math.min(60, parseInt(sMonths, 10) || 12));
    const incomeAdj = Number(sInc) || 0;
    const expenseAdj = Number(sExp) || 0;
    if (!sName.trim()) {
      Alert.alert("Invalid", "Scenario name required");
      return;
    }
    updateForecastScenario(editScenario.id, {
      name: sName.trim(),
      months,
      monthlyIncomeAdjust: incomeAdj,
      monthlyExpenseAdjust: expenseAdj,
      notes: sNotes.trim() || undefined,
    });
    setEditScenario(null);
  }

  const mainPlan = state.budgetPlans.find((p) => p.id === state.mainBudgetPlanId);
  const mainScenario =
    state.forecastScenarios.find((s) => s.id === state.mainForecastScenarioId) ??
    state.forecastScenarios[0];

  const forecast = useMemo(() => {
    if (!mainScenario) return [];
    const months = mainScenario.months || 6;
    const inc = monthly.income + (mainScenario.monthlyIncomeAdjust || 0);
    const exp = monthly.expense + (mainScenario.monthlyExpenseAdjust || 0);
    let bal = 0;
    const out: { m: number; bal: number; net: number }[] = [];
    for (let i = 1; i <= months; i++) {
      const net = inc - exp;
      bal += net;
      out.push({ m: i, bal, net });
    }
    return out;
  }, [mainScenario, monthly]);

  // Live plan while editing lines
  const livePlan = editPlan
    ? state.budgetPlans.find((p) => p.id === editPlan.id) ?? editPlan
    : null;

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Header
          title={t("nav.planning", { defaultValue: "Planning" })}
          subtitle={t("planning.subtitle", {
            defaultValue: "Goals, budgets, loans, and forecasts",
          })}
        />
        <Card>
          <MetricRow
            items={[
              { label: "This month income", value: mask(monthly.income) },
              { label: "This month expenses", value: mask(monthly.expense) },
              { label: "Surplus", value: mask(monthly.surplus) },
            ]}
          />
        </Card>

        <SegmentedControl
          options={[
            {
              id: "goals" as const,
              label: t("planning.tabs.goals", { defaultValue: "Goals" }),
            },
            {
              id: "budgets" as const,
              label: t("planning.tabs.budgets", { defaultValue: "Budgets" }),
            },
            {
              id: "loans" as const,
              label: t("planning.tabs.loans", { defaultValue: "Loans" }),
            },
            {
              id: "forecast" as const,
              label: t("planning.tabs.forecast", { defaultValue: "Forecast" }),
            },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "goals" ? (
          <>
            <Card>
              <Text style={styles.section}>
                {t("planning.goals.title", { defaultValue: "Savings goals" })}
              </Text>
              <Text style={styles.meta}>{t("planning.goals.manualHint")}</Text>
              <PrimaryButton
                label={t("planning.goals.add", { defaultValue: "Add goal" })}
                onPress={() => setAddGoalOpen(true)}
              />
            </Card>
            <FormSheet
              visible={addGoalOpen}
              title={t("planning.goals.add", { defaultValue: "Add goal" })}
              onClose={() => setAddGoalOpen(false)}
              footer={
                <View style={styles.row}>
                  <PrimaryButton
                    style={{ flex: 1 }}
                    label={t("planning.goals.add", { defaultValue: "Add goal" })}
                    onPress={onAddGoal}
                  />
                  <SecondaryButton
                    style={{ flex: 1 }}
                    label={t("common.cancel", { defaultValue: "Cancel" })}
                    onPress={() => setAddGoalOpen(false)}
                  />
                </View>
              }
            >
              <Field label={t("planning.goals.name", { defaultValue: "Goal name" })}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Emergency fund"
                  placeholderTextColor={colors.muted}
                  value={goalName}
                  onChangeText={setGoalName}
                />
              </Field>
              <Field label={t("planning.goals.target", { defaultValue: "Target amount" })}>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                />
              </Field>
              <Field
                label={t("planning.goals.date", { defaultValue: "Target date (optional)" })}
              >
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  value={goalDate}
                  onChangeText={setGoalDate}
                  autoCapitalize="none"
                />
              </Field>
            </FormSheet>
            {(state.goals ?? []).length === 0 ? (
              <EmptyState
                title={t("planning.goals.empty", { defaultValue: "No goals yet" })}
                body={t("planning.goals.emptyBody", {
                  defaultValue: "Set a savings target to track progress toward something that matters.",
                })}
                actionLabel={t("planning.goals.add", { defaultValue: "Add goal" })}
                onAction={() => setAddGoalOpen(true)}
              />
            ) : null}
            {(state.goals ?? []).map((g) => {
              const pct = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
              return (
                <Card key={g.id}>
                  <Text style={styles.title}>{g.name}</Text>
                  {g.targetDate ? (
                    <Text style={styles.meta}>Target date: {g.targetDate.slice(0, 10)}</Text>
                  ) : null}
                  {g.notes ? <Text style={styles.meta}>{g.notes}</Text> : null}
                  <Metric
                    label="Progress"
                    value={`${mask(g.currentAmount)} / ${mask(g.targetAmount)} (${pct.toFixed(0)}%)`}
                  />
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.min(100, pct)}%` }]} />
                  </View>
                  <View style={styles.row}>
                    <PrimaryButton
                      compact
                      style={{ flex: 1 }}
                      label="+ Contribute"
                      onPress={() => {
                        const step = Math.max(1, Math.round(g.targetAmount * 0.05));
                        updateGoal(g.id, {
                          currentAmount: Math.min(g.targetAmount, g.currentAmount + step),
                        });
                      }}
                    />
                    <SecondaryButton
                      compact
                      style={{ flex: 1 }}
                      label={t("common.edit", { defaultValue: "Edit" })}
                      onPress={() => openGoal(g)}
                    />
                    <DangerButton
                      compact
                      style={{ flex: 1 }}
                      label={t("common.delete", { defaultValue: "Delete" })}
                      onPress={() => {
                        Alert.alert(
                          t("planning.goals.deleteTitle", { defaultValue: "Delete goal?" }),
                          t("planning.goals.deleteBody", {
                            defaultValue: `Remove “${g.name}”?`,
                            name: g.name,
                          }),
                          [
                            { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
                            {
                              text: t("common.delete", { defaultValue: "Delete" }),
                              style: "destructive",
                              onPress: () => removeGoal(g.id),
                            },
                          ],
                        );
                      }}
                    />
                  </View>
                </Card>
              );
            })}
            <FormSheet
              visible={!!editGoal}
              title="Edit goal"
              onClose={() => setEditGoal(null)}
              footer={
                <View style={styles.row}>
                  <PrimaryButton style={{ flex: 1 }} label="Save" onPress={saveGoal} />
                  <SecondaryButton
                    style={{ flex: 1 }}
                    label="Cancel"
                    onPress={() => setEditGoal(null)}
                  />
                </View>
              }
            >
              <Field label="Name">
                <TextInput
                  style={styles.input}
                  value={gName}
                  onChangeText={setGName}
                  placeholder="Name"
                  placeholderTextColor={colors.muted}
                />
              </Field>
              <Field label="Target">
                <TextInput
                  style={styles.input}
                  value={gTarget}
                  onChangeText={setGTarget}
                  placeholder="Target"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Current">
                <TextInput
                  style={styles.input}
                  value={gCurrent}
                  onChangeText={setGCurrent}
                  placeholder="Current"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Target date YYYY-MM-DD">
                <TextInput
                  style={styles.input}
                  value={gDate}
                  onChangeText={setGDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                />
              </Field>
              <Field label="Notes">
                <TextInput
                  style={[styles.input, styles.notes]}
                  value={gNotes}
                  onChangeText={setGNotes}
                  placeholder="Notes"
                  placeholderTextColor={colors.muted}
                  multiline
                />
              </Field>
            </FormSheet>
          </>
        ) : null}

        {tab === "budgets" ? (
          <>
            <Card>
              <Text style={styles.section}>Budget plans</Text>
              <Text style={styles.meta}>
                {t("planning.budgets.linkHint", {
                  defaultValue:
                    "Link budget lines to an expense category so spent amounts roll up automatically.",
                })}
              </Text>
              <PrimaryButton
                label="Create budget plan"
                onPress={() => addBudgetPlan(`Plan ${(state.budgetPlans?.length ?? 0) + 1}`)}
              />
            </Card>
            {(state.budgetPlans ?? []).length === 0 ? (
              <EmptyState
                title={t("planning.budgets.empty", {
                  defaultValue: "No budgets yet. Add a monthly limit to a category to stay on track.",
                })}
                body={t("planning.budgets.emptyBody", {
                  defaultValue: "Create a plan, then add lines with amounts and optional categories.",
                })}
                actionLabel={t("planning.budgets.create", { defaultValue: "Create budget plan" })}
                onAction={() => addBudgetPlan(`Plan ${(state.budgetPlans?.length ?? 0) + 1}`)}
              />
            ) : null}
            {mainPlan && mainPlan.items.length > 0 ? (
              <CategoryBreakdown
                title={t("planning.budgets.pieTitle", {
                  defaultValue: `${mainPlan.name} · allocation`,
                  name: mainPlan.name,
                })}
                filename="budget-allocation"
                slices={mainPlan.items.map((it, i) => ({
                  label:
                    it.label?.trim() ||
                    (it.categoryId ? catNameById.get(it.categoryId) : undefined) ||
                    t("planning.budgets.untitledItem", { defaultValue: "Untitled" }),
                  value: toDisplay(it.amount, it.currency),
                  color:
                    it.color ||
                    (it.categoryId
                      ? state.categories.find((c) => c.id === it.categoryId)?.color
                      : undefined) ||
                    PALETTE[i % PALETTE.length]!,
                }))}
                format={(n) => mask(n)}
                emptyLabel="No budget lines yet."
              />
            ) : null}
            {(state.budgetPlans ?? []).map((p) => {
              const total = p.items.reduce((s, it) => s + toDisplay(it.amount, it.currency), 0);
              const window = computePlanWindow(p);
              const spentMap = planSpendMaps.get(p.id) ?? new Map();
              let spentTotal = 0;
              for (const it of p.items) {
                if (it.categoryId) spentTotal += spentMap.get(it.categoryId) ?? 0;
              }
              return (
                <Card key={p.id}>
                  <Text style={styles.title}>
                    {p.name}
                    {state.mainBudgetPlanId === p.id ? " · main" : ""}
                  </Text>
                  {p.description ? <Text style={styles.meta}>{p.description}</Text> : null}
                  <Text style={styles.meta}>Window: {window.label}</Text>
                  <MetricRow
                    items={[
                      { label: "Budgeted", value: mask(total) },
                      { label: "Spent (linked cats)", value: mask(spentTotal) },
                    ]}
                  />
                  <Text style={styles.meta}>{p.items.length} lines</Text>
                  <View style={styles.row}>
                    <PrimaryButton compact style={{ flex: 1 }} label="Set main" onPress={() => setMainBudgetPlan(p.id)} />
                    <SecondaryButton compact style={{ flex: 1 }} label="Edit" onPress={() => openPlan(p)} />
                    <SecondaryButton
                      compact
                      style={{ flex: 1 }}
                      label="Duplicate"
                      onPress={() => duplicateBudgetPlan(p.id)}
                    />
                    <DangerButton
                      compact
                      style={{ flex: 1 }}
                      label="Delete"
                      onPress={() => {
                        Alert.alert(
                          t("planning.budgets.deleteTitle", { defaultValue: "Delete plan?" }),
                          t("planning.budgets.deleteBody", {
                            defaultValue: `Remove “${p.name}” and its lines?`,
                            name: p.name,
                          }),
                          [
                            { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
                            {
                              text: t("common.delete", { defaultValue: "Delete" }),
                              style: "destructive",
                              onPress: () => removeBudgetPlan(p.id),
                            },
                          ],
                        );
                      }}
                    />
                  </View>
                  {p.items.map((it) => {
                    const budget = toDisplay(it.amount, it.currency);
                    const spent = it.categoryId ? (spentMap.get(it.categoryId) ?? 0) : null;
                    const pct = spent != null && budget > 0 ? Math.min(1, spent / budget) : 0;
                    const catLabel = it.categoryId
                      ? catNameById.get(it.categoryId) ?? "category"
                      : null;
                    const displayLabel =
                      it.label?.trim() ||
                      catLabel ||
                      t("planning.budgets.untitledItem", { defaultValue: "Untitled" });
                    return (
                      <View key={it.id} style={styles.budgetLine}>
                        <Text style={styles.meta}>
                          {displayLabel} · {mask(it.amount, it.currency)}
                          {catLabel && it.label?.trim() ? ` · ${catLabel}` : ""}
                        </Text>
                        {spent != null ? (
                          <>
                            <Text style={styles.meta}>
                              Spent {mask(spent)} / {mask(budget)}
                            </Text>
                            <View style={styles.barTrack}>
                              <View
                                style={[
                                  styles.barFill,
                                  {
                                    width: `${Math.round(pct * 100)}%`,
                                    backgroundColor:
                                      pct >= 1 ? colors.danger : colors.accent,
                                  },
                                ]}
                              />
                            </View>
                          </>
                        ) : null}
                      </View>
                    );
                  })}
                </Card>
              );
            })}
            <FormSheet
              visible={!!editPlan}
              title="Edit plan"
              onClose={() => {
                setEditPlan(null);
                setEditLineId(null);
                setLineCategoryId(null);
              }}
              footer={
                <SecondaryButton
                  label="Close"
                  onPress={() => {
                    setEditPlan(null);
                    setEditLineId(null);
                    setLineCategoryId(null);
                  }}
                />
              }
            >
              {livePlan ? (
                <>
                <TextInput
                  style={styles.input}
                  value={pName}
                  onChangeText={setPName}
                  placeholder="Plan name"
                  placeholderTextColor={colors.muted}
                />
                <TextInput
                  style={[styles.input, styles.notes]}
                  value={pDesc}
                  onChangeText={setPDesc}
                  placeholder="Description"
                  placeholderTextColor={colors.muted}
                  multiline
                />
                <Text style={styles.meta}>Budget window</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
                  {(
                    ["daily", "weekly", "biweekly", "monthly", "yearly", "custom"] as BudgetPeriodType[]
                  ).map((pt) => (
                    <Pressable
                      key={pt}
                      onPress={() => setPPeriodType(pt)}
                      style={[styles.catChip, pPeriodType === pt && styles.catChipOn]}
                    >
                      <Text style={styles.catChipText}>{pt}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {pPeriodType === "custom" ? (
                  <TextInput
                    style={styles.input}
                    value={pPeriodDays}
                    onChangeText={setPPeriodDays}
                    placeholder="Days (rolling window)"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                  />
                ) : null}
                <PrimaryButton label="Save plan details" onPress={savePlanMeta} />
                <Text style={[styles.section, { marginTop: 12 }]}>
                  {editLineId ? "Edit line" : "Add line"}
                </Text>
                <TextInput
                  style={styles.input}
                  value={lineLabel}
                  onChangeText={setLineLabel}
                  placeholder="Line label"
                  placeholderTextColor={colors.muted}
                />
                <TextInput
                  style={styles.input}
                  value={lineAmount}
                  onChangeText={setLineAmount}
                  placeholder="Amount"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.meta}>Link expense category (for vs actual)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
                  <Pressable
                    onPress={() => setLineCategoryId(null)}
                    style={[
                      styles.catChip,
                      !lineCategoryId && styles.catChipOn,
                    ]}
                  >
                    <Text style={styles.catChipText}>None</Text>
                  </Pressable>
                  {expenseCats.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        setLineCategoryId(c.id);
                        if (!lineLabel.trim()) setLineLabel(c.name);
                      }}
                      style={[
                        styles.catChip,
                        { borderColor: c.color },
                        lineCategoryId === c.id && styles.catChipOn,
                      ]}
                    >
                      <Text style={styles.catChipText}>{c.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <PrimaryButton
                  label={editLineId ? "Update line" : "Add line"}
                  onPress={saveBudgetLine}
                />
                {livePlan.items.map((it) => {
                  const spentMap = planSpendMaps.get(livePlan.id) ?? new Map();
                  const spent = it.categoryId ? (spentMap.get(it.categoryId) ?? 0) : null;
                  return (
                    <View key={it.id} style={styles.lineRow}>
                      <Text style={styles.meta}>
                        {it.label?.trim() ||
                          (it.categoryId ? catNameById.get(it.categoryId) : undefined) ||
                          t("planning.budgets.untitledItem", { defaultValue: "Untitled" })}{" "}
                        · {mask(it.amount, it.currency)}
                        {it.categoryId && it.label?.trim()
                          ? ` · ${catNameById.get(it.categoryId) ?? "cat"}`
                          : ""}
                        {spent != null ? ` · spent ${mask(spent)}` : ""}
                      </Text>
                      <View style={styles.row}>
                        <SecondaryButton
                          compact
                          label="Edit"
                          onPress={() => {
                            setEditLineId(it.id);
                            setLineLabel(it.label || "");
                            setLineAmount(String(it.amount));
                            setLineCategoryId(it.categoryId ?? null);
                          }}
                        />
                        <View style={{ width: 8 }} />
                        <DangerButton
                          compact
                          label="Delete"
                          onPress={() => {
                            Alert.alert(
                              t("planning.budgets.deleteLineTitle", {
                                defaultValue: "Delete line?",
                              }),
                              t("planning.budgets.deleteLineBody", {
                                defaultValue: "Remove this budget line?",
                              }),
                              [
                                {
                                  text: t("common.cancel", { defaultValue: "Cancel" }),
                                  style: "cancel",
                                },
                                {
                                  text: t("common.delete", { defaultValue: "Delete" }),
                                  style: "destructive",
                                  onPress: () => removeBudgetItem(livePlan.id, it.id),
                                },
                              ],
                            );
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
                </>
              ) : null}
            </FormSheet>
            {mainPlan ? <Text style={styles.hint}>Main plan: {mainPlan.name}</Text> : null}
          </>
        ) : null}

        {tab === "loans" ? (
          <>
            <Card>
              <Text style={styles.section}>Loans</Text>
              <PrimaryButton label="Add loan" onPress={() => setAddLoanOpen(true)} />
            </Card>
            <FormSheet
              visible={addLoanOpen}
              title="Add loan"
              onClose={() => setAddLoanOpen(false)}
              footer={
                <View style={styles.row}>
                  <PrimaryButton style={{ flex: 1 }} label="Add loan" onPress={onAddLoan} />
                  <SecondaryButton
                    style={{ flex: 1 }}
                    label="Cancel"
                    onPress={() => setAddLoanOpen(false)}
                  />
                </View>
              }
            >
              <TextInput
                style={styles.input}
                placeholder="Loan name"
                placeholderTextColor={colors.muted}
                value={loanName}
                onChangeText={setLoanName}
              />
              <TextInput
                style={styles.input}
                placeholder="Principal"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                value={loanPrincipal}
                onChangeText={setLoanPrincipal}
              />
              <TextInput
                style={styles.input}
                placeholder="APR %"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                value={loanApr}
                onChangeText={setLoanApr}
              />
              <TextInput
                style={styles.input}
                placeholder="Term (months)"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={loanMonths}
                onChangeText={setLoanMonths}
              />
              <TextInput
                style={styles.input}
                placeholder="Extra monthly (optional)"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                value={loanExtra}
                onChangeText={setLoanExtra}
              />
            </FormSheet>
            {(state.loans ?? []).length === 0 ? (
              <EmptyState
                title={t("planning.loans.empty", { defaultValue: "No loans yet" })}
                body={t("planning.loans.emptyBody", {
                  defaultValue: "Add a loan to see monthly payment and amortization.",
                })}
                actionLabel={t("planning.loans.add", { defaultValue: "Add loan" })}
                onAction={() => setAddLoanOpen(true)}
              />
            ) : null}
            {(state.loans ?? []).map((loan) => {
              const sched = amortize(loan);
              const open = showSchedule === loan.id;
              return (
                <Card key={loan.id}>
                  <Text style={styles.title}>{loan.name}</Text>
                  {loan.notes ? <Text style={styles.meta}>{loan.notes}</Text> : null}
                  <Metric
                    label="Monthly payment"
                    value={mask(sched.monthlyPayment, loan.currency)}
                  />
                  <Metric
                    label="Total interest"
                    value={mask(sched.totalInterest, loan.currency)}
                  />
                  <Metric label="Payoff" value={sched.payoffDate.slice(0, 10)} />
                  {loan.extraMonthly ? (
                    <Text style={styles.meta}>Extra monthly: {mask(loan.extraMonthly, loan.currency)}</Text>
                  ) : null}
                  <View style={styles.row}>
                    <SecondaryButton compact style={{ flex: 1 }} label="Edit" onPress={() => openLoan(loan)} />
                    <SecondaryButton
                      compact
                      style={{ flex: 1 }}
                      label={open ? "Hide schedule" : "Schedule"}
                      onPress={() => setShowSchedule(open ? null : loan.id)}
                    />
                    <DangerButton
                      compact
                      style={{ flex: 1 }}
                      label="Delete"
                      onPress={() => {
                        Alert.alert(
                          t("planning.loans.deleteTitle", { defaultValue: "Delete loan?" }),
                          t("planning.loans.deleteBody", {
                            defaultValue: `Remove “${loan.name}”?`,
                            name: loan.name,
                          }),
                          [
                            { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
                            {
                              text: t("common.delete", { defaultValue: "Delete" }),
                              style: "destructive",
                              onPress: () => removeLoan(loan.id),
                            },
                          ],
                        );
                      }}
                    />
                  </View>
                  {open
                    ? sched.rows.slice(0, 12).map((row) => (
                        <Text key={row.index} style={styles.meta}>
                          #{row.index} · pay {mask(row.payment, loan.currency)} · bal{" "}
                          {mask(row.balance, loan.currency)}
                        </Text>
                      ))
                    : null}
                  {open && sched.rows.length > 12 ? (
                    <Text style={styles.meta}>… {sched.rows.length - 12} more months</Text>
                  ) : null}
                </Card>
              );
            })}
            <FormSheet
              visible={!!editLoan}
              title="Edit loan"
              onClose={() => setEditLoan(null)}
              footer={
                <View style={styles.row}>
                  <PrimaryButton style={{ flex: 1 }} label="Save" onPress={saveLoan} />
                  <SecondaryButton style={{ flex: 1 }} label="Cancel" onPress={() => setEditLoan(null)} />
                </View>
              }
            >
              <TextInput
                style={styles.input}
                value={lName}
                onChangeText={setLName}
                placeholder="Name"
                placeholderTextColor={colors.muted}
              />
              <TextInput
                style={styles.input}
                value={lPrincipal}
                onChangeText={setLPrincipal}
                placeholder="Principal"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={styles.input}
                value={lApr}
                onChangeText={setLApr}
                placeholder="APR %"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={styles.input}
                value={lMonths}
                onChangeText={setLMonths}
                placeholder="Term months"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
              />
              <TextInput
                style={styles.input}
                value={lExtra}
                onChangeText={setLExtra}
                placeholder="Extra monthly"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.notes]}
                value={lNotes}
                onChangeText={setLNotes}
                placeholder="Notes"
                placeholderTextColor={colors.muted}
                multiline
              />
            </FormSheet>
          </>
        ) : null}

        {tab === "forecast" ? (
          <>
            <Card>
              <Text style={styles.section}>Forecast</Text>
              <PrimaryButton
                label="Add scenario"
                onPress={() =>
                  addForecastScenario({
                    name: `Scenario ${(state.forecastScenarios?.length ?? 0) + 1}`,
                    months: 12,
                    monthlyIncomeAdjust: 0,
                    monthlyExpenseAdjust: 0,
                    currency,
                  })
                }
              />
              {(state.forecastScenarios ?? []).length === 0 ? (
                <EmptyState
                  title={t("planning.forecast.empty", {
                    defaultValue: "Add a scenario to see a projection.",
                  })}
                  body={t("planning.forecast.emptyBody", {
                    defaultValue: "Scenarios adjust this month’s income and expenses forward.",
                  })}
                  actionLabel={t("planning.forecast.add", { defaultValue: "Add scenario" })}
                  onAction={() =>
                    addForecastScenario({
                      name: `Scenario ${(state.forecastScenarios?.length ?? 0) + 1}`,
                      months: 12,
                      monthlyIncomeAdjust: 0,
                      monthlyExpenseAdjust: 0,
                      currency,
                    })
                  }
                />
              ) : null}
              {(state.forecastScenarios ?? []).map((s) => (
                <View key={s.id} style={styles.lineRow}>
                  <Pressable onPress={() => setMainForecastScenario(s.id)}>
                    <Text style={styles.meta}>
                      {s.name} · {s.months} mo
                      {s.monthlyIncomeAdjust
                        ? ` · inc ${s.monthlyIncomeAdjust >= 0 ? "+" : ""}${s.monthlyIncomeAdjust}`
                        : ""}
                      {s.monthlyExpenseAdjust
                        ? ` · exp ${s.monthlyExpenseAdjust >= 0 ? "+" : ""}${s.monthlyExpenseAdjust}`
                        : ""}
                      {state.mainForecastScenarioId === s.id ? " · main" : ""}
                    </Text>
                  </Pressable>
                  <View style={styles.row}>
                    <SecondaryButton compact label="Edit" onPress={() => openScenario(s)} />
                    <View style={{ width: 8 }} />
                    <SecondaryButton
                      compact
                      label="Duplicate"
                      onPress={() => duplicateForecastScenario(s.id)}
                    />
                    <View style={{ width: 8 }} />
                    <DangerButton
                      compact
                      label="Delete"
                      onPress={() => {
                        Alert.alert(
                          t("planning.forecast.deleteTitle", {
                            defaultValue: "Delete scenario?",
                          }),
                          t("planning.forecast.deleteBody", {
                            defaultValue: `Remove “${s.name}”?`,
                            name: s.name,
                          }),
                          [
                            {
                              text: t("common.cancel", { defaultValue: "Cancel" }),
                              style: "cancel",
                            },
                            {
                              text: t("common.delete", { defaultValue: "Delete" }),
                              style: "destructive",
                              onPress: () => removeForecastScenario(s.id),
                            },
                          ],
                        );
                      }}
                    />
                  </View>
                </View>
              ))}
            </Card>
            <FormSheet
              visible={!!editScenario}
              title="Edit scenario"
              onClose={() => setEditScenario(null)}
              footer={
                <View style={styles.row}>
                  <PrimaryButton style={{ flex: 1 }} label="Save" onPress={saveScenario} />
                  <SecondaryButton
                    style={{ flex: 1 }}
                    label="Cancel"
                    onPress={() => setEditScenario(null)}
                  />
                </View>
              }
            >
              <TextInput
                style={styles.input}
                value={sName}
                onChangeText={setSName}
                placeholder="Name"
                placeholderTextColor={colors.muted}
              />
              <TextInput
                style={styles.input}
                value={sMonths}
                onChangeText={setSMonths}
                placeholder="Months (1–60)"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
              />
              <TextInput
                style={styles.input}
                value={sInc}
                onChangeText={setSInc}
                placeholder="Monthly income adjust"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={styles.input}
                value={sExp}
                onChangeText={setSExp}
                placeholder="Monthly expense adjust"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.notes]}
                value={sNotes}
                onChangeText={setSNotes}
                placeholder="Notes"
                placeholderTextColor={colors.muted}
                multiline
              />
            </FormSheet>
            <Card>
              <Text style={styles.title}>{mainScenario?.name ?? "Scenario"} projection</Text>
              {forecast.length > 0 ? (
                <ChartFrame filename="forecast-projection" title="Projected balance">
                  <View style={styles.forecastChart}>
                    {forecast.map((f) => {
                      const maxAbs = Math.max(
                        1,
                        ...forecast.map((x) => Math.abs(x.bal)),
                      );
                      const h = Math.max(4, Math.round((Math.abs(f.bal) / maxAbs) * 100));
                      return (
                        <View key={f.m} style={styles.forecastCol}>
                          <View style={styles.forecastBarWrap}>
                            <View
                              style={[
                                styles.forecastBar,
                                {
                                  height: `${h}%`,
                                  backgroundColor:
                                    f.bal >= 0 ? colors.success : colors.danger,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.forecastLabel}>{f.m}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.meta}>
                    Month {forecast[0]!.m}: {mask(forecast[0]!.bal)} → Month{" "}
                    {forecast[forecast.length - 1]!.m}:{" "}
                    {mask(forecast[forecast.length - 1]!.bal)}
                  </Text>
                </ChartFrame>
              ) : (
                <Text style={styles.meta}>Add a scenario to see a projection.</Text>
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  section: { color: colors.text, fontWeight: "600", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    marginBottom: 8,
    backgroundColor: colors.surfaceAlt,
  },
  notes: { minHeight: 64, textAlignVertical: "top" },
  title: { color: colors.text, fontWeight: "700", marginBottom: 8 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  forecastChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 120,
    gap: 4,
    marginBottom: 8,
  },
  forecastCol: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" },
  forecastBarWrap: { flex: 1, width: "100%", justifyContent: "flex-end" },
  forecastBar: { width: "100%", borderRadius: 3, minHeight: 4 },
  forecastLabel: { color: colors.muted, fontSize: 9, marginTop: 2 },
  hint: { color: colors.muted, textAlign: "center", marginBottom: 16 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  tab: {
    ...chipContainerStyle,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderWidth: 1,
  },
  tabOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  tabText: { ...chipLabelStyle, color: colors.text, textTransform: "capitalize" },
  row: { flexDirection: "row", marginTop: 8, flexWrap: "wrap" },
  lineRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  budgetLine: { marginTop: 8 },
  catRow: { marginBottom: 8 },
  catChip: {
    ...chipContainerStyle,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    marginRight: 6,
    borderWidth: 1,
  },
  catChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  catChipText: { ...chipLabelStyle, color: colors.text },
  barTrack: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: 4,
  },
  barFill: { height: "100%", backgroundColor: colors.accent },
});
}
