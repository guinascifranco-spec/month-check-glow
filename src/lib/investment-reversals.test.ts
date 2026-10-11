import { describe, expect, test } from "bun:test";
import { reversedInvestmentRecordIds } from "./investment-reversals";

describe("investment reversal record filtering", () => {
  test("excludes only cancelled linked contributions; preserves legacy and active costs", () => {
    const operations = [
      { id: "cancelled", aporte_id: "a", provento_id: "p" },
      { id: "active", aporte_id: "b", provento_id: null },
      { id: "redemption", aporte_id: null, provento_id: null },
    ];
    const { aporteIds, proventoIds } = reversedInvestmentRecordIds(operations, [
      { source_operation_id: "cancelled" }, { source_operation_id: "redemption" },
    ]);
    expect([...aporteIds]).toEqual(["a"]);
    expect([...proventoIds]).toEqual(["p"]);
    const contributions = [{ id: "a", value: 100 }, { id: "b", value: 200 }, { id: "legacy", value: 300 }];
    expect(contributions.filter((row) => !aporteIds.has(row.id)).reduce((sum, row) => sum + row.value, 0)).toBe(500);
  });
  test("no reversals means historical contributions are unchanged", () => {
    expect(reversedInvestmentRecordIds([], []).aporteIds.size).toBe(0);
  });
});