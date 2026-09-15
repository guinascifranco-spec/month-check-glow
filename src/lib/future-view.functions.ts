import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type MonthKey = `${number}-${string}`;
type ProjectionEvent = {
  id: string;
  kind: "installment" | "critical";
  year: number;
  month: number;
  title: string;
  message: string;
};

function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, amount: number) {
  const date = new Date(year, month - 1 + amount, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function monthDistance(fromYear: number, fromMonth: number, toYear: number, toMonth: number) {
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export const getFutureProjection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { months: number }) =>
    z.object({ months: z.number().int().min(1).max(60) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: rows, error: rowsError }, { data: installments, error: installmentsError }] =
      await Promise.all([
        supabase
          .from("month_check_rows")
          .select("year, month, descricao, tipo, valor, expense_class")
          .eq("user_id", userId)
          .order("year", { ascending: true })
          .order("month", { ascending: true }),
        supabase
          .from("installments")
          .select("id, name, first_date, installment_value, total_installments")
          .eq("user_id", userId)
          .order("first_date", { ascending: true }),
      ]);

    if (rowsError) throw new Error(rowsError.message);
    if (installmentsError) throw new Error(installmentsError.message);

    const now = new Date();
    const startYear = now.getFullYear();
    const startMonth = now.getMonth() + 1;
    const byMonth = new Map<MonthKey, { renda: number; variaveis: number; hasValue: boolean }>();
    const latestFixed = new Map<string, { order: number; valor: number }>();

    for (const row of rows ?? []) {
      const value = Number(row.valor) || 0;
      const key = monthKey(row.year, row.month);
      const current = byMonth.get(key) ?? { renda: 0, variaveis: 0, hasValue: false };
      if (value > 0) current.hasValue = true;
      if (row.tipo === "entrada") current.renda += value;
      if (row.tipo === "saida" && row.expense_class !== "fixo") current.variaveis += value;
      byMonth.set(key, current);

      if (row.tipo === "saida" && row.expense_class === "fixo") {
        const normalized = row.descricao.trim().toLocaleLowerCase("pt-BR") || `sem-nome-${key}`;
        const order = row.year * 12 + row.month;
        const previous = latestFixed.get(normalized);
        if (!previous || order >= previous.order) latestFixed.set(normalized, { order, valor: value });
      }
    }

    const installmentAmountFor = (year: number, month: number) =>
      (installments ?? []).reduce((sum, item) => {
        const [firstYear, firstMonth] = item.first_date.split("-").map(Number);
        const offset = monthDistance(firstYear, firstMonth, year, month);
        return offset >= 0 && offset < item.total_installments
          ? sum + (Number(item.installment_value) || 0)
          : sum;
      }, 0);

    const historical = [...byMonth.entries()]
      .filter(([, value]) => value.hasValue)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-3);
    const divisor = Math.max(1, historical.length);
    const averageIncome = historical.reduce((sum, [, item]) => sum + item.renda, 0) / divisor;
    const averageVariables = historical.reduce((sum, [key, item]) => {
      const [year, month] = key.split("-").map(Number);
      return sum + Math.max(0, item.variaveis - installmentAmountFor(year, month));
    }, 0) / divisor;
    const fixed = [...latestFixed.values()].reduce((sum, item) => sum + item.valor, 0);

    const months = Array.from({ length: data.months }, (_, index) => {
      const period = shiftMonth(startYear, startMonth, index);
      const parcelas = installmentAmountFor(period.year, period.month);
      const gastos = fixed + averageVariables + parcelas;
      return {
        ...period,
        renda: averageIncome,
        fixos: fixed,
        parcelas,
        variaveis: averageVariables,
        gastos,
        saldo: averageIncome - gastos,
      };
    });

    const lastPeriod = shiftMonth(startYear, startMonth, data.months - 1);
    const events: ProjectionEvent[] = (installments ?? []).flatMap((item) => {
      const [firstYear, firstMonth] = item.first_date.split("-").map(Number);
      const end = shiftMonth(firstYear, firstMonth, item.total_installments - 1);
      const offset = monthDistance(startYear, startMonth, end.year, end.month);
      if (offset < 0 || offset >= data.months) return [];
      return [{
        id: `installment-${item.id}`,
        kind: "installment" as const,
        year: end.year,
        month: end.month,
        title: "Parcela quitada",
        message: `A parcela de ${item.name} termina e libera ${Number(item.installment_value) || 0} por mês.`,
      }];
    });

    const averageSpend = months.reduce((sum, item) => sum + item.gastos, 0) / months.length;
    for (const item of months) {
      if (averageSpend > 0 && item.gastos > averageSpend) {
        events.push({
          id: `critical-${item.year}-${item.month}`,
          kind: "critical",
          year: item.year,
          month: item.month,
          title: "Mês crítico",
          message: `Os gastos ficam ${Math.round(((item.gastos / averageSpend) - 1) * 100)}% acima da média.`,
        });
      }
    }

    events.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    return {
      months,
      events,
      assumptions: { averageIncome, fixed, averageVariables, historyMonths: historical.length },
      periodEnd: lastPeriod,
    };
  });