import { resolveWriteTool, applyProposedChange } from "../src/lib/ai/tools";
import { DEFAULT_STATE } from "../src/lib/types";

jest.mock("../src/lib/i18n-t", () => ({
  t: (_k: string, params?: Record<string, unknown>) => {
    if (params?.amount && params?.category && params?.when) {
      return `confirm ${params.amount} ${params.category} ${params.when}`;
    }
    return "ok";
  },
}));

describe("ai write tools", () => {
  const deps = {
    state: {
      ...DEFAULT_STATE,
      cashflows: [
        {
          id: "tx1",
          kind: "expense" as const,
          source: "",
          category: "Food",
          amount: 12,
          currency: "USD",
          date: "2026-08-01T12:00:00.000Z",
          amountKind: "fixed" as const,
          description: "coffee",
          paymentMethod: "liquidity" as const,
        },
      ],
    },
    toDisplay: (amount: number) => amount,
    currency: "USD",
    locale: "en",
  };

  it("resolves add_transaction into a confirmable change", () => {
    const out = resolveWriteTool(
      { name: "add_transaction", arguments: { amount: 5, category: "Food" } },
      deps,
    );
    expect(out.error).toBeUndefined();
    expect(out.change?.actions[0]?.kind).toBe("cashflow.add");
    expect(out.change?.preview.length).toBeGreaterThan(0);
  });

  it("updates matched transaction", () => {
    const out = resolveWriteTool(
      { name: "update_transaction", arguments: { match: "coffee", amount: 15 } },
      deps,
    );
    expect(out.error).toBeUndefined();
    expect(out.change?.actions[0]?.kind).toBe("cashflow.update");
  });

  it("applies add action via store adapter", () => {
    const calls: unknown[] = [];
    applyProposedChange(
      {
        summary: "s",
        preview: [],
        actions: [{ kind: "cashflow.add", payload: { kind: "expense", amount: 3 } }],
      },
      {
        addCashflow: (c) => calls.push(c),
        updateCashflow: () => undefined,
        removeCashflow: () => undefined,
        addBudgetPlan: () => ({ id: "plan-1" }),
        addBudgetItem: () => undefined,
        updateBudgetItem: () => undefined,
        addGoal: () => undefined,
        updateGoal: () => undefined,
        addLoan: () => undefined,
        addHolding: () => undefined,
        updateHolding: () => undefined,
        addCategory: () => undefined,
      },
    );
    expect(calls).toHaveLength(1);
  });
});
