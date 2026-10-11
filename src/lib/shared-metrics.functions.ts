import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { personalContribution } from "./personal-finance";
import { getFinancialCycle } from "./financial-cycle";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * shared-metrics.functions.ts
 *
 * ÚNICA FONTE DE VERDADE para métricas financeiras derivadas de Lançamentos.
 * Qualquer tela que exiba entradas, saídas, saldo mensal, saldo acumulado,
 * ou patrimônio DEVE usar estas funções — nunca calcular por conta própria.
 *
 * Regra: Lançamentos (month_check_rows COM transaction_date) são o histórico oficial.
 */

// ─── Tipos compartilhados ────────────────────────────────────────────────────

export type MonthlyTotal = {
  year: number;
  month: number;
  entradas: number;
  saidas: number;
  saldo: number;
};

export type AccumulatedSnapshot = MonthlyTotal & {
  saldoAcumulado: number;
  /** BRL contribution cost accumulated through this cycle, not market value. */
  totalInvestido: number;
  totalInvestidoByCurrency: Record<string, number>;
  patrimonioTotal: null;
};

function cycleBucket(date: string) {
  const start = getFinancialCycle(date).startInclusive;
  return {
    key: start.slice(0, 7),
    year: Number(start.slice(0, 4)),
    month: Number(start.slice(5, 7)),
  };
}

// ─── getMonthlyTotals ────────────────────────────────────────────────────────

/**
 * Retorna totais de entradas, saídas e saldo por mês, ordenado cronologicamente.
 * Fonte: month_check_rows onde transaction_date IS NOT NULL (Lançamentos reais).
 * Linhas com valor 0 são excluídas do agrupamento.
 */
export const getMonthlyTotals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("month_check_rows")
      .select("transaction_date, tipo, valor, invoice_responsibility, invoice_personal_value, invoice_payment")
      .eq("user_id", userId)
      .not("transaction_date", "is", null); // Apenas Lançamentos reais

    if (error) throw new Error(error.message);

    const map = new Map<string, MonthlyTotal>();
    for (const r of data ?? []) {
      if (!r.transaction_date) continue;
      const contribution = personalContribution(r);
      const v = contribution.income + Math.abs(contribution.expense);
      if (v === 0) continue;
      const bucket = cycleBucket(r.transaction_date);
      let cur = map.get(bucket.key);
      if (!cur) {
        cur = { year: bucket.year, month: bucket.month, entradas: 0, saidas: 0, saldo: 0 };
        map.set(bucket.key, cur);
      }
      cur.entradas += contribution.income;
      cur.saidas += contribution.expense;
    }

    return Array.from(map.values())
      .map((m) => ({ ...m, saldo: m.entradas - m.saidas }))
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));
  });

// ─── getMonthTotals (mês específico) ────────────────────────────────────────

const monthSchema = z.object({
  year: z.number().int().min(1970).max(3000),
  month: z.number().int().min(1).max(12),
});

/**
 * Retorna totais para o ciclo iniciado no dia 2 do mês informado.
 * Fonte: month_check_rows com transaction_date no intervalo [início, fim).
 */
export const getMonthTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month: number }) => monthSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const cycle = getFinancialCycle(`${data.year}-${String(data.month).padStart(2, "0")}-02`);

    const { data: rows, error } = await supabase
      .from("month_check_rows")
      .select("tipo, valor, invoice_responsibility, invoice_personal_value, invoice_payment")
      .eq("user_id", userId)
      .not("transaction_date", "is", null)
      .gte("transaction_date", cycle.startInclusive)
      .lt("transaction_date", cycle.endExclusive);

    if (error) throw new Error(error.message);

    let entradas = 0;
    let saidas = 0;
    for (const r of rows ?? []) {
      const contribution = personalContribution(r);
      entradas += contribution.income;
      saidas += contribution.expense;
    }

    return { year: data.year, month: data.month, entradas, saidas, saldo: entradas - saidas };
  });

// ─── getAccumulatedWithPatrimony ─────────────────────────────────────────────

/**
 * Retorna histórico de resultado orçamentário e custo de aportes.
 * Não reconstrói patrimônio histórico: faltam avaliações de mercado e saldos
 * de caixa confiáveis por data.
 */
export const getAccumulatedWithPatrimony = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [monthlyResult, aportesResult, assetsResult] = await Promise.all([
      supabase
        .from("month_check_rows")
        .select("transaction_date, tipo, valor, invoice_responsibility, invoice_personal_value, invoice_payment")
        .eq("user_id", userId)
        .not("transaction_date", "is", null),
      supabase
        .from("aportes")
        .select("ativo_id, data, valor_total")
        .eq("user_id", userId),
      supabase.from("ativos").select("id, currency_code").eq("user_id", userId),
    ]);

    if (monthlyResult.error) throw new Error(monthlyResult.error.message);
    if (aportesResult.error) throw new Error(aportesResult.error.message);
    if (assetsResult.error) throw new Error(assetsResult.error.message);

    // Custo registrado por moeda; totalInvestido remains BRL-only for legacy projection consumers.
    const currencyByAsset = new Map((assetsResult.data ?? []).map((asset) => [asset.id, asset.currency_code]));
    const totalInvestidoByCurrency: Record<string, number> = {};
    const contributionsByCycle = new Map<string, Record<string, number>>();
    for (const aporte of aportesResult.data ?? []) {
      const currency = currencyByAsset.get(aporte.ativo_id);
      if (currency) {
        const amount = Number(aporte.valor_total) || 0;
        totalInvestidoByCurrency[currency] = (totalInvestidoByCurrency[currency] ?? 0) + amount;
        const cycle = cycleBucket(aporte.data).key;
        const byCurrency = contributionsByCycle.get(cycle) ?? {};
        byCurrency[currency] = (byCurrency[currency] ?? 0) + amount;
        contributionsByCycle.set(cycle, byCurrency);
      }
    }
    const totalInvestido = totalInvestidoByCurrency.BRL ?? 0;

    // Agrupar por mês
    const map = new Map<string, MonthlyTotal>();
    for (const r of monthlyResult.data ?? []) {
      if (!r.transaction_date) continue;
      const contribution = personalContribution(r);
      const v = contribution.income + Math.abs(contribution.expense);
      if (v === 0) continue;
      const bucket = cycleBucket(r.transaction_date);
      let cur = map.get(bucket.key);
      if (!cur) {
        cur = { year: bucket.year, month: bucket.month, entradas: 0, saidas: 0, saldo: 0 };
        map.set(bucket.key, cur);
      }
      cur.entradas += contribution.income;
      cur.saidas += contribution.expense;
    }

    const sorted = Array.from(map.values())
      .map((m) => ({ ...m, saldo: m.entradas - m.saidas }))
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));

    let acc = 0;
    const investedAcc: Record<string, number> = {};
    const result: AccumulatedSnapshot[] = sorted.map((m) => {
      acc += m.saldo;
      const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
      for (const [currency, amount] of Object.entries(contributionsByCycle.get(key) ?? {})) {
        investedAcc[currency] = (investedAcc[currency] ?? 0) + amount;
      }
      return {
        ...m,
        saldoAcumulado: acc,
        totalInvestido: investedAcc.BRL ?? 0,
        totalInvestidoByCurrency: { ...investedAcc },
        patrimonioTotal: null,
      };
    });

    return { months: result, totalInvestido, totalInvestidoByCurrency, saldoAcumulado: acc, patrimonioTotal: null };
  });

// ─── getLast3MonthsAverages ──────────────────────────────────────────────────

/**
 * Retorna médias dos últimos N ciclos financeiros com dados reais (padrão: 3).
 * Fonte: month_check_rows com transaction_date.
 */
export const getLast3MonthsAverages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lookback?: number }) =>
    z.object({ lookback: z.number().int().min(1).max(24).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const lookback = data.lookback ?? 3;

    const { data: rows, error } = await supabase
      .from("month_check_rows")
      .select("transaction_date, tipo, valor, expense_class, invoice_responsibility, invoice_personal_value, invoice_payment")
      .eq("user_id", userId)
      .not("transaction_date", "is", null);

    if (error) throw new Error(error.message);

    // Agrupar por mês
    type MonthBucket = { renda: number; fixos: number; variaveis: number; hasValue: boolean };
    const byMonth = new Map<string, MonthBucket>();

    for (const r of rows ?? []) {
      if (!r.transaction_date) continue;
      const contribution = personalContribution(r);
      const v = contribution.income + Math.abs(contribution.expense);
      const key = cycleBucket(r.transaction_date).key;
      const cur = byMonth.get(key) ?? { renda: 0, fixos: 0, variaveis: 0, hasValue: false };
      if (v > 0) cur.hasValue = true;
      cur.renda += contribution.income;
      if (r.expense_class === "fixo") cur.fixos += contribution.expense;
      else cur.variaveis += contribution.expense;
      byMonth.set(key, cur);
    }

    // Pegar os últimos N meses com dados
    const historical = [...byMonth.entries()]
      .filter(([, v]) => v.hasValue)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-lookback);

    const divisor = Math.max(1, historical.length);
    const averageIncome = historical.reduce((s, [, m]) => s + m.renda, 0) / divisor;
    const averageFixed = historical.reduce((s, [, m]) => s + m.fixos, 0) / divisor;
    const averageVariable = historical.reduce((s, [, m]) => s + m.variaveis, 0) / divisor;

    return {
      historyMonths: historical.length,
      averageIncome,
      averageFixed,
      averageVariable,
      averageExpense: averageFixed + averageVariable,
      averageBalance: averageIncome - (averageFixed + averageVariable),
    };
  });
