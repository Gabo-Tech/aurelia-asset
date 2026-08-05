import { createLocalNluEngine } from "../src/lib/ai/nlu";

jest.mock("../src/lib/i18n-t", () => ({ t: () => "ok" }));

const ctx = {
  currency: "USD",
  locale: "en",
  today: "2026-08-05",
  categories: [],
  expenseCategoryNames: ["Food"],
  recent: [],
  month: { income: 0, expense: 0, net: 0, topExpenseCategories: [] },
  year: { income: 0, expense: 0, net: 0 },
  budget: null,
  goals: [],
  holdings: [],
  loans: [],
  creditCards: [],
  wealth: {
    portfolioTotal: 0,
    investedTotal: 0,
    cashLikeHoldings: 0,
    liquidityBalance: 0,
    cardDebt: 0,
    netWorth: 0,
    savingsRate: null,
  },
};

describe("nlu write intents", () => {
  it("emits create_budget tool call", async () => {
    const engine = createLocalNluEngine(ctx as never);
    const res = await engine.chat({
      system: "",
      messages: [{ role: "user", content: "create a monthly budget plan" }],
      tools: [],
    });
    expect(res.toolCalls?.[0]?.name).toBe("create_budget");
  });

  it("emits delete_transaction tool call", async () => {
    const engine = createLocalNluEngine(ctx as never);
    const res = await engine.chat({
      system: "",
      messages: [{ role: "user", content: "delete the coffee transaction" }],
      tools: [],
    });
    expect(res.toolCalls?.[0]?.name).toBe("delete_transaction");
  });
});
