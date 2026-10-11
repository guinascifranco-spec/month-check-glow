import { describe, expect, test } from "bun:test";
import { formatFinancialCycleRange, getFinancialCycle } from "./financial-cycle";
import { personalContribution } from "./personal-finance";

describe("getFinancialCycle", () => {
  test("includes the 1st in the cycle started on the prior month's 2nd", () => {
    expect(getFinancialCycle("2026-10-01")).toEqual({
      startInclusive: "2026-09-02",
      endExclusive: "2026-10-02",
    });
  });

  test("starts a new cycle on the 2nd and includes the month's last day", () => {
    expect(getFinancialCycle("2026-10-02")).toEqual({
      startInclusive: "2026-10-02",
      endExclusive: "2026-11-02",
    });
    expect(getFinancialCycle("2026-10-31")).toEqual({
      startInclusive: "2026-10-02",
      endExclusive: "2026-11-02",
    });
  });

  test("keeps the next month's 1st in the previous cycle", () => {
    expect(getFinancialCycle("2026-11-01")).toEqual({
      startInclusive: "2026-10-02",
      endExclusive: "2026-11-02",
    });
  });

  test("formats the exact inclusive dates shown to users", () => {
    expect(formatFinancialCycleRange(getFinancialCycle("2026-10-15"))).toBe(
      "02/10/2026 – 01/11/2026",
    );
  });

  test("handles December to January", () => {
    expect(getFinancialCycle("2026-12-31")).toEqual({
      startInclusive: "2026-12-02",
      endExclusive: "2027-01-02",
    });
    expect(getFinancialCycle("2027-01-01")).toEqual({
      startInclusive: "2026-12-02",
      endExclusive: "2027-01-02",
    });
  });

  test("handles common and leap February", () => {
    expect(getFinancialCycle("2025-02-28")).toEqual({
      startInclusive: "2025-02-02",
      endExclusive: "2025-03-02",
    });
    expect(getFinancialCycle("2024-02-29")).toEqual({
      startInclusive: "2024-02-02",
      endExclusive: "2024-03-02",
    });
    expect(getFinancialCycle("2024-03-01")).toEqual({
      startInclusive: "2024-02-02",
      endExclusive: "2024-03-02",
    });
  });

  test("handles months with 28, 29, 30, and 31 days", () => {
    for (const date of ["2025-02-28", "2024-02-29", "2026-04-30", "2026-01-31"]) {
      expect(getFinancialCycle(date).startInclusive).toBe(`${date.slice(0, 7)}-02`);
    }
  });

  test("accepts date-only values and rejects timestamps to avoid timezone shifts", () => {
    // A civil date has no time or timezone; reject timestamps instead of
    // silently shifting a transaction to a neighboring day.
    expect(getFinancialCycle("2026-10-02")).toEqual({
      startInclusive: "2026-10-02",
      endExclusive: "2026-11-02",
    });
    expect(() => getFinancialCycle("2026-10-01T23:59:00-03:00")).toThrow(RangeError);
  });

  test("rejects invalid calendar dates", () => {
    expect(() => getFinancialCycle("2025-02-29")).toThrow(RangeError);
    expect(() => getFinancialCycle("2026-13-01")).toThrow(RangeError);
    expect(() => getFinancialCycle("not-a-date")).toThrow(RangeError);
    expect(() => getFinancialCycle("2026-10-01\n")).toThrow(RangeError);
    expect(() => getFinancialCycle(" 2026-10-01")).toThrow(RangeError);
  });

  test("uses the same inclusive-exclusive limits for income and expense rows", () => {
    const rows = [
      { date: "2026-10-01", tipo: "entrada", valor: 100 },
      { date: "2026-10-02", tipo: "entrada", valor: 200 },
      { date: "2026-11-01", tipo: "saida", valor: 50 },
      { date: "2026-11-02", tipo: "saida", valor: 75 },
    ];
    const cycle = getFinancialCycle("2026-10-15");
    const inCycle = rows.filter(
      (row) => row.date >= cycle.startInclusive && row.date < cycle.endExclusive,
    );

    expect(inCycle.map((row) => row.date)).toEqual(["2026-10-02", "2026-11-01"]);
    expect(inCycle.reduce((sum, row) => sum + personalContribution({ tipo: row.tipo, valor: row.valor }).income, 0)).toBe(200);
    expect(inCycle.reduce((sum, row) => sum + personalContribution({ tipo: row.tipo, valor: row.valor }).expense, 0)).toBe(50);
  });

  test("assigns each boundary transaction to exactly one of two consecutive cycles", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-11-01", "2026-11-02"];
    const cycles = [
      getFinancialCycle("2026-10-01"),
      getFinancialCycle("2026-10-02"),
      getFinancialCycle("2026-11-02"),
    ];

    for (const date of dates) {
      const matches = cycles.filter(
        (cycle) => date >= cycle.startInclusive && date < cycle.endExclusive,
      );
      expect(matches).toHaveLength(1);
    }
  });

  test("keeps a day-1 card purchase in its purchase cycle and the later payment neutral", () => {
    const rows = [
      {
        date: "2026-10-01",
        row: {
          tipo: "saida",
          valor: 200,
          invoice_source: "card",
          invoice_responsibility: "shared",
          invoice_personal_value: 120,
        },
      },
      {
        date: "2026-10-15",
        row: { tipo: "saida", valor: 200, invoice_payment: true },
      },
    ];
    const purchaseCycle = getFinancialCycle(rows[0].date);
    const paymentCycle = getFinancialCycle(rows[1].date);
    const expenseFor = (cycle: ReturnType<typeof getFinancialCycle>) =>
      rows
        .filter((item) => item.date >= cycle.startInclusive && item.date < cycle.endExclusive)
        .reduce((sum, item) => sum + personalContribution(item.row).expense, 0);

    expect(purchaseCycle).toEqual({ startInclusive: "2026-09-02", endExclusive: "2026-10-02" });
    expect(paymentCycle).toEqual({ startInclusive: "2026-10-02", endExclusive: "2026-11-02" });
    expect(expenseFor(purchaseCycle)).toBe(120);
    expect(expenseFor(paymentCycle)).toBe(0);
  });

  test("a card purchase on day 2 starts the new cycle", () => {
    const purchase = { date: "2026-10-02", tipo: "saida", valor: 90 };
    const cycle = getFinancialCycle(purchase.date);
    expect(cycle).toEqual({ startInclusive: "2026-10-02", endExclusive: "2026-11-02" });
    expect(purchase.date >= cycle.startInclusive && purchase.date < cycle.endExclusive).toBe(true);
  });
});

describe("Future balance and cash specifications", () => {
  test.todo("an investment principal contribution is not consumption expense");
  test.todo("withdrawing investment principal is not employment income");
  test.todo("withdrawing emergency reserves does not turn a deficit into income");
  test.todo("transfers between accounts are neither income nor consumption");
  test.todo("invoice payment affects cash on its payment date without duplicating consumption");
});
