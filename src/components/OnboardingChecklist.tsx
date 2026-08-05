import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAppStore, flushPersist } from "@/lib/store";
import { CURRENCIES } from "@/lib/currency";
import { PrimaryButton, SecondaryButton, Field, Chip } from "@/components/ui";
import { colors, spacing, radii } from "@/theme/colors";
import { type as typography } from "@/theme/typography";

type Step = "welcome" | "profile" | "start" | "done";
type StartPath = "cashflow" | "holdings" | null;

export function OnboardingChecklist({
  onGoCashflow,
  onGoHoldings,
}: {
  onGoCashflow: () => void;
  onGoHoldings: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const onboardingSeen = useAppStore((s) => s.state.settings.onboardingSeen);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const displayName = useAppStore((s) => s.state.settings.displayName ?? "");
  const displayCurrency = useAppStore((s) => s.state.settings.displayCurrency ?? "USD");

  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState(displayName);
  const [currency, setCurrency] = useState(displayCurrency);
  const [startPath, setStartPath] = useState<StartPath>(null);
  const prevOnboardingSeen = useRef<boolean | undefined>(undefined);

  // Explicit false only (new installs / restart tour). Missing flag = existing users.
  const visible = onboardingSeen === false;

  // Reset the flow only when the tour is opened — not on every profile/settings tweak mid-flow.
  useEffect(() => {
    const prev = prevOnboardingSeen.current;
    prevOnboardingSeen.current = onboardingSeen;
    if (onboardingSeen !== false || prev === false) return;
    setStep("welcome");
    setStartPath(null);
    setName(displayName);
    setCurrency(displayCurrency);
  }, [onboardingSeen, displayName, displayCurrency]);

  async function finish() {
    updateSettings({
      onboardingSeen: true,
      displayName: name.trim() || undefined,
      displayCurrency: currency,
    });
    try {
      await flushPersist();
    } catch {
      /* modal still closes; settings stay in memory */
    }
    if (startPath === "cashflow") onGoCashflow();
    else if (startPath === "holdings") onGoHoldings();
    setStep("welcome");
    setStartPath(null);
  }

  async function skip() {
    updateSettings({ onboardingSeen: true });
    try {
      await flushPersist();
    } catch {
      /* ignore */
    }
    setStep("welcome");
    setStartPath(null);
  }

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={[styles.backdrop, { paddingTop: insets.top + spacing.lg }]}>
        <View
          style={[
            styles.card,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
        >
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {step === "welcome" ? (
              <>
                <Text style={styles.brand}>Aurelia Asset</Text>
                <Text style={styles.title}>
                  {t("tour.steps.welcome.title", {
                    defaultValue: "Welcome to Aurelia Asset",
                  })}
                </Text>
                <Text style={styles.body}>{t("onboarding.welcomeBody")}</Text>
                <PrimaryButton label={t("common.next")} onPress={() => setStep("profile")} />
                <View style={{ height: spacing.sm }} />
                <SecondaryButton label={t("onboarding.skip")} onPress={skip} />
              </>
            ) : null}

            {step === "profile" ? (
              <>
                <Text style={styles.title}>{t("onboarding.profileTitle")}</Text>
                <Text style={styles.body}>{t("onboarding.profileBody")}</Text>
                <Field label={t("settings.displayName")}>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Alex"
                    placeholderTextColor={colors.muted}
                    value={name}
                    onChangeText={setName}
                  />
                </Field>
                <Field label={t("settings.displayCurrency")}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {CURRENCIES.slice(0, 12).map((c) => (
                      <Chip
                        key={c.code}
                        label={c.code}
                        active={currency === c.code}
                        onPress={() => setCurrency(c.code)}
                      />
                    ))}
                  </ScrollView>
                </Field>
                <PrimaryButton
                  label={t("common.next")}
                  onPress={() => setStep("start")}
                />
                <View style={{ height: spacing.sm }} />
                <SecondaryButton label={t("common.back")} onPress={() => setStep("welcome")} />
              </>
            ) : null}

            {step === "start" ? (
              <>
                <Text style={styles.title}>{t("onboarding.startTitle")}</Text>
                <Text style={styles.body}>{t("onboarding.startBody")}</Text>
                <PrimaryButton
                  label={t("onboarding.trackSpending")}
                  onPress={() => {
                    setStartPath("cashflow");
                    setStep("done");
                  }}
                />
                <View style={{ height: spacing.sm }} />
                <PrimaryButton
                  label={t("onboarding.trackInvestments")}
                  onPress={() => {
                    setStartPath("holdings");
                    setStep("done");
                  }}
                />
                <View style={{ height: spacing.sm }} />
                <SecondaryButton
                  label={t("onboarding.exploreOnly")}
                  onPress={() => {
                    setStartPath(null);
                    setStep("done");
                  }}
                />
                <View style={{ height: spacing.sm }} />
                <SecondaryButton label={t("common.back")} onPress={() => setStep("profile")} />
              </>
            ) : null}

            {step === "done" ? (
              <>
                <Text style={styles.title}>{t("onboarding.doneTitle")}</Text>
                <Text style={styles.body}>{t("onboarding.doneBody")}</Text>
                <PrimaryButton label={t("onboarding.doneCta")} onPress={finish} />
              </>
            ) : null}
          </ScrollView>
          {step !== "welcome" && step !== "done" ? (
            <Pressable onPress={skip} style={styles.skipLink} hitSlop={8}>
              <Text style={styles.skipText}>{t("onboarding.skip")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: "88%",
  },
  brand: {
    ...typography.display,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  skipLink: { marginTop: spacing.md, alignItems: "center" },
  skipText: { ...typography.caption, color: colors.muted },
});
