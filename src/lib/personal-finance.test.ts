import { describe, expect, test } from "bun:test";
import { personalContribution, ownPortion, responsibilityTotals, validPersonalPortion } from "./personal-finance";
import { invoiceTotals, reviewedRowSchema } from "./invoice";

describe("Invoice responsibility", () => {
  const sample = [
    { value: 200, type: "saida", responsibility: "own" as const, personalValue: 200 },
    { value: 400, type: "saida", responsibility: "shared" as const, personalValue: 150 },
    { value: 100, type: "saida", responsibility: "bia" as const, personalValue: 0 },
    { value: 300, type: "saida", responsibility: "reimbursable" as const, personalValue: 0 },
  ];
  test("full invoice stays reconciled and responsibility totals partition it", () => {
    expect(invoiceTotals(sample, 1000).matches).toBe(true);
    expect(responsibilityTotals(sample)).toEqual({ personal: 350, bia: 350, reimbursable: 300, known: true });
  });
  test("personal refund reduces consumption, never income", () => {
    const refund = { value: 50, type: "entrada", responsibility: "own" as const, personalValue: 50 };
    expect(responsibilityTotals([...sample, refund]).personal).toBe(300);
    expect(invoiceTotals([...sample, refund], 950).matches).toBe(true);
    expect(personalContribution({ valor: 50, tipo: "entrada", invoice_responsibility: "own", invoice_personal_value: 50 })).toEqual({ income: 0, expense: -50, active: true });
  });
  test("nonpersonal refunds and payments have no personal effect; legacy income unchanged", () => {
    expect(personalContribution({ valor: 100, tipo: "entrada", invoice_responsibility: "bia", invoice_personal_value: 0 }).active).toBe(false);
    expect(personalContribution({ valor: 1000, tipo: "saida", invoice_payment: true }).expense).toBe(0);
    expect(personalContribution({ valor: 500, tipo: "entrada" }).income).toBe(500);
  });
  test("no automatic half; reject invalid division and inconsistent classification", () => {
    expect(ownPortion(400, "shared", null)).toBeNull();
    expect(ownPortion(400, "shared", 401)).toBeNull();
    expect(ownPortion(400, "shared", 0)).toBe(0);
    const row = { line: 0, date: "2026-10-01", description: "Test", value: 400, type: "saida", categoryId: null, current: null, total: null, responsibility: "shared", personalValue: 401 };
    expect(reviewedRowSchema.safeParse(row).success).toBe(false);
    expect(reviewedRowSchema.safeParse({ ...row, personalValue: 150.001 }).success).toBe(false);
    expect(reviewedRowSchema.safeParse({ ...row, personalValue: 150 }).success).toBe(true);
    expect(validPersonalPortion(400, "shared", 150)).toBe(true);
    expect(validPersonalPortion(400, "shared", 150.001)).toBe(false);
    expect(validPersonalPortion(400, "own", 399)).toBe(false);
    expect(validPersonalPortion(400, "bia", 1)).toBe(false);
  });
});
