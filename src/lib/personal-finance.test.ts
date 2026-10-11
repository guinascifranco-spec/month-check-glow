import { describe, expect, test } from "bun:test";
import {
  personalContribution,
  ownPortion,
  responsibilityTotals,
  validPersonalPortion,
} from "./personal-finance";
import { invoiceTotals, reviewedRowSchema } from "./invoice";

describe("Invoice responsibility", () => {
  const sample = [
    { value: 200, type: "saida", responsibility: "own" as const, personalValue: 200 },
    { value: 400, type: "saida", responsibility: "shared" as const, personalValue: 150 },
    { value: 100, type: "saida", responsibility: "bia" as const, personalValue: 0 },
    { value: 300, type: "saida", responsibility: "reimbursable" as const, personalValue: 0 },
  ];
  test("full invoice stays reconciled and responsibility totals partition it", () => {
    const originalRows = structuredClone(sample);
    expect(invoiceTotals(sample, 1000).matches).toBe(true);
    expect(responsibilityTotals(sample)).toEqual({
      personal: 350,
      bia: 350,
      reimbursable: 300,
      known: true,
    });
    expect(sample).toEqual(originalRows);
  });
  test("personal refund reduces consumption, never income", () => {
    const refund = {
      value: 50,
      type: "entrada",
      responsibility: "own" as const,
      personalValue: 50,
    };
    expect(responsibilityTotals([...sample, refund]).personal).toBe(300);
    expect(invoiceTotals([...sample, refund], 950).matches).toBe(true);
    expect(
      personalContribution({
        valor: 50,
        tipo: "entrada",
        invoice_responsibility: "own",
        invoice_personal_value: 50,
      }),
    ).toEqual({ income: 0, expense: -50, active: true });
  });
  test("nonpersonal refunds and payments have no personal effect; legacy income unchanged", () => {
    const nonpersonalRefund = personalContribution({
      valor: 100,
      tipo: "entrada",
      invoice_responsibility: "bia",
      invoice_personal_value: 0,
    });
    expect(nonpersonalRefund.income).toBe(0);
    expect(nonpersonalRefund.expense === 0).toBe(true);
    expect(nonpersonalRefund.active).toBe(false);
    expect(personalContribution({ valor: 1000, tipo: "saida", invoice_payment: true })).toEqual({
      income: 0,
      expense: 0,
      active: false,
    });
    expect(personalContribution({ valor: 500, tipo: "entrada" }).income).toBe(500);
  });
  test("keeps personal budget classifications for income and invoice expenses", () => {
    expect(personalContribution({ valor: 500, tipo: "entrada" })).toEqual({
      income: 500,
      expense: 0,
      active: true,
    });
    expect(
      personalContribution({
        valor: 200,
        tipo: "saida",
        invoice_responsibility: "own",
        invoice_personal_value: 200,
      }),
    ).toEqual({ income: 0, expense: 200, active: true });
    expect(
      personalContribution({
        valor: 400,
        tipo: "saida",
        invoice_responsibility: "shared",
        invoice_personal_value: 150,
      }),
    ).toEqual({ income: 0, expense: 150, active: true });
    expect(
      personalContribution({
        valor: 100,
        tipo: "saida",
        invoice_responsibility: "bia",
        invoice_personal_value: 0,
      }),
    ).toEqual({ income: 0, expense: 0, active: false });
    expect(
      personalContribution({
        valor: 300,
        tipo: "saida",
        invoice_responsibility: "reimbursable",
        invoice_personal_value: 0,
      }),
    ).toEqual({ income: 0, expense: 0, active: false });
  });
  test("no automatic half; reject invalid division and inconsistent classification", () => {
    expect(ownPortion(400, "shared", null)).toBeNull();
    expect(ownPortion(400, "shared", 401)).toBeNull();
    expect(ownPortion(400, "shared", 0)).toBe(0);
    const row = {
      line: 0,
      date: "2026-10-01",
      description: "Test",
      value: 400,
      type: "saida",
      categoryId: null,
      current: null,
      total: null,
      responsibility: "shared",
      personalValue: 401,
    };
    expect(reviewedRowSchema.safeParse(row).success).toBe(false);
    expect(reviewedRowSchema.safeParse({ ...row, personalValue: 150.001 }).success).toBe(false);
    expect(reviewedRowSchema.safeParse({ ...row, personalValue: 150 }).success).toBe(true);
    expect(validPersonalPortion(400, "shared", 150)).toBe(true);
    expect(validPersonalPortion(400, "shared", 150.001)).toBe(false);
    expect(validPersonalPortion(400, "own", 399)).toBe(false);
    expect(validPersonalPortion(400, "bia", 1)).toBe(false);
  });
});
