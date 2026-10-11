import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  didOpeningBalanceChange,
  financialAccountStatusPatch,
  financialAccountInputSchema,
  openingBalanceLabel,
  type FinancialAccount,
} from "./financial-accounts";

const account = (values: Partial<FinancialAccount> = {}): FinancialAccount => ({
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Conta principal",
  account_type: "bank_account",
  currency_code: "BRL",
  opening_balance: null,
  opening_balance_date: null,
  is_active: true,
  created_at: "2026-10-11T12:00:00.000Z",
  updated_at: "2026-10-11T12:00:00.000Z",
  ...values,
});

describe("financial account opening balance", () => {
  test("allows an account with unknown opening balance", () => {
    const result = financialAccountInputSchema.parse({
      name: "Conta principal",
      account_type: "bank_account",
      currency_code: "BRL",
      opening_balance: null,
      opening_balance_date: null,
    });
    expect(openingBalanceLabel(account(result))).toEqual({
      known: false,
      amount: null,
      referenceDate: null,
    });
  });

  test("preserves an explicitly informed zero balance", () => {
    const result = financialAccountInputSchema.parse({
      name: "Carteira",
      account_type: "wallet",
      currency_code: "BRL",
      opening_balance: 0,
      opening_balance_date: "2026-10-01",
    });
    expect(openingBalanceLabel(account(result))).toEqual({
      known: true,
      amount: 0,
      referenceDate: "2026-10-01",
    });
  });

  test("accepts positive balances and preserves the civil reference date", () => {
    const result = financialAccountInputSchema.parse({
      name: "Poupança",
      account_type: "bank_account",
      currency_code: "BRL",
      opening_balance: 1234.56,
      opening_balance_date: "2024-02-29",
    });
    expect(openingBalanceLabel(account(result))).toEqual({
      known: true,
      amount: 1234.56,
      referenceDate: "2024-02-29",
    });
    expect(
      financialAccountInputSchema.safeParse({ ...result, opening_balance_date: "2025-02-29" })
        .success,
    ).toBe(false);
  });

  test("requires the opening amount and reference date as a pair", () => {
    expect(
      financialAccountInputSchema.safeParse({
        name: "Conta",
        account_type: "other",
        currency_code: "BRL",
        opening_balance: 10,
        opening_balance_date: null,
      }).success,
    ).toBe(false);
  });

  test("requires explicit confirmation whenever an existing opening value changes", () => {
    const existing = account({ opening_balance: 100, opening_balance_date: "2026-10-01" });
    expect(
      didOpeningBalanceChange(existing, {
        opening_balance: 100,
        opening_balance_date: "2026-10-01",
      }),
    ).toBe(false);
    expect(
      didOpeningBalanceChange(existing, { opening_balance: 0, opening_balance_date: "2026-10-01" }),
    ).toBe(true);
  });

  test("account input has no budget or transaction fields", () => {
    const parsed = financialAccountInputSchema.parse({
      name: "Conta",
      account_type: "bank_account",
      currency_code: "BRL",
      opening_balance: 50,
      opening_balance_date: "2026-10-01",
    });
    expect(parsed).not.toHaveProperty("tipo");
    expect(parsed).not.toHaveProperty("transaction_date");
    expect(parsed).not.toHaveProperty("month_check_row_id");
  });

  test("deactivation changes status only and preserves the account record", () => {
    expect(financialAccountStatusPatch(false)).toEqual({ is_active: false });
    expect(financialAccountStatusPatch(false)).not.toHaveProperty("id");
    expect(financialAccountStatusPatch(false)).not.toHaveProperty("delete");
  });

  test("migration enables owner-only RLS and does not grant account deletion", () => {
    const migration = readFileSync(
      new URL("../../supabase/migrations/20261011190000_financial_accounts.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/FOR SELECT TO authenticated\s+USING \(auth\.uid\(\) = user_id\)/i);
    expect(migration).toMatch(
      /FOR INSERT TO authenticated\s+WITH CHECK \(auth\.uid\(\) = user_id\)/i,
    );
    expect(migration).toMatch(
      /FOR UPDATE TO authenticated\s+USING \(auth\.uid\(\) = user_id\)\s+WITH CHECK \(auth\.uid\(\) = user_id\)/i,
    );
    expect(migration).not.toMatch(/GRANT[^;]*DELETE[^;]*financial_accounts/i);
    expect(migration).not.toMatch(/financial_accounts FOR DELETE/i);
  });
});
