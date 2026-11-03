import { describe, expect, test } from "bun:test";
import { computeDailyBudget, simulatePurchase, tomorrowMessage, type BudgetRow } from "./daily-budget";

// 10-day cycle, 1000 variable budget => 100/day.
const base = {
  cycleStart: "2026-11-02",
  cycleEnd: "2026-11-12",
  planItems: [
    { tipo: "entrada", expense_class: "variavel", valor: 1500 },
    { tipo: "saida", expense_class: "fixo", valor: 500 },
  ],
  installments: [],
  reserved: 0,
};
let n = 0;
const row = (date: string, valor: number, extra: Partial<BudgetRow> = {}): BudgetRow => ({
  id: String(n++), descricao: "x", transaction_date: date, expense_class: "variavel", tipo: "saida", valor, ...extra,
});

describe("orçamento diário", () => {
  test("sem gastos: 100 por dia e amanhã 100", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-02", rows: [] });
    expect(b.totals.plannedPerDay).toBe(100);
    expect(b.today?.available).toBe(100);
    expect(b.totals.tomorrow).toBe(100);
  });
  test("excesso de 40 reduz os dias seguintes", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-02", rows: [row("2026-11-02", 140)] });
    expect(b.today?.balance).toBe(-40);
    expect(b.totals.tomorrow).toBe(95.55); // 860 / 9
    expect(b.totals.accumulated).toBe(-40);
    expect(tomorrowMessage(b)).toContain("acima do planejado");
  });
  test("economia no dia seguinte compensa o excesso", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-03", rows: [row("2026-11-02", 140), row("2026-11-03", 60)] });
    expect(b.days[1].available).toBe(95.55);
    expect(b.totals.accumulated).toBe(0);
    expect(b.totals.tomorrow).toBe(100);
  });
  test("parcelas ativas no mês viram compromisso e suas linhas não duplicam", () => {
    const b = computeDailyBudget({
      ...base, today: "2026-11-02",
      installments: [{ first_date: "2026-10-10", installment_value: 100, total_installments: 3 }],
      rows: [row("2026-11-02", 100, { invoice_installment_total: 3 })],
    });
    expect(b.totals.variableBudget).toBe(900);
    expect(b.totals.spent).toBe(0);
  });
  test("parcela já encerrada não conta", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-02", rows: [], installments: [{ first_date: "2026-01-10", installment_value: 100, total_installments: 3 }] });
    expect(b.totals.variableBudget).toBe(1000);
  });
  test("pagamento de fatura e fixos lançados não são gasto variável", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-02", rows: [row("2026-11-02", 900, { invoice_payment: true }), row("2026-11-02", 500, { expense_class: "fixo" })] });
    expect(b.totals.spent).toBe(0);
  });
  test("pagamento de fatura na Conferência não é compromisso novo", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-02", rows: [], planItems: [...base.planItems, { tipo: "saida", expense_class: "variavel", valor: 6000 }] });
    expect(b.totals.variableBudget).toBe(1000);
  });
  test("divisão com a Bia conta apenas a parte pessoal", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-02", rows: [row("2026-11-02", 200, { invoice_responsibility: "shared", invoice_personal_value: 80 })] });
    expect(b.totals.spent).toBe(80);
  });
  test("reserva para metas reduz o orçamento", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-02", rows: [], reserved: 200 });
    expect(b.totals.plannedPerDay).toBe(80);
  });
  test("ciclo negativo é informado sem limite diário negativo", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-03", rows: [row("2026-11-02", 1200)] });
    expect(b.totals.deficit).toBe(200);
    expect(b.totals.recoverable).toBe(false);
    expect(b.totals.tomorrow).toBe(0);
    expect(b.days[1].available).toBe(0);
  });
  test("gastos futuros e fora do ciclo são ignorados no acumulado", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-02", rows: [row("2026-11-05", 50), row("2026-11-12", 999)] });
    expect(b.totals.spent).toBe(0);
  });
  test("simulador não altera o orçamento", () => {
    const b = computeDailyBudget({ ...base, today: "2026-11-02", rows: [] });
    const s = simulatePurchase(b, 300);
    expect(s.remainingAfter).toBe(700);
    expect(s.newTomorrow).toBe(77.77);
    expect(b.totals.remaining).toBe(1000);
  });
});
