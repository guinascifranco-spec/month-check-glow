import { personalContribution, type FinancialRow } from "./personal-finance";

/** Cents helpers keep every calculation exact. */
const toCents = (v: number) => Math.round(v * 100);
const fromCents = (c: number) => c / 100;

export type BudgetRow = FinancialRow & {
  id: string;
  descricao: string;
  transaction_date: string | null;
  expense_class: string;
  invoice_installment_total?: number | null;
};

export type PlanItem = { tipo: string; expense_class: string; valor: number };
export type InstallmentPlan = { first_date: string; installment_value: number; total_installments: number; kind?: string | null };

export type BudgetInput = {
  cycleStart: string; // inclusive, YYYY-MM-DD
  cycleEnd: string; // exclusive
  today: string;
  planItems: PlanItem[]; // Conferência items of the cycle's month
  installments: InstallmentPlan[];
  rows: BudgetRow[]; // dated Lançamentos inside the cycle
  reserved: number;
};

export type DayStatus = "good" | "warn" | "over" | "future" | "idle";
export type BudgetDay = {
  date: string;
  available: number; // what could be spent that day given prior behaviour
  spent: number;
  balance: number; // available - spent
  status: DayStatus;
  rows: BudgetRow[];
};

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Month the cycle belongs to: a cycle starting on day 2 of M belongs to M. */
export function cycleMonth(cycleStart: string) {
  return { year: Number(cycleStart.slice(0, 4)), month: Number(cycleStart.slice(5, 7)) };
}

export function installmentDueInMonth(item: InstallmentPlan, year: number, month: number): number {
  const fy = Number(item.first_date.slice(0, 4));
  const fm = Number(item.first_date.slice(5, 7));
  const offset = (year - fy) * 12 + (month - fm);
  if (item.kind === "assinatura") return offset >= 0 ? item.installment_value : 0;
  return offset >= 0 && offset < item.total_installments ? item.installment_value : 0;
}

/**
 * Variable spending: personal part of dated expenses that are not fixed bills,
 * not invoice payments and not installment lines (installments are planned
 * commitments, so counting their lines again would duplicate them).
 */
export function variableSpend(row: BudgetRow): number {
  if (row.expense_class === "fixo") return 0;
  if ((row.invoice_installment_total ?? 0) > 1) return 0;
  return toCents(personalContribution(row).expense);
}

export function computeDailyBudget(input: BudgetInput) {
  const { year, month } = cycleMonth(input.cycleStart);
  const income = input.planItems.filter((i) => i.tipo === "entrada").reduce((s, i) => s + toCents(Number(i.valor)), 0);
  // Invoice payments in Conferência (variable outflows) are not new expenses.
  const fixed = input.planItems
    .filter((i) => i.tipo === "saida" && i.expense_class === "fixo")
    .reduce((s, i) => s + toCents(Number(i.valor)), 0);
  const installments = input.installments.reduce((s, i) => s + toCents(installmentDueInMonth(i, year, month)), 0);
  const reserved = toCents(Math.max(0, input.reserved));
  const variableBudget = income - fixed - installments - reserved;
  const totalDays = daysBetween(input.cycleStart, input.cycleEnd);
  const planned = totalDays > 0 ? Math.floor(variableBudget / totalDays) : 0;

  const byDate = new Map<string, BudgetRow[]>();
  for (const r of input.rows) {
    if (!r.transaction_date || r.transaction_date < input.cycleStart || r.transaction_date >= input.cycleEnd) continue;
    byDate.set(r.transaction_date, [...(byDate.get(r.transaction_date) ?? []), r]);
  }

  const days: BudgetDay[] = [];
  let spentBefore = 0;
  let assumedFuture = 0;
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(input.cycleStart, i);
    const rows = byDate.get(date) ?? [];
    const spent = rows.reduce((s, r) => s + variableSpend(r), 0);
    const remainingDays = totalDays - i;
    const available = Math.max(0, Math.floor((variableBudget - spentBefore - assumedFuture) / remainingDays));
    const isFuture = date > input.today;
    let status: DayStatus = "future";
    if (!isFuture) {
      if (spent === 0) status = available > 0 ? "good" : "idle";
      else if (spent > available) status = "over";
      else if (spent >= available * 0.8) status = "warn";
      else status = "good";
    }
    days.push({ date, available: fromCents(available), spent: fromCents(spent), balance: fromCents(available - spent), status, rows });
    if (!isFuture) spentBefore += spent;
    else assumedFuture += available; // future days assume the recommended limit is followed
  }

  const todayIdx = days.findIndex((d) => d.date === input.today);
  const spentTotal = spentBefore;
  const remaining = variableBudget - spentTotal;
  const elapsedDays = todayIdx >= 0 ? todayIdx + 1 : input.today >= input.cycleEnd ? totalDays : 0;
  const daysLeftAfterToday = totalDays - elapsedDays;
  const accumulated = planned * elapsedDays - spentTotal; // savings (+) or excess (-)
  const tomorrow = daysLeftAfterToday > 0 ? Math.max(0, Math.floor(remaining / daysLeftAfterToday)) : 0;
  const deficit = remaining < 0 ? -remaining : 0;

  return {
    totals: {
      income: fromCents(income),
      fixed: fromCents(fixed),
      installments: fromCents(installments),
      reserved: fromCents(reserved),
      variableBudget: fromCents(variableBudget),
      plannedPerDay: fromCents(planned),
      spent: fromCents(spentTotal),
      remaining: fromCents(remaining),
      accumulated: fromCents(accumulated),
      // Keeping the average daily spending so far for the remaining days.
      projectedEnd: fromCents(elapsedDays > 0 ? remaining - Math.round((spentTotal / elapsedDays) * daysLeftAfterToday) : remaining),
      totalDays,
      daysLeftAfterToday,
      tomorrow: fromCents(tomorrow),
      deficit: fromCents(deficit),
      recoverable: deficit === 0,
    },
    days,
    today: todayIdx >= 0 ? days[todayIdx] : null,
  };
}

export type DailyBudget = ReturnType<typeof computeDailyBudget>;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Message for "Seu orçamento de amanhã", derived only from real numbers. */
export function tomorrowMessage(b: DailyBudget): string {
  const t = b.totals;
  if (!b.today) return "Este ciclo não inclui o dia de hoje.";
  if (t.daysLeftAfterToday === 0) return "Hoje é o último dia do ciclo.";
  if (t.deficit > 0)
    return `O ciclo já passou ${brl(t.deficit)} do orçamento variável. Não há limite disponível para os próximos ${t.daysLeftAfterToday} dias sem usar receitas extras ou reservas.`;
  const diff = Math.round((b.today.available - b.today.spent) * 100) / 100;
  if (diff < 0)
    return `Hoje você gastou ${brl(-diff)} acima do planejado. Para manter seu orçamento mensal, amanhã seu limite recomendado será de ${brl(t.tomorrow)}.`;
  if (b.today.spent > 0 && diff > 0)
    return `Hoje você economizou ${brl(diff)}. Esse valor foi incorporado ao seu orçamento dos próximos dias: amanhã ${brl(t.tomorrow)}.`;
  if (b.today.spent === 0) return `Nenhum gasto variável hoje. Se continuar assim, amanhã seu limite será de ${brl(t.tomorrow)}.`;
  return `Você está dentro do planejamento. Seu orçamento diário permanece em ${brl(t.tomorrow)}.`;
}

/** Effect of a hypothetical purchase today, without recording it. */
export function simulatePurchase(b: DailyBudget, amount: number) {
  const t = b.totals;
  const days = Math.max(1, t.daysLeftAfterToday);
  const after = Math.round((t.remaining - amount) * 100) / 100;
  const newTomorrow = after > 0 ? Math.floor((after / days) * 100) / 100 : 0;
  return {
    remainingAfter: after,
    newTomorrow,
    reductionPerDay: Math.round((t.tomorrow - newTomorrow) * 100) / 100,
    exceedsBudget: after < 0,
    touchesReserve: after < 0 && t.reserved > 0 && after >= -t.reserved,
  };
}
