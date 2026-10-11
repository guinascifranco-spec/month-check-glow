import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { calculateNetWorthByCurrency } from "./net-worth";

const account = (balance: string | null, type = "bank_account", currency = "BRL") => ({
  accountType: type,
  currencyCode: currency,
  isActive: true,
  calculatedBalance: balance,
});
const asset = (value: string | null, known = value !== null, currency = "BRL") => ({
  currencyCode: currency,
  currentValueKnown: known,
  currentValue: value,
});

describe("known net worth by currency", () => {
  it("keeps a contribution or redemption between cash and investment neutral when value is unchanged", () => {
    const before = calculateNetWorthByCurrency({
      accounts: [account("1000.00")],
      assets: [asset("500.00")],
      invoices: [],
    })[0]!;
    const afterContribution = calculateNetWorthByCurrency({
      accounts: [account("800.00")],
      assets: [asset("700.00")],
      invoices: [],
    })[0]!;
    const afterRedemption = calculateNetWorthByCurrency({
      accounts: [account("1200.00")],
      assets: [asset("300.00")],
      invoices: [],
    })[0]!;
    expect(afterContribution.netWorthCents).toBe(before.netWorthCents);
    expect(afterRedemption.netWorthCents).toBe(before.netWorthCents);
  });

  it("keeps known market value independent from contributed cost", () => {
    expect(
      calculateNetWorthByCurrency({ accounts: [], assets: [asset("1250.00")], invoices: [] })[0]
        ?.investmentValueCents,
    ).toBe(125000n);
  });

  it("marks unknown assets and opening balances instead of treating them as zero", () => {
    const [row] = calculateNetWorthByCurrency({
      accounts: [account(null)],
      assets: [asset(null, false)],
      invoices: [],
    });
    expect(row?.unknownBankAccounts).toBe(1);
    expect(row?.unknownInvestments).toBe(1);
  });

  it("subtracts only invoice balances remaining after partial payments", () => {
    const [row] = calculateNetWorthByCurrency({
      accounts: [account("1000.00")],
      assets: [],
      invoices: [{ currencyCode: "BRL", remainingAmount: "300.00" }],
    });
    expect(row?.netWorthCents).toBe(70000n);
  });

  it("keeps benefit wallet visible as a separate component and includes its known value", () => {
    const [row] = calculateNetWorthByCurrency({
      accounts: [account("100.00"), account("80.00", "benefit_wallet")],
      assets: [],
      invoices: [],
    });
    expect(row?.bankCashCents).toBe(10000n);
    expect(row?.benefitBalanceCents).toBe(8000n);
    expect(row?.netWorthCents).toBe(18000n);
  });

  it("does not combine currencies", () => {
    const rows = calculateNetWorthByCurrency({
      accounts: [
        account("100.00", "bank_account", "BRL"),
        account("100.00", "bank_account", "USD"),
      ],
      assets: [],
      invoices: [],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.netWorthCents).toBe(10000n);
    expect(rows[1]?.netWorthCents).toBe(10000n);
  });

  it("counts a received dividend only through its explicit cash entry; reinvestment does not invent cash", () => {
    const before = calculateNetWorthByCurrency({
      accounts: [account("100.00")],
      assets: [asset("500.00")],
      invoices: [],
    })[0]!;
    const received = calculateNetWorthByCurrency({
      accounts: [account("110.00")],
      assets: [asset("500.00")],
      invoices: [],
    })[0]!;
    const reinvested = calculateNetWorthByCurrency({
      accounts: [account("100.00")],
      assets: [asset("510.00")],
      invoices: [],
    })[0]!;
    expect(received.netWorthCents - before.netWorthCents).toBe(1000n);
    expect(reinvested.bankCashCents).toBe(before.bankCashCents);
    expect(reinvested.netWorthCents - before.netWorthCents).toBe(1000n);
  });

  it("migration atomically links investment and cash movements, protects ownership, and leaves budget rows untouched", () => {
    const migration = readFileSync(
      new URL("../../supabase/migrations/20261014200000_investment_net_worth.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toMatch(/current_value_known boolean NOT NULL DEFAULT false/);
    expect(migration).toMatch(/current_value_date date/);
    expect(migration).toMatch(/FOREIGN KEY \(asset_id, user_id\)[\s\S]*ativos\(id, user_id\)/i);
    expect(migration).toMatch(
      /FOREIGN KEY \(financial_movement_id, user_id\)[\s\S]*financial_movements\(id, user_id\)/i,
    );
    expect(migration).toMatch(/UNIQUE \(user_id, idempotency_key\)/i);
    expect(migration).toMatch(
      /record_investment_contribution[\s\S]*INSERT INTO public\.aportes[\s\S]*INSERT INTO public\.financial_movements[\s\S]*INSERT INTO public\.investment_cash_operations/i,
    );
    expect(migration).toMatch(
      /record_investment_redemption[\s\S]*movement_type, amount[\s\S]*'income'/i,
    );
    expect(migration).toMatch(/record_investment_dividend_receipt/);
    expect(migration).toMatch(
      /Investment-linked cash movements cannot be edited or deleted independently/,
    );
    expect(migration).toMatch(
      /cash-linked investment contribution cannot be edited or deleted independently/,
    );
    expect(migration).toMatch(/cash-linked dividend cannot change its asset, date, or amount/);
    expect(migration).toMatch(/cannot change after cash operations have been recorded/);
    expect(migration).toMatch(
      /Users select own investment cash operations[\s\S]*auth\.uid\(\) = user_id/,
    );
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE) public\.month_check_rows/i);
    const backup = readFileSync(new URL("./backup.functions.ts", import.meta.url), "utf8");
    expect(backup).toMatch(/from\("investment_cash_operations"\)/);
  });
});
