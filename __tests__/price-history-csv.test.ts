import { parseCsvHistory, formatCsvHistory } from "@/lib/price-history-csv";

describe("parseCsvHistory", () => {
  it("parses date,price lines and skips headers", () => {
    const points = parseCsvHistory("date,price\n2024-01-01,100\n2024-06-01,110.5\n");
    expect(points).toHaveLength(2);
    expect(points[0]!.p).toBe(100);
    expect(points[1]!.p).toBe(110.5);
  });

  it("round-trips via formatCsvHistory", () => {
    const src = "2024-01-15,42\n2024-02-01,43";
    const again = parseCsvHistory(formatCsvHistory(parseCsvHistory(src)));
    expect(again).toHaveLength(2);
    expect(again[0]!.p).toBe(42);
  });
});
