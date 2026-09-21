import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  totalInvestido: number;
  patrimonioTotal: number;
};

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
      .select("year, month, tipo, valor")
      .eq("user_id", userId)
      .not("transaction_date", "is", null); // Apenas Lançamentos reais

    if (error) throw new Error(error.message);

    const map = new Map<string, MonthlyTotal>();
    for (const r of data ?? []) {
      const v = Number(r.valor) || 0;
      if (v === 0) continue;
      const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
      let cur = map.get(key);
      if (!cur) {
        cur = { year: r.year as number, month: r.month as number, entradas: 0, saidas: 0, saldo: 0 };
        map.set(key, cur);
      }
      if (r.tipo === "entrada") cur.entradas += v;
      else cur.saidas += v;
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
 * Retorna totais de entradas/saídas/saldo para um mês específico.
 * Fonte: month_check_rows com transaction_date no período.
 */
export const getMonthTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month: number }) => monthSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const fromDate = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const toDate = `${data.year}-${String(data.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data: rows, error } = await supabase
      .from("month_check_rows")
      .select("tipo, valor")
      .eq("user_id", userId)
      .not("transaction_date", "is", null)
      .gte("transaction_date", fromDate)
      .lte("transaction_date", toDate);

    if (error) throw new Error(error.message);

    let entradas = 0;
    let saidas = 0;
    for (const r of rows ?? []) {
      const v = Number(r.valor) || 0;
      if (r.tipo === "entrada") entradas += v;
      else saidas += v;
    }

    return { year: data.year, month: data.month, entradas, saidas, saldo: entradas - saidas };
  });

// ─── getAccumulatedWithPatrimony ─────────────────────────────────────────────

/**
 * Retorna histórico mês a mês com saldo acumulado + patrimônio total.
 * Usa ativos.saldo_atual como base do total investido (soma dos ativos).
 * Patrimônio = saldo acumulado + total investido.
 */
export const getAccumulatedWithPatrimony = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [monthlyResult, ativosResult] = await Promise.all([
      supabase
        .from("month_check_rows")
        .select("year, month, tipo, valor")
        .eq("user_id", userId)
        .not("transaction_date", "is", null),
      supabase
        .from("ativos")
        .select("saldo_atual")
        .eq("user_id", userId),
    ]);

    if (monthlyResult.error) throw new Error(monthlyResult.error.message);
    if (ativosResult.error) throw new Error(ativosResult.error.message);

    // Calcular total investido atual (soma dos saldos_atuais dos ativos)
    const totalInvestido = (ativosResult.data ?? []).reduce(
      (s, a) => s + (Number(a.saldo_atual) || 0),
      0,
    );

    // Agrupar por mês
    const map = new Map<string, MonthlyTotal>();
    for (const r of monthlyResult.data ?? []) {
      const v = Number(r.valor) || 0;
      if (v === 0) continue;
      const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
      let cur = map.get(key);
      if (!cur) {
        cur = { year: r.year as number, month: r.month as number, entradas: 0, saidas: 0, saldo: 0 };
        map.set(key, cur);
      }
      if (r.tipo === "entrada") cur.entradas += v;
      else cur.saidas += v;
    }

    const sorted = Array.from(map.values())
      .map((m) => ({ ...m, saldo: m.entradas - m.saidas }))
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));

    let acc = 0;
    const result: AccumulatedSnapshot[] = sorted.map((m) => {
      acc += m.saldo;
      return {
        ...m,
        saldoAcumulado: acc,
        totalInvestido,
        patrimonioTotal: acc + totalInvestido,
      };
    });

    return { months: result, totalInvestido, saldoAcumulado: acc, patrimonioTotal: acc + totalInvestido };
  });

// ─── getLast3MonthsAverages ──────────────────────────────────────────────────

/**
 * Retorna médias dos últimos N meses com dados reais (padrão: 3).
 * Usado pela projeção automática na Visão Geral.
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
      .select("year, month, tipo, valor, expense_class")
      .eq("user_id", userId)
      .not("transaction_date", "is", null);

    if (error) throw new Error(error.message);

    // Agrupar por mês
    type MonthBucket = { renda: number; fixos: number; variaveis: number; hasValue: boolean };
    const byMonth = new Map<string, MonthBucket>();

    for (const r of rows ?? []) {
      const v = Number(r.valor) || 0;
      const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
      const cur = byMonth.get(key) ?? { renda: 0, fixos: 0, variaveis: 0, hasValue: false };
      if (v > 0) cur.hasValue = true;
      if (r.tipo === "entrada") cur.renda += v;
      else if (r.expense_class === "fixo") cur.fixos += v;
      else cur.variaveis += v;
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
