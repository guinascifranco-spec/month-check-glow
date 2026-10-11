import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  creditCardInputSchema,
  decimalAmountToCents,
  getInvoiceStatus,
  invoiceInputSchema,
  invoicePaymentSchema,
  remainingInvoiceCents,
} from "./credit-cards";
import { personalContribution } from "./personal-finance";

const cardId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const invoiceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("credit cards and statements", () => {
  test("validates card identifiers, currency, account, and billing days", () => {
    const card = {
      id: null,
      name: "Cartão principal",
      last_four: "1234",
      currency_code: "BRL",
      payment_account_id: accountId,
      closing_day: 25,
      due_day: 3,
    };
    expect(creditCardInputSchema.safeParse(card).success).toBe(true);
    expect(creditCardInputSchema.safeParse({ ...card, last_four: "12345" }).success).toBe(false);
    expect(creditCardInputSchema.safeParse({ ...card, closing_day: 32 }).success).toBe(false);
  });

  test("validates civil invoice dates and positive exact-cent amounts", () => {
    const invoice = {
      card_id: cardId,
      period_start: "2026-10-02",
      period_end: "2026-11-01",
      closing_date: "2026-10-25",
      due_date: "2026-11-03",
      total_amount: "1234,56",
      source: "manual",
    };
    expect(invoiceInputSchema.safeParse(invoice).success).toBe(true);
    expect(invoiceInputSchema.safeParse({ ...invoice, period_end: "2026-02-30" }).success).toBe(
      false,
    );
    expect(invoiceInputSchema.safeParse({ ...invoice, total_amount: "0" }).success).toBe(false);
    expect(decimalAmountToCents("1234,56")).toBe(123456n);
  });

  test("computes open, closed, partial, paid, and overdue states from evidence", () => {
    const common = { total_amount: "100.00", due_date: "2026-11-03" };
    expect(getInvoiceStatus({ ...common, paid_amount: "0", closed_at: null }, "2026-10-30")).toBe(
      "open",
    );
    expect(
      getInvoiceStatus(
        { ...common, paid_amount: "0", closed_at: "2026-10-25T12:00:00Z" },
        "2026-10-30",
      ),
    ).toBe("closed");
    expect(
      getInvoiceStatus(
        { ...common, paid_amount: "20.00", closed_at: "2026-10-25T12:00:00Z" },
        "2026-10-30",
      ),
    ).toBe("partially_paid");
    expect(
      getInvoiceStatus(
        { ...common, paid_amount: "100.00", closed_at: "2026-10-25T12:00:00Z" },
        "2026-11-04",
      ),
    ).toBe("paid");
    expect(
      getInvoiceStatus(
        { ...common, paid_amount: "0", closed_at: "2026-10-25T12:00:00Z" },
        "2026-11-04",
      ),
    ).toBe("overdue");
  });

  test("keeps partial balances exact and validates payment idempotency keys", () => {
    expect(remainingInvoiceCents("100.00", "35.25")).toBe(6475n);
    expect(
      invoicePaymentSchema.safeParse({
        invoice_id: invoiceId,
        account_id: accountId,
        effective_date: "2026-11-03",
        amount: "35.25",
        idempotency_key: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }).success,
    ).toBe(true);
  });

  test("linking a purchase preserves the existing shared personal contribution", () => {
    expect(
      personalContribution({
        tipo: "saida",
        valor: 200,
        invoice_source: "source-hash",
        invoice_responsibility: "shared",
        invoice_personal_value: 80,
      }),
    ).toEqual({ income: 0, expense: 80, active: true });
  });

  test("migration links payments atomically, protects ownership, and preserves budget rows", () => {
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/20261012210000_credit_cards_invoices.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toMatch(
      /FOREIGN KEY \(payment_account_id, user_id\)[\s\S]*financial_accounts\(id, user_id\)/i,
    );
    expect(migration).toMatch(
      /FOREIGN KEY \(month_check_row_id, user_id\)[\s\S]*month_check_rows\(id, user_id\)/i,
    );
    expect(migration).toMatch(/paid_value \+ amount_value > total_value/i);
    expect(migration).toMatch(/idempotency_key UNIQUE \(user_id, idempotency_key\)/i);
    expect(migration).toMatch(/Payment account must be active and belong to this user/i);
    expect(migration).toMatch(/account_currency <> invoice_currency/i);
    expect(migration).toMatch(/DEFERRABLE INITIALLY DEFERRED/i);
    expect(migration).toMatch(/Each card payment must have exactly one matching cash movement/i);
    expect(migration).toMatch(/Only ordinary movements can be edited/i);
    expect(migration).toMatch(/invoice_installment_current/);
    expect(migration).toMatch(/unlink_credit_card_invoice_row/);
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE) public\.month_check_rows/i);
    const backup = readFileSync(new URL("./backup.functions.ts", import.meta.url), "utf8");
    expect(backup).toMatch(/from\("credit_cards"\)/);
    expect(backup).toMatch(/from\("credit_card_invoices"\)/);
    expect(backup).toMatch(/from\("credit_card_payments"\)/);
    expect(backup).toMatch(/from\("credit_card_invoice_items"\)/);
  });
});
