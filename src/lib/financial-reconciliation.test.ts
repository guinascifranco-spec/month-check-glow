import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { decimalToCents, isValuationApplicable, reconciliationResult } from "./financial-reconciliation";

describe("financial reconciliation", () => {
  it("distinguishes equal, higher and lower reported balances exactly in cents", () => {
    expect(reconciliationResult("100.00", "100.00")).toEqual({ status: "reconciled", differenceCents: 0n });
    expect(reconciliationResult("105.25", "100.00")).toEqual({ status: "divergent", differenceCents: 525n });
    expect(reconciliationResult("95.25", "100.00")).toEqual({ status: "divergent", differenceCents: -475n });
  });

  it("keeps unknown calculated balances inconclusive instead of zero", () => {
    expect(reconciliationResult("0", null)).toEqual({ status: "inconclusive", differenceCents: null });
  });

  it("uses exact cents and rejects implicit rounding", () => {
    expect(decimalToCents("-10.09")).toBe(-1009n);
    expect(() => decimalToCents("1.001")).toThrow();
  });

  it("marks a valuation stale when a later operation changes the position", () => {
    expect(isValuationApplicable("2026-10-10", "2026-10-11")).toBe(false);
    expect(isValuationApplicable("2026-10-11", "2026-10-11")).toBe(true);
    expect(isValuationApplicable("2026-10-10", null)).toBe(true);
  });

  it("migration preserves reconciliation snapshots, restricts ownership and prevents duplicate reversals", () => {
    const migration = readFileSync(new URL("../../supabase/migrations/20261015200000_financial_reconciliation.sql", import.meta.url), "utf8");
    expect(migration).toMatch(/financial_account_reconciliations[\s\S]*FOREIGN KEY \(account_id, user_id\)[\s\S]*financial_accounts\(id, user_id\)/i);
    expect(migration).toMatch(/status = 'inconclusive' AND calculated_balance IS NULL AND difference IS NULL/i);
    expect(migration).toMatch(/list_financial_account_reconciliations[\s\S]*ORDER BY r\.reference_date DESC, r\.created_at DESC/i);
    expect(migration).toMatch(/investment_valuations[\s\S]*FOREIGN KEY \(asset_id, user_id\)[\s\S]*ativos\(id, user_id\)/i);
    expect(migration).toMatch(/p_reference_date >= latest_operation/i);
    expect(migration).toMatch(/CONSTRAINT investment_operation_reversals_source_unique UNIQUE \(source_operation_id\)/i);
    expect(migration).toMatch(/already reversed/i);
    expect(migration).toMatch(/INSERT INTO public\.financial_movements[\s\S]*INSERT INTO public\.investment_operation_reversals/i);
    expect(migration).toMatch(/cancel_financial_transfer_with_reason[\s\S]*FOR UPDATE[\s\S]*status = 'cancelled'[\s\S]*INSERT INTO public\.financial_transfer_cancellations/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.cancel_financial_transfer\(uuid\) FROM authenticated/i);
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE) public\.month_check_rows/i);
    const backup = readFileSync(new URL("./backup.functions.ts", import.meta.url), "utf8");
    expect(backup).toMatch(/from\("financial_account_reconciliations"\)/);
    expect(backup).toMatch(/from\("investment_valuations"\)/);
    expect(backup).toMatch(/from\("investment_operation_reversals"\)/);
    expect(backup).toMatch(/from\("financial_transfer_cancellations"\)/);
  });
});
