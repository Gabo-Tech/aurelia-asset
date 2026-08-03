import { GROUP_COLORS, type CashflowEntry, type Category, type CategoryGroup } from "@/lib/types";
import type { SankeyBranch, SankeyDatum } from "@/components/sankey-chart";

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
  /** Vertical order of account nodes (credit cards / holdings) in Accounts layout. */
  accountOrder: string[];
  stages: SankeyStages;
};

export type SankeyLabels = {
  totalIncome: string;
  totalExpenses: string;
  totalSavings: string;
  totalInvestments: string;
  saved: string;
  deficit: string;
  other: string;
  cashPool: string;
  general: string;
};

type NodeMeta = {
  name: string;
  kind: string;
  fill: string;
  group?: CategoryGroup;
  branch?: SankeyBranch;
};

type LinkMeta = { source: number; target: number; value: number; branch?: SankeyBranch };

const POOL_COLOR = "#64748b";
const SAVED_COLOR = "#0ea5e9";
const DEFICIT_COLOR = "#f43f5e";

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

function uniqueLeafName(desc: string, category: string, used: Set<string>, labels: SankeyLabels) {
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
    pushNode({
      name: s,
      kind: "income",
      fill: colorFor(s, "income"),
      group: "income",
      branch: "main",
    }),
  );
  pushNode({
    name: POOL,
    kind: "pool",
    fill: prefs.nodeColors[POOL] ?? POOL_COLOR,
    branch: "main",
  });

  // Register accounts, then re-order by saved accountOrder (Accounts layout).
  const registerAccount = (ref: string, role: "source" | "target") => {
    if (ref === "liquidity") return;
    const name = nameFor(ref, role);
    const fill = prefs.nodeColors[name] ?? colorOf(ref);
    const branch: SankeyBranch = ref.startsWith("credit:") ? "credit" : "main";
    pushNode({ name, kind: "account", fill, branch });
  };
  const accountRefs: { ref: string; role: "source" | "target" }[] = [];
  const seenAccountNames = new Set<string>();
  const queueAccount = (ref: string, role: "source" | "target") => {
    if (ref === "liquidity") return;
    const name = nameFor(ref, role);
    if (seenAccountNames.has(name)) return;
    seenAccountNames.add(name);
    accountRefs.push({ ref, role });
  };
  for (const t of transfers) {
    if (t.fromAccount) queueAccount(t.fromAccount, "source");
    if (t.toAccount) queueAccount(t.toAccount, "target");
  }
  for (const e of expenses) {
    if (e.paymentMethod && e.paymentMethod !== "liquidity") {
      queueAccount(e.paymentMethod, "source");
    }
  }
  const accountNames = applyOrder(
    accountRefs.map(({ ref, role }) => nameFor(ref, role)),
    prefs.accountOrder ?? [],
  );
  for (const name of accountNames) {
    const item = accountRefs.find(({ ref, role }) => nameFor(ref, role) === name);
    if (!item) continue;
    registerAccount(item.ref, item.role);
  }

  cats.forEach((c) => {
    const meta = catByName.get(c);
    const group: CategoryGroup = meta?.group ?? "expense";
    pushNode({ name: c, kind: "expense", fill: colorFor(c, group), group });
  });

  const idx = (name: string) => nodes.findIndex((n) => n.name === name);
  const links: LinkMeta[] = [];
  const addLink = (a: string, b: string, v: number, branch: SankeyBranch = "main") => {
    if (!(v > 0)) return;
    const si = idx(a);
    const ti = idx(b);
    if (si < 0 || ti < 0 || si === ti) return;
    const existing = links.find((l) => l.source === si && l.target === ti);
    if (existing) existing.value += v;
    else links.push({ source: si, target: ti, value: v, branch });
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
    const fromCard = !!(e.paymentMethod && e.paymentMethod !== "liquidity");
    const from = fromCard ? nameFor(e.paymentMethod!, "source") : POOL;
    addLink(from, cat, v, fromCard ? "credit" : "main");
  }
  for (const t of transfers) {
    const v = valuesTop.get(t.id) ?? 0;
    if (!t.fromAccount || !t.toAccount) continue;
    const involvesCredit = t.fromAccount.startsWith("credit:") || t.toAccount.startsWith("credit:");
    addLink(
      nameFor(t.fromAccount, "source"),
      nameFor(t.toAccount, "target"),
      v,
      involvesCredit ? "credit" : "main",
    );
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
    pushNode({
      name: SAVED,
      kind: "saved",
      fill: prefs.nodeColors[SAVED] ?? SAVED_COLOR,
      group: "savings",
      branch: "main",
    });
    addLink(POOL, SAVED, saved);
  }

  // Classify shared expense categories fed by both pool and credit-card flows.
  for (const n of nodes) {
    if (n.kind !== "expense") continue;
    const ni = idx(n.name);
    const incoming = links.filter((l) => l.target === ni);
    const hasMain = incoming.some((l) => l.branch === "main");
    const hasCredit = incoming.some((l) => l.branch === "credit");
    if (hasMain && hasCredit) n.branch = "shared";
    else if (hasCredit) n.branch = "credit";
    else n.branch = "main";
  }

  // Re-apply expenseOrder across expense categories + Saved (same column in Accounts).
  {
    const movableKinds = new Set(["expense", "saved"]);
    const movable = nodes.filter((n) => movableKinds.has(n.kind));
    if (movable.length > 1) {
      const orderedNames = applyOrder(
        movable.map((n) => n.name),
        prefs.expenseOrder,
      );
      const byName = new Map(movable.map((n) => [n.name, n]));
      let mi = 0;
      const newNodes = nodes.map((n) =>
        movableKinds.has(n.kind) ? byName.get(orderedNames[mi++])! : n,
      );
      const oldIdx = new Map(nodes.map((n, i) => [n.name, i]));
      const newIdx = new Map(newNodes.map((n, i) => [n.name, i]));
      for (const l of links) {
        const sName = nodes[l.source]?.name;
        const tName = nodes[l.target]?.name;
        if (sName != null) l.source = newIdx.get(sName) ?? oldIdx.get(sName) ?? l.source;
        if (tName != null) l.target = newIdx.get(tName) ?? oldIdx.get(tName) ?? l.target;
      }
      nodes.length = 0;
      nodes.push(...newNodes);
    }
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
      const orderedIncomeCats = applyOrder(Array.from(incomeByCategory.keys()), prefs.incomeOrder);
      for (const cat of orderedIncomeCats) {
        const v = incomeByCategory.get(cat) ?? 0;
        const catName = pushNode({
          name: cat,
          kind: "category",
          fill: colorFor(cat, "income"),
          group: "income",
        });

        if (showDescriptions) {
          const pendingLeaves: { name: string; value: number }[] = [];
          let describedSum = 0;
          for (const [key, { category, value }] of incomeByDesc) {
            if (category !== cat) continue;
            const desc = key.split("\0")[1]!;
            const leafName = uniqueLeafName(desc, cat, usedNames, labels);
            pendingLeaves.push({ name: leafName, value });
            describedSum += value;
          }
          const remainder = v - describedSum;
          if (remainder > 0.005) {
            pendingLeaves.push({ name: generalLeafName(cat, usedNames, labels), value: remainder });
          }
          for (const name of applyOrder(
            pendingLeaves.map((l) => l.name),
            prefs.incomeOrder,
          )) {
            const leaf = pendingLeaves.find((l) => l.name === name)!;
            pushNode({
              name: leaf.name,
              kind: "leaf",
              fill: colorFor(cat, "income"),
              group: "income",
            });
            addLink(leaf.name, catName, leaf.value);
          }
        }
        addLink(catName, TOTAL_INCOME, v);
      }
    } else if (showDescriptions && incomeByDesc.size > 0) {
      const pendingLeaves: { name: string; value: number; category: string }[] = [];
      for (const [key, { category, value }] of incomeByDesc) {
        const desc = key.split("\0")[1]!;
        const leafName = uniqueLeafName(desc, category, usedNames, labels);
        pendingLeaves.push({ name: leafName, value, category });
      }
      for (const name of applyOrder(
        pendingLeaves.map((l) => l.name),
        prefs.incomeOrder,
      )) {
        const leaf = pendingLeaves.find((l) => l.name === name)!;
        pushNode({
          name: leaf.name,
          kind: "leaf",
          fill: colorFor(leaf.category, "income"),
          group: "income",
        });
        addLink(leaf.name, TOTAL_INCOME, leaf.value);
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
  const covered = Math.min(totalIncome, totalOutflows);
  const deficit = Math.max(0, totalOutflows - totalIncome);
  const saved = Math.max(0, totalIncome - totalOutflows);
  const coverShare = totalOutflows > 0 ? covered / totalOutflows : 0;
  const deficitShare = totalOutflows > 0 ? deficit / totalOutflows : 0;

  const DEFICIT = labels.deficit;

  // Ensure type_total / saved nodes exist, then fund them from income and/or deficit
  // so Total Income is never inflated by expenses that exceed income.
  const outflowTotals: { group: CategoryGroup; name: string; value: number }[] = [];
  for (const group of OUTFLOW_GROUPS) {
    const v = groupTotals.get(group) ?? 0;
    if (v <= 0) continue;
    outflowTotals.push({ group, name: totalLabelForGroup(group, labels), value: v });
  }
  if (saved > 0) {
    outflowTotals.push({ group: "savings", name: SAVED, value: saved });
  }

  for (const name of applyOrder(
    outflowTotals.map((o) => o.name),
    prefs.expenseOrder,
  )) {
    const item = outflowTotals.find((o) => o.name === name)!;
    if (item.name === SAVED) {
      pushNode({
        name: SAVED,
        kind: "saved",
        fill: prefs.nodeColors[SAVED] ?? SAVED_COLOR,
        group: "savings",
      });
    } else {
      pushNode({
        name: item.name,
        kind: "type_total",
        fill: prefs.nodeColors[item.name] ?? GROUP_COLORS[item.group],
        group: item.group,
      });
    }
  }

  if (totalIncome > 0 && idx(TOTAL_INCOME) >= 0) {
    for (const item of outflowTotals) {
      if (item.name === SAVED) {
        addLink(TOTAL_INCOME, SAVED, item.value);
        continue;
      }
      const fromIncome = item.value * coverShare;
      addLink(TOTAL_INCOME, item.name, fromIncome);
    }
  }

  if (deficit > 0) {
    pushNode({
      name: DEFICIT,
      kind: "deficit",
      fill: prefs.nodeColors[DEFICIT] ?? DEFICIT_COLOR,
    });
    for (const item of outflowTotals) {
      if (item.name === SAVED) continue;
      const fromDeficit = item.value * deficitShare;
      addLink(DEFICIT, item.name, fromDeficit);
    }
  }

  for (const group of OUTFLOW_GROUPS) {
    const groupTotal = groupTotals.get(group) ?? 0;
    if (groupTotal <= 0) continue;
    const totalName = totalLabelForGroup(group, labels);
    const catMap = byGroupCategory.get(group);
    if (!catMap) continue;

    if (showCategories) {
      const orderedCats = applyOrder(Array.from(catMap.keys()), prefs.expenseOrder);
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
          const pendingLeaves: { name: string; value: number }[] = [];
          let describedSum = 0;
          for (const [key, { group: g, category, value }] of byGroupDesc) {
            if (g !== group || category !== cat) continue;
            const desc = key.split("\0")[2]!;
            const leafName = uniqueLeafName(desc, cat, usedNames, labels);
            pendingLeaves.push({ name: leafName, value });
            describedSum += value;
          }
          const remainder = v - describedSum;
          if (remainder > 0.005) {
            pendingLeaves.push({ name: generalLeafName(cat, usedNames, labels), value: remainder });
          }
          for (const name of applyOrder(
            pendingLeaves.map((l) => l.name),
            prefs.expenseOrder,
          )) {
            const leaf = pendingLeaves.find((l) => l.name === name)!;
            pushNode({
              name: leaf.name,
              kind: "leaf",
              fill: colorFor(cat, group),
              group,
            });
            addLink(catName, leaf.name, leaf.value);
          }
        }
      }
    } else if (showDescriptions) {
      const pendingLeaves: { name: string; value: number; category: string }[] = [];
      for (const [key, { group: g, category, value }] of byGroupDesc) {
        if (g !== group) continue;
        const desc = key.split("\0")[2]!;
        const leafName = uniqueLeafName(desc, category, usedNames, labels);
        pendingLeaves.push({ name: leafName, value, category });
      }
      for (const name of applyOrder(
        pendingLeaves.map((l) => l.name),
        prefs.expenseOrder,
      )) {
        const leaf = pendingLeaves.find((l) => l.name === name)!;
        pushNode({
          name: leaf.name,
          kind: "leaf",
          fill: colorFor(leaf.category, group),
          group,
        });
        addLink(totalName, leaf.name, leaf.value);
      }
    }
  }

  if (!links.length) return null;
  return { nodes, links };
}
