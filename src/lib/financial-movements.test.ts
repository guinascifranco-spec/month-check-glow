import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  calculateAccountBalance,
  decimalToCents,
  movementInputSchema,
  transferAccountCompatibility,
  transferInputSchema,
} from "./financial-movements";

const uid1 = "11111111-1111-4111-8111-111111111111";
const uid2 = "22222222-2222-4222-8222-222222222222";
const acct1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const acct2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("financial movement rules", () => {
  test("parses cents exactly without floating point arithmetic", () => {
    expect(decimalToCents("123456789.01")).toBe(12345678901n);
    expect(decimalToCents("0.10")).toBe(10n);
    expect(decimalToCents("1.234")).toBeNull();
  });

  test("adds income and subtracts expenses from a known opening balance", () => {
    expect(
      calculateAccountBalance({ opening_balance: "100.00", opening_balance_date: "2026-10-01" }, [
        {
          movement_type: "income",
          effective_date: "2026-10-02",
          amount: "50.25",
          transfer_status: null,
        },
        {
          movement_type: "expense",
          effective_date: "2026-10-03",
          amount: "20.10",
          transfer_status: null,
        },
      ]),
    ).toEqual({ known: true, calculatedBalance: "130.15", recordedNetActivity: "30.15" });
  });

  test("supports negative, zero, and positive opening values", () => {
    const movements = [
      {
        movement_type: "income" as const,
        effective_date: "2026-10-02",
        amount: "1.00",
        transfer_status: null,
      },
    ];
    expect(
      calculateAccountBalance(
        { opening_balance: "-5.00", opening_balance_date: "2026-10-01" },
        movements,
      ).calculatedBalance,
    ).toBe("-4.00");
    expect(
      calculateAccountBalance(
        { opening_balance: "0.00", opening_balance_date: "2026-10-01" },
        movements,
      ).calculatedBalance,
    ).toBe("1.00");
    expect(
      calculateAccountBalance(
        { opening_balance: "5.00", opening_balance_date: "2026-10-01" },
        movements,
      ).calculatedBalance,
    ).toBe("6.00");
  });

  test("opening balance includes movements on its reference date but not earlier or same-day movements", () => {
    expect(
      calculateAccountBalance({ opening_balance: "100.00", opening_balance_date: "2026-10-02" }, [
        {
          movement_type: "income",
          effective_date: "2026-10-01",
          amount: "9.00",
          transfer_status: null,
        },
        {
          movement_type: "expense",
          effective_date: "2026-10-02",
          amount: "7.00",
          transfer_status: null,
        },
        {
          movement_type: "income",
          effective_date: "2026-10-03",
          amount: "1.25",
          transfer_status: null,
        },
      ]),
    ).toEqual({ known: true, calculatedBalance: "101.25", recordedNetActivity: "1.25" });
  });

  test("keeps balance unknown while showing only the net of recorded movements", () => {
    expect(
      calculateAccountBalance({ opening_balance: null, opening_balance_date: null }, [
        {
          movement_type: "income",
          effective_date: "2026-10-01",
          amount: "20.00",
          transfer_status: null,
        },
        {
          movement_type: "expense",
          effective_date: "2026-10-02",
          amount: "3.50",
          transfer_status: null,
        },
      ]),
    ).toEqual({ known: false, calculatedBalance: null, recordedNetActivity: "16.50" });
  });

  test("does not present a future opening balance as a current balance", () => {
    expect(
      calculateAccountBalance(
        { opening_balance: "250.00", opening_balance_date: "2026-11-01" },
        [
          {
            movement_type: "income",
            effective_date: "2026-11-02",
            amount: "10.00",
            transfer_status: null,
          },
        ],
        "2026-10-31",
      ),
    ).toEqual({ known: false, calculatedBalance: null, recordedNetActivity: "0.00" });
  });

  test("transfers decrease one account and increase the other without budget impact", () => {
    const outgoing = calculateAccountBalance(
      { opening_balance: "100.00", opening_balance_date: "2026-10-01" },
      [
        {
          movement_type: "transfer_out",
          effective_date: "2026-10-03",
          amount: "25.75",
          transfer_status: "completed",
        },
      ],
    );
    const incoming = calculateAccountBalance(
      { opening_balance: "10.00", opening_balance_date: "2026-10-01" },
      [
        {
          movement_type: "transfer_in",
          effective_date: "2026-10-03",
          amount: "25.75",
          transfer_status: "completed",
        },
      ],
    );
    expect(outgoing.calculatedBalance).toBe("74.25");
    expect(incoming.calculatedBalance).toBe("35.75");
  });

  test("ignores both legs of a cancelled transfer", () => {
    expect(
      calculateAccountBalance({ opening_balance: "100.00", opening_balance_date: "2026-10-01" }, [
        {
          movement_type: "transfer_out",
          effective_date: "2026-10-03",
          amount: "25.00",
          transfer_status: "cancelled",
        },
      ]).calculatedBalance,
    ).toBe("100.00");
  });

  test("rejects zero, negative, over-precision amounts and invalid dates", () => {
    const base = {
      account_id: acct1,
      effective_date: "2026-10-02",
      movement_type: "expense",
      amount: "10.00",
      description: "Conta de luz",
      category_id: null,
    };
    expect(movementInputSchema.safeParse({ ...base, amount: "0.00" }).success).toBe(false);
    expect(movementInputSchema.safeParse({ ...base, amount: "-1.00" }).success).toBe(false);
    expect(movementInputSchema.safeParse({ ...base, amount: "1.009" }).success).toBe(false);
    expect(movementInputSchema.safeParse({ ...base, effective_date: "2026-02-30" }).success).toBe(
      false,
    );
  });

  test("rejects same-account transfer requests and handles account incompatibility", () => {
    const input = {
      from_account_id: acct1,
      to_account_id: acct2,
      effective_date: "2026-10-02",
      amount: "10.00",
      description: "Reserva",
    };
    expect(transferInputSchema.safeParse({ ...input, to_account_id: acct1 }).success).toBe(false);
    expect(
      transferAccountCompatibility(
        { user_id: uid1, currency_code: "BRL", is_active: true },
        { user_id: uid1, currency_code: "USD", is_active: true },
      ),
    ).toEqual({ ok: false, reason: "different_currencies" });
    expect(
      transferAccountCompatibility(
        { user_id: uid1, currency_code: "BRL", is_active: true },
        { user_id: uid2, currency_code: "BRL", is_active: true },
      ),
    ).toEqual({ ok: false, reason: "different_users" });
    expect(
      transferAccountCompatibility(
        { user_id: uid1, currency_code: "BRL", is_active: false },
        { user_id: uid1, currency_code: "BRL", is_active: true },
      ),
    ).toEqual({ ok: false, reason: "inactive_account" });
  });

  test("migration restricts ownership, atomic transfer writes, and isolated leg edits", () => {
    const migration = readFileSync(
      new URL("../../supabase/migrations/20261011200000_financial_movements.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toMatch(
      /FOREIGN KEY \(account_id, user_id\)[\s\S]*REFERENCES public\.financial_accounts\(id, user_id\)/i,
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_financial_transfer[\s\S]*INSERT INTO public\.financial_movements[\s\S]*transfer_out[\s\S]*transfer_in/i,
    );
    expect(migration).toMatch(/DEFERRABLE INITIALLY DEFERRED/i);
    expect(migration).toMatch(/Transfer legs cannot be edited independently/i);
    expect(migration).toMatch(/status = 'cancelled'/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_financial_transfer/i);
    expect(migration).toMatch(/Both accounts must belong to this user and be active/i);
    expect(migration).toMatch(/Transfers between different currencies are not supported/i);
    expect(migration).toMatch(/a\.opening_balance_date > p_as_of_date THEN NULL/i);
    expect(migration).not.toMatch(
      /GRANT (INSERT|UPDATE|DELETE)[^;]*financial_movements TO authenticated/i,
    );
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE) public\.month_check_rows/i);
  });
});
