import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { benefitEventInputSchema, benefitPurchaseMatchesBudgetRow } from "./benefits";
import { calculateAccountBalance } from "./financial-movements";

describe("benefit wallet rules", () => {
  test("known opening balance includes credits and subtracts purchases in exact cents", () => {
    const result = calculateAccountBalance(
      { opening_balance: "100.00", opening_balance_date: "2026-01-31" },
      [
        {
          movement_type: "income",
          effective_date: "2026-02-01",
          amount: "250.25",
          transfer_status: null,
        },
        {
          movement_type: "expense",
          effective_date: "2026-02-02",
          amount: "79.99",
          transfer_status: null,
        },
      ],
      "2026-02-28",
    );
    expect(result).toEqual({
      known: true,
      calculatedBalance: "270.26",
      recordedNetActivity: "170.26",
    });
  });

  test("unknown opening remains unknown while movements stay separately visible", () => {
    const result = calculateAccountBalance({ opening_balance: null, opening_balance_date: null }, [
      {
        movement_type: "income",
        effective_date: "2026-02-01",
        amount: "250.00",
        transfer_status: null,
      },
    ]);
    expect(result.known).toBe(false);
    expect(result.calculatedBalance).toBeNull();
    expect(result.recordedNetActivity).toBe("250.00");
  });

  test("budget association requires an explicit exact-date, exact-amount BRL match", () => {
    const row = {
      id: "row-id",
      transaction_date: "2026-04-12",
      descricao: "Mercado",
      valor: "83.40",
    };
    expect(
      benefitPurchaseMatchesBudgetRow(
        { effective_date: row.transaction_date, amount: "83,40" },
        row,
        "BRL",
      ),
    ).toBe(true);
    expect(
      benefitPurchaseMatchesBudgetRow(
        { effective_date: row.transaction_date, amount: "83.41" },
        row,
        "BRL",
      ),
    ).toBe(false);
    expect(
      benefitPurchaseMatchesBudgetRow(
        { effective_date: "2026-04-13", amount: "83.40" },
        row,
        "BRL",
      ),
    ).toBe(false);
    expect(
      benefitPurchaseMatchesBudgetRow(
        { effective_date: row.transaction_date, amount: "83.40" },
        row,
        "USD",
      ),
    ).toBe(false);
  });

  test("validates dates, positive amounts, and explicit event type", () => {
    const valid = {
      account_id: "b6d7f98d-2c69-4a21-a3de-85f681d72c39",
      effective_date: "2026-04-12",
      event_type: "benefit_purchase",
      amount: "83.40",
      description: "Compra no mercado",
      category_id: null,
      month_check_row_id: null,
      idempotency_key: "5791145f-8fba-466d-9117-b90b0a26b213",
    };
    expect(benefitEventInputSchema.safeParse(valid).success).toBe(true);
    expect(benefitEventInputSchema.safeParse({ ...valid, amount: "0" }).success).toBe(false);
    expect(benefitEventInputSchema.safeParse({ ...valid, amount: "1.001" }).success).toBe(false);
    expect(
      benefitEventInputSchema.safeParse({ ...valid, effective_date: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      benefitEventInputSchema.safeParse({
        ...valid,
        event_type: "benefit_credit",
        category_id: null,
        month_check_row_id: null,
      }).success,
    ).toBe(true);
  });

  test("migration reuses account/movement ledgers and blocks budget duplication and cross-type transfers", () => {
    const migration = readFileSync(
      new URL("../../supabase/migrations/20261013220000_benefit_wallets.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toMatch(/benefit_wallet/);
    expect(migration).toMatch(/record_benefit_wallet_event/);
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.record_benefit_wallet_event[\s\S]*INSERT INTO public\.financial_movements[\s\S]*INSERT INTO public\.benefit_wallet_events/,
    );
    expect(migration).toMatch(/UNIQUE \(user_id, idempotency_key\)/);
    expect(migration).toMatch(/UNIQUE \(month_check_row_id\)/);
    expect(migration).toMatch(
      /FOREIGN KEY \(month_check_row_id, user_id\)[\s\S]*month_check_rows\(id, user_id\)/i,
    );
    expect(migration).toMatch(/Transfers to or from benefit wallets are not supported/);
    expect(migration).toMatch(
      /Users select own benefit wallet events[\s\S]*auth\.uid\(\) = user_id/,
    );
    expect(migration).toMatch(/IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'/);
    expect(migration).toMatch(/Credit card invoices must be paid from a bank or cash account/);
    expect(migration).toMatch(/Unlink the VA purchase before changing its date, type, or amount/);
    expect(migration).toMatch(/unlink_benefit_budget_row/);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS financial_accounts_account_type_check/);
    expect(migration).toMatch(
      /CREATE POLICY "Users select own benefit wallet events"[\s\S]*auth\.uid\(\) = user_id/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_benefit_wallet_event[\s\S]*TO authenticated/,
    );
    expect(migration).toMatch(
      /Budget row must be an unlinked expense with matching date and full amount/,
    );
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE) public\.month_check_rows/i);
    const backup = readFileSync(new URL("./backup.functions.ts", import.meta.url), "utf8");
    expect(backup).toMatch(/benefit_wallet_events/);
  });
});
