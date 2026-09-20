import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Card, PrimaryButton, SecondaryButton, SectionHeader, chipLabelStyle, chipContainerStyle } from "@/components/ui";
import { useStore } from "@/lib/store";
import {
  GROUP_COLORS,
  PALETTE,
  type Category,
  type CategoryGroup,
} from "@/lib/types";
import { spacing } from "@/theme/colors";
import { useColors } from "@/theme/ThemeProvider";

export function CategoriesManager() {
  const { t } = useTranslation();
  const colors = useColors();
  const { state, addCategory, updateCategory, removeCategory } = useStore();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"income" | "expense">("expense");
  const [newGroup, setNewGroup] = useState<CategoryGroup>("expense");
  const [newColor, setNewColor] = useState(GROUP_COLORS.expense);
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(colors.accent);

  const grouped = useMemo(() => {
    const cats = state.categories ?? [];
    return {
      income: cats.filter((c) => c.kind === "income"),
      expense: cats.filter((c) => c.kind === "expense"),
    };
  }, [state.categories]);

  function create() {
    const n = newName.trim();
    if (!n) {
      Alert.alert(
        t("common.checkFields", { defaultValue: "Check your entries" }),
        t("more.mcNameRequired", { defaultValue: "Name required" }),
      );
      return;
    }
    addCategory({ name: n, kind: newKind, group: newGroup, color: newColor });
    setNewName("");
  }

  function openEdit(c: Category) {
    setEditing(c);
    setEditName(c.name);
    setEditColor(c.color);
  }

  function saveEdit() {
    if (!editing) return;
    if (!editName.trim()) {
      Alert.alert(
        t("common.checkFields", { defaultValue: "Check your entries" }),
        "Name required",
      );
      return;
    }
    updateCategory(editing.id, { name: editName.trim(), color: editColor });
    setEditing(null);
  }

  if (!open) {
    return (
      <SectionHeader
        title={t("more.mcTitle", { defaultValue: "Categories" })}
        actionLabel={t("more.mcTrigger", { defaultValue: "Manage" })}
        onAction={() => setOpen(true)}
      />
    );
  }

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
        title={t("more.mcTitle", { defaultValue: "Categories" })}
        actionLabel="Done"
        onAction={() => {
          setOpen(false);
          setEditing(null);
        }}
      />
      <Text style={[styles.hint, { color: colors.muted }]}>
        {t("more.mcDesc", { defaultValue: "Add or rename income and expense categories." })}
      </Text>

      <Text style={[styles.sub, { color: colors.text }]}>Add new</Text>
      <TextInput
        style={inputStyle}
        value={newName}
        onChangeText={setNewName}
        placeholder={t("more.mcNamePlaceholder", { defaultValue: "Category name" })}
        placeholderTextColor={colors.muted}
      />
      <View style={styles.row}>
        {(["expense", "income"] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setNewKind(k);
              const g: CategoryGroup = k === "income" ? "income" : "expense";
              setNewGroup(g);
              setNewColor(GROUP_COLORS[g]);
            }}
            style={[
              styles.chip,
              {
                backgroundColor: newKind === k ? colors.accentSoft : colors.surfaceAlt,
                borderColor: newKind === k ? colors.accent : colors.border,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.text }]}>
              {k === "income" ? "Income" : "Expense"}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.swatches}>
        {PALETTE.map((c) => (
          <Pressable
            key={c}
            onPress={() => setNewColor(c)}
            style={[
              styles.swatch,
              { backgroundColor: c },
              newColor === c && { borderColor: colors.text },
            ]}
          />
        ))}
      </ScrollView>
      <PrimaryButton label="Add category" onPress={create} />

      {(["expense", "income"] as const).map((kind) => (
        <View key={kind} style={{ marginTop: spacing.md }}>
          <Text style={[styles.sub, { color: colors.text }]}>
            {kind === "income" ? "Income" : "Expense"}
          </Text>
          {grouped[kind].map((c) => (
            <View key={c.id} style={styles.catRow}>
              <View style={[styles.dot, { backgroundColor: c.color }]} />
              <Text style={[styles.catName, { color: colors.text }]}>{c.name}</Text>
              <SecondaryButton label="Edit" onPress={() => openEdit(c)} />
              <View style={{ width: 6 }} />
              <SecondaryButton
                label="Delete"
                destructive
                onPress={() =>
                  Alert.alert("Remove category?", c.name, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => removeCategory(c.id) },
                  ])
                }
              />
            </View>
          ))}
        </View>
      ))}

      {editing ? (
        <View style={[styles.editBox, { borderTopColor: colors.border }]}>
          <Text style={[styles.sub, { color: colors.text }]}>Edit</Text>
          <TextInput
            style={inputStyle}
            value={editName}
            onChangeText={setEditName}
            placeholderTextColor={colors.muted}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.swatches}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setEditColor(c)}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  editColor === c && { borderColor: colors.text },
                ]}
              />
            ))}
          </ScrollView>
          <PrimaryButton label="Save" onPress={saveEdit} />
          <View style={{ height: 8 }} />
          <SecondaryButton label="Cancel" onPress={() => setEditing(null)} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, marginBottom: 10 },
  sub: { fontWeight: "600", marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  row: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  chip: {
    ...chipContainerStyle,
    marginRight: 8,
    borderWidth: 1,
  },
  chipText: { ...chipLabelStyle, textTransform: "capitalize" },
  swatches: { marginBottom: 10 },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  catRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  catName: { flex: 1, fontSize: 13 },
  editBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
