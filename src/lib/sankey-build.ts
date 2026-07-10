import {
  GROUP_COLORS,
  type CashflowEntry,
  type Category,
  type CategoryGroup,
} from "@/lib/types";
import type { SankeyDatum } from "@/components/sankey-chart";

export type SankeyLayoutMode = "classic" | "staged";

export type SankeyStages = {
  /** Show category / source nodes between totals and leaves. */
  categories: boolean;
  /** Show per-entry description leaves when present. */
  descriptions: boolean;
};

export type SankeyBuildPrefs = {
  nodeColors: Record<string, string>;
  incomeOrder: string[];
  expenseOrder: string[];
  stages: SankeyStages;
};

export type SankeyLabels = {
  totalIncome: string;
  totalExpenses: string;
  totalSavings: string;
  totalInvestments: string;
  saved: string;
  other: string;
  cashPool: string;
  general: string;
};

type NodeMeta = {
  name: string;
  kind: string;
  fill: string;
  group?: CategoryGroup;
};

const POOL_COLOR = "#64748b";
const SAVED_COLOR = "#0ea5e9";

function applyOrder(items: string[], saved: string[]) {
  const set = new Set(items);
  const ordered = saved.filter((n) => set.has(n));
  const remaining = items.filter((n) => !ordered.includes(n));
  return [...ordered, ...remaining];
}

function generalLeafName(cat: string, used: Set<string>, labels: SankeyLabels) {
  return uniqueLeafName(labels.general, cat, used, labels);
}

function resolveCategoryName(
  raw: string,
  catByName: Map<string, Category>,
  labels: SankeyLabels,
): string {
  if (!raw) return labels.other;
  const byName = catByName.get(raw);
  if (byName) return byName.name;
  for (const c of catByName.values()) {
    if (c.id === raw) return c.name;
  }
  return raw;
}

function uniqueLeafName(
  desc: string,
  category: string,
  used: Set<string>,
  labels: SankeyLabels,
) {
  const d = desc.trim();
  const candidates = d
    ? [d, `${d} · ${category}`, `${category} · ${d}`]
    : [category || labels.other];
  for (const c of candidates) {
    if (!used.has(c)) {
      used.add(c);
      return c;
    }
  }
  let i = 2;
  const base = d || category || labels.other;
  while (used.has(`${base} (${i})`)) i++;
  const name = `${base} (${i})`;
  used.add(name);
  return name;
}

/* ---------- Classic (pool + accounts) ---------- */

export type ClassicSankeyContext = {
  entries: CashflowEntry[];
  valuesTop: Map<string, number>;
  catByName: Map<string, Category>;
  colorFor: (name: string, fallbackGroup: CategoryGroup) => string;
  prefs: SankeyBuildPrefs;
  labels: SankeyLabels;
  creditCards: { id: string; name: string; color: string }[];
  holdings: { id: string; name: string; symbol?: string; color: string }[];
};

export function buildClassicSankey(ctx: ClassicSankeyContext): SankeyDatum | null {
  const { entries, valuesTop, catByName, colorFor, prefs, labels, creditCards, holdings } = ctx;
  if (!entries.length) return null;

  const incomes = entries.filter((c) => c.kind === "income");
  const expenses = entries.filter((c) => c.kind === "expense");
  const transfers = entries.filter((c) => c.kind === "transfer");

  const sources = applyOrder(
    Array.from(new Set(incomes.map((i) => i.source || labels.other))),
    prefs.incomeOrder,
  );
  const cats = applyOrder(
    Array.from(new Set(expenses.map((e) => e.category || labels.other))),
    prefs.expenseOrder,
  );
  const POOL = labels.cashPool;
  const SAVED = labels.saved;

  const cardById = new Map(creditCards.map((c) => [c.id, c]));
  const holdById = new Map(holdings.map((h) => [h.id, h]));
  const baseLabelOf = (ref: string) => {
    if (ref === "liquidity") return POOL;
    if (ref.startsWith("credit:")) {
      const c = cardById.get(ref.slice(7));
      return c ? `💳 ${c.name}` : POOL;
    }
    if (ref.startsWith("holding:")) {
      const h = holdById.get(ref.slice(8));
      return h ? `📈 ${h.symbol || h.name}` : POOL;
    }
    return POOL;
  };
  const colorOf = (ref: string): string => {
    if (ref === "liquidity") return prefs.nodeColors[POOL] ?? POOL_COLOR;
    if (ref.startsWith("credit:")) return cardById.get(ref.slice(7))?.color ?? "#f97316";
    if (ref.startsWith("holding:")) return holdById.get(ref.slice(8))?.color ?? "#a855f7";
    return POOL_COLOR;
  };

  const usedAsSource = new Set<string>();
  const usedAsTarget = new Set<string>();
  for (const t of transfers) {
    if (t.fromAccount && t.fromAccount !== "liquidity") usedAsSource.add(t.fromAccount);
    if (t.toAccount && t.toAccount !== "liquidity") usedAsTarget.add(t.toAccount);
  }
  for (const e of expenses) {
    if (e.paymentMethod && e.paymentMethod !== "liquidity") usedAsSource.add(e.paymentMethod);
  }
  const needsSplit = (ref: string) =>
    ref !== "liquidity" && usedAsSource.has(ref) && usedAsTarget.has(ref);
  const nameFor = (ref: string, role: "source" | "target") => {
    if (ref === "liquidity") return POOL;
    const base = baseLabelOf(ref);
    if (!needsSplit(ref)) return base;
    return role === "source" ? `${base} →` : `← ${base}`;
  };

  const nodes: NodeMeta[] = [];
  const pushNode = (n: NodeMeta) => {
    if (!nodes.find((x) => x.name === n.name)) nodes.push(n);
  };

  sources.forEach((s) =>
    pushNode({ name: s, kind: "income", fill: colorFor(s, "income"), group: "income" }),
  );
  pushNode({ name: POOL, kind: "pool", fill: prefs.nodeColors[POOL] ?? POOL_COLOR });

  const registerAccount = (ref: string, role: "source" | "target") => {
    if (ref === "liquidity") return;
    const name = nameFor(ref, role);
    const fill = prefs.nodeColors[name] ?? colorOf(ref);
    pushNode({ name, kind: "account", fill });
  };
  for (const t of transfers) {
    if (t.fromAccount) registerAccount(t.fromAccount, "source");
    if (t.toAccount) registerAccount(t.toAccount, "target");
  }
  for (const e of expenses) {
    if (e.paymentMethod && e.paymentMethod !== "liquidity") {
      registerAccount(e.paymentMethod, "source");
    }
  }

  cats.forEach((c) => {
    const meta = catByName.get(c);
    const group: CategoryGroup = meta?.group ?? "expense";
    pushNode({ name: c, kind: "expense", fill: colorFor(c, group), group });
  });

  const idx = (name: string) => nodes.findIndex((n) => n.name === name);
  const links: { source: number; target: number; value: number }[] = [];
  const addLink = (a: string, b: string, v: number) => {
    if (!(v > 0)) return;
    const si = idx(a);
    const ti = idx(b);
    if (si < 0 || ti < 0 || si === ti) return;
    const existing = links.find((l) => l.source === si && l.target === ti);
    if (existing) existing.value += v;
    else links.push({ source: si, target: ti, value: v });
  };

  for (const s of sources) {
    const sum = incomes
      .filter((i) => (i.source || labels.other) === s)
      .reduce((a, b) => a + (valuesTop.get(b.id) ?? 0), 0);
    addLink(s, POOL, sum);
  }
  for (const e of expenses) {
    const v = valuesTop.get(e.id) ?? 0;
    const cat = e.category || labels.other;
    const from =
      e.paymentMethod && e.paymentMethod !== "liquidity"
        ? nameFor(e.paymentMethod, "source")
        : POOL;
    addLink(from, cat, v);
  }
  for (const t of transfers) {
    const v = valuesTop.get(t.id) ?? 0;
    if (!t.fromAccount || !t.toAccount) continue;
    addLink(nameFor(t.fromAccount, "source"), nameFor(t.toAccount, "target"), v);
  }

  const totalIntoPool =
    incomes.reduce((s, c) => s + (valuesTop.get(c.id) ?? 0), 0) +
    transfers
      .filter((t) => t.toAccount === "liquidity")
      .reduce((s, t) => s + (valuesTop.get(t.id) ?? 0), 0);
  const totalOutOfPool =
    expenses
      .filter((e) => !e.paymentMethod || e.paymentMethod === "liquidity")
      .reduce((s, c) => s + (valuesTop.get(c.id) ?? 0), 0) +
    transfers
      .filter((t) => t.fromAccount === "liquidity")
      .reduce((s, t) => s + (valuesTop.get(t.id) ?? 0), 0);
  const saved = Math.max(0, totalIntoPool - totalOutOfPool);
  if (saved > 0) {
    pushNode({ name: SAVED, kind: "saved", fill: prefs.nodeColors[SAVED] ?? SAVED_COLOR, group: "savings" });
    addLink(POOL, SAVED, saved);
  }

  if (!links.length) return null;
  return { nodes, links };
}

/* ---------- Staged (type → category → description) ---------- */

export type StagedSankeyContext = {
  entries: CashflowEntry[];
  valuesTop: Map<string, number>;
  catByName: Map<string, Category>;
  colorFor: (name: string, fallbackGroup: CategoryGroup) => string;
  prefs: SankeyBuildPrefs;
  labels: SankeyLabels;
};

const OUTFLOW_GROUPS: CategoryGroup[] = ["expense", "savings", "investment"];

function totalLabelForGroup(group: CategoryGroup, labels: SankeyLabels): string {
  switch (group) {
    case "expense":
      return labels.totalExpenses;
    case "savings":
      return labels.totalSavings;
    case "investment":
      return labels.totalInvestments;
    default:
      return labels.totalIncome;
  }
}

export function buildStagedSankey(ctx: StagedSankeyContext): SankeyDatum | null {
  const { entries, valuesTop, catByName, colorFor, prefs, labels } = ctx;
  const { categories: showCategories, descriptions: showDescriptions } = prefs.stages;

  const incomes = entries.filter((c) => c.kind === "income");
  const expenses = entries.filter((c) => c.kind === "expense");
  if (!incomes.length && !expenses.length) return null;

  const nodes: NodeMeta[] = [];
  const links: { source: number; target: number; value: number }[] = [];
  const usedNames = new Set<string>();
  const pushNode = (n: NodeMeta): string => {
    let name = n.name;
    const existing = nodes.find((x) => x.name === name);
    if (existing && existing.group && n.group && existing.group !== n.group) {
      name = `${name} (${n.group})`;
    }
    if (!nodes.find((x) => x.name === name)) {
      nodes.push({ ...n, name });
      usedNames.add(name);
    }
    return name;
  };
  const idx = (name: string) => nodes.findIndex((n) => n.name === name);
  const addLink = (a: string, b: string, v: number) => {
    if (!(v > 0)) return;
    const si = idx(a);
    const ti = idx(b);
    if (si < 0 || ti < 0 || si === ti) return;
    const existing = links.find((l) => l.source === si && l.target === ti);
    if (existing) existing.value += v;
    else links.push({ source: si, target: ti, value: v });
  };

  const TOTAL_INCOME = labels.totalIncome;
  const SAVED = labels.saved;

  // --- Income inflow (left → center) ---
  let totalIncome = 0;
  const incomeByCategory = new Map<string, number>();
  const incomeByDesc = new Map<string, { category: string; value: number }>();

  for (const e of incomes) {
    const v = valuesTop.get(e.id) ?? 0;
    if (v <= 0) continue;
    totalIncome += v;
    const cat = resolveCategoryName(e.source || e.category || "", catByName, labels);
    incomeByCategory.set(cat, (incomeByCategory.get(cat) ?? 0) + v);

    const desc = e.description?.trim();
    if (showDescriptions && desc) {
      const key = `${cat}\0${desc}`;
      const prev = incomeByDesc.get(key);
      if (prev) prev.value += v;
      else incomeByDesc.set(key, { category: cat, value: v });
    }
  }

  if (totalIncome > 0) {
    pushNode({
      name: TOTAL_INCOME,
      kind: "aggregate",
      fill: prefs.nodeColors[TOTAL_INCOME] ?? GROUP_COLORS.income,
      group: "income",
    });

    if (showCategories) {
      const orderedIncomeCats = applyOrder(
        Array.from(incomeByCategory.keys()),
        prefs.incomeOrder,
      );
      for (const cat of orderedIncomeCats) {
        const v = incomeByCategory.get(cat) ?? 0;
        const catName = pushNode({
          name: cat,
          kind: "category",
          fill: colorFor(cat, "income"),
          group: "income",
        });

        if (showDescriptions) {
          let describedSum = 0;
          for (const [key, { category, value }] of incomeByDesc) {
            if (category !== cat) continue;
            const desc = key.split("\0")[1]!;
            const leafName = uniqueLeafName(desc, cat, usedNames, labels);
            pushNode({
              name: leafName,
              kind: "leaf",
              fill: colorFor(cat, "income"),
              group: "income",
            });
            addLink(leafName, catName, value);
            describedSum += value;
          }
          const remainder = v - describedSum;
          if (remainder > 0.005) {
            const bucket = generalLeafName(cat, usedNames, labels);
            pushNode({
              name: bucket,
              kind: "leaf",
              fill: colorFor(cat, "income"),
              group: "income",
            });
            addLink(bucket, catName, remainder);
          }
        }
        addLink(catName, TOTAL_INCOME, v);
      }
    } else if (showDescriptions && incomeByDesc.size > 0) {
      for (const [key, { category, value }] of incomeByDesc) {
        const desc = key.split("\0")[1]!;
        const leafName = uniqueLeafName(desc, category, usedNames, labels);
        pushNode({
          name: leafName,
          kind: "leaf",
          fill: colorFor(category, "income"),
          group: "income",
        });
        addLink(leafName, TOTAL_INCOME, value);
      }
    }
  }

  // --- Outflows by group (center → right) ---
  const groupTotals = new Map<CategoryGroup, number>();
  const byGroupCategory = new Map<CategoryGroup, Map<string, number>>();
  const byGroupDesc = new Map<string, { group: CategoryGroup; category: string; value: number }>();

  for (const e of expenses) {
    const v = valuesTop.get(e.id) ?? 0;
    if (v <= 0) continue;
    const cat = resolveCategoryName(e.category || "", catByName, labels);
    const meta = catByName.get(cat);
    const group: CategoryGroup = meta?.group ?? "expense";

    groupTotals.set(group, (groupTotals.get(group) ?? 0) + v);
    if (!byGroupCategory.has(group)) byGroupCategory.set(group, new Map());
    const catMap = byGroupCategory.get(group)!;
    catMap.set(cat, (catMap.get(cat) ?? 0) + v);

    const desc = e.description?.trim();
    if (showDescriptions && desc) {
      const key = `${group}\0${cat}\0${desc}`;
      const prev = byGroupDesc.get(key);
      if (prev) prev.value += v;
      else byGroupDesc.set(key, { group, category: cat, value: v });
    }
  }

  const totalOutflows = OUTFLOW_GROUPS.reduce((s, g) => s + (groupTotals.get(g) ?? 0), 0);
  const saved = Math.max(0, totalIncome - totalOutflows);

  if (totalIncome > 0) {
    for (const group of OUTFLOW_GROUPS) {
      const v = groupTotals.get(group) ?? 0;
      if (v <= 0) continue;
      const totalName = totalLabelForGroup(group, labels);
      pushNode({
        name: totalName,
        kind: "type_total",
        fill: prefs.nodeColors[totalName] ?? GROUP_COLORS[group],
        group,
      });
      addLink(TOTAL_INCOME, totalName, v);
    }
    if (saved > 0) {
      pushNode({
        name: SAVED,
        kind: "saved",
        fill: prefs.nodeColors[SAVED] ?? SAVED_COLOR,
        group: "savings",
      });
      addLink(TOTAL_INCOME, SAVED, saved);
    }
  }

  for (const group of OUTFLOW_GROUPS) {
    const groupTotal = groupTotals.get(group) ?? 0;
    if (groupTotal <= 0) continue;
    const totalName = totalLabelForGroup(group, labels);
    const catMap = byGroupCategory.get(group);
    if (!catMap) continue;

    if (showCategories) {
      const orderedCats = applyOrder(
        Array.from(catMap.keys()),
        prefs.expenseOrder,
      );
      for (const cat of orderedCats) {
        const v = catMap.get(cat) ?? 0;
        const catName = pushNode({
          name: cat,
          kind: "category",
          fill: colorFor(cat, group),
          group,
        });
        addLink(totalName, catName, v);

        if (showDescriptions) {
          let describedSum = 0;
          for (const [key, { group: g, category, value }] of byGroupDesc) {
            if (g !== group || category !== cat) continue;
            const desc = key.split("\0")[2]!;
            const leafName = uniqueLeafName(desc, cat, usedNames, labels);
            pushNode({
              name: leafName,
              kind: "leaf",
              fill: colorFor(cat, group),
              group,
            });
            addLink(catName, leafName, value);
            describedSum += value;
          }
          const remainder = v - describedSum;
          if (remainder > 0.005) {
            const bucket = generalLeafName(cat, usedNames, labels);
            pushNode({
              name: bucket,
              kind: "leaf",
              fill: colorFor(cat, group),
              group,
            });
            addLink(catName, bucket, remainder);
          }
        }
      }
    } else if (showDescriptions) {
      for (const [key, { group: g, category, value }] of byGroupDesc) {
        if (g !== group) continue;
        const desc = key.split("\0")[2]!;
        const leafName = uniqueLeafName(desc, category, usedNames, labels);
        pushNode({
          name: leafName,
          kind: "leaf",
          fill: colorFor(category, group),
          group,
        });
        addLink(totalName, leafName, value);
      }
    }
  }

  if (!links.length) return null;
  return { nodes, links };
}
