import { parseBackupJson, buildBackupEnvelope, stringifyBackup } from "../src/lib/backup";
import { DEFAULT_STATE } from "../src/lib/types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

describe("parseBackupJson", () => {
  const sampleState = {
    ...DEFAULT_STATE,
    holdings: [
      {
        id: "h1",
        symbol: "AAPL",
        name: "Apple",
        type: "stock" as const,
        quantity: 2,
        currentPrice: 100,
        color: "#fff",
      },
    ],
    cashflows: [
      {
        id: "c1",
        kind: "expense" as const,
        source: "Coffee",
        category: "Food",
        amount: 5,
        date: new Date().toISOString(),
      },
    ],
  };

  it("unwraps web envelope", () => {
    const text = stringifyBackup(
      buildBackupEnvelope(sampleState, { language: "es" }),
    );
    const parsed = parseBackupJson(text);
    expect(parsed.state.holdings).toHaveLength(1);
    expect(parsed.state.holdings[0]?.symbol).toBe("AAPL");
    expect(parsed.state.cashflows).toHaveLength(1);
    expect(parsed.language).toBe("es");
  });

  it("accepts legacy bare AppState", () => {
    const parsed = parseBackupJson(JSON.stringify(sampleState));
    expect(parsed.state.holdings[0]?.symbol).toBe("AAPL");
    expect(parsed.language).toBeUndefined();
  });

  it("rejects invalid payloads", () => {
    expect(() => parseBackupJson("{}")).toThrow(/Unrecognized/);
    expect(() => parseBackupJson("not-json")).toThrow(/Invalid JSON/);
  });
});
