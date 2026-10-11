import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { getFinancialCycle } from "./financial-cycle";
import { personalContribution } from "./personal-finance";
import { reversedInvestmentRecordIds } from "./investment-reversals";

// Evaluate the actual handler body without invoking transport/auth or a connected client.
// Module mocks would otherwise leak into unrelated tests in Bun's shared process.
function handler(file: string, name: string) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\s*$/gm, "")
    .replace(/export /g, "");
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const builder = () => ({ middleware() { return this; }, inputValidator() { return this; }, handler(fn: unknown) { return fn; } });
  return new Function("createServerFn", "z", "personalContribution", "getFinancialCycle", "requireSupabaseAuth", "financialSchema", "reversedInvestmentRecordIds", `${js}; return ${name};`)(
    builder, z, personalContribution, getFinancialCycle, {}, (client: unknown) => client, reversedInvestmentRecordIds,
  );
}

function client(tables: Record<string, unknown[]>) {
  const reads: string[] = [];
  return { reads, from(table: string) {
    reads.push(table);
    const result = { data: tables[table] ?? [], error: null };
    const query = { select() { return this; }, eq() { return this; }, not() { return this; }, order() { return this; },
      then(resolve: (value: typeof result) => unknown) { return Promise.resolve(result).then(resolve); } };
    return query;
  } };
}

test("actual accumulated handler excludes reversed cost and includes earlier cycles without budget rows", async () => {
  const supabase = client({
    month_check_rows: [{ transaction_date: "2026-10-05", tipo: "entrada", valor: 500 }],
    ativos: [{ id: "brl", currency_code: "BRL" }, { id: "usd", currency_code: "USD" }],
    aportes: [
      { id: "legacy", ativo_id: "brl", data: "2026-08-05", valor_total: 100 },
      { id: "cancelled", ativo_id: "brl", data: "2026-09-05", valor_total: 200 },
      { id: "active", ativo_id: "brl", data: "2026-10-05", valor_total: 300 },
      { id: "foreign", ativo_id: "usd", data: "2026-08-05", valor_total: 50 },
      { id: "future", ativo_id: "brl", data: "2026-12-05", valor_total: 400 },
    ],
    investment_cash_operations: [{ id: "op", aporte_id: "cancelled", provento_id: null }],
    investment_operation_reversals: [{ source_operation_id: "op" }],
  });
  const result = await handler("./shared-metrics.functions.ts", "getAccumulatedWithPatrimony")({ context: { supabase, userId: "owner" } });
  expect(result.totalInvestido).toBe(800);
  expect(result.months[0].totalInvestidoByCurrency).toEqual({ BRL: 400, USD: 50 });
  expect(result.months[0].patrimonioTotal).toBeNull();
  expect(result.saldoAcumulado).toBe(500);
});

test("actual projection preserves deficit despite reserve withdrawals, contributions and transfers in cash ledger", async () => {
  const supabase = client({
    month_check_rows: [
      { transaction_date: "2026-10-05", descricao: "Salário", tipo: "entrada", valor: 500 },
      { transaction_date: "2026-10-07", descricao: "Consumo", tipo: "saida", valor: 700, expense_class: "variavel" },
      { transaction_date: "2026-10-15", descricao: "Fatura", tipo: "saida", valor: 700, invoice_payment: true },
    ],
    installments: [],
    financial_movements: [{ movement_type: "income", amount: 200, description: "Resgate" }],
  });
  const result = await handler("./future-view.functions.ts", "getFutureProjection")({ data: { months: 2 }, context: { supabase, userId: "owner" } });
  expect(result.assumptions.averageIncome).toBe(500);
  expect(result.assumptions.averageVariables).toBe(700);
  expect(result.months.map((month: { saldo: number }) => month.saldo)).toEqual([-200, -200]);
  expect(supabase.reads).toEqual(["month_check_rows", "installments"]);
});