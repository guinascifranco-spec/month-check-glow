import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatFinancialCycleRange, getFinancialCycle } from "@/lib/financial-cycle";
import { addDays, computeDailyBudget, simulatePurchase, tomorrowMessage, variableSpend, type BudgetDay } from "@/lib/daily-budget";
import { getCalendarData, saveReservedAmount } from "@/lib/daily-budget.functions";

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário financeiro — Month Check" },
      { name: "description", content: "Quanto você pode gastar hoje e como cada dia afeta o restante do ciclo." },
      { property: "og:title", content: "Calendário financeiro — Month Check" },
      { property: "og:description", content: "Orçamento diário dinâmico com compensação automática de gastos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const parseMoney = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const statusClass: Record<BudgetDay["status"], string> = {
  good: "bg-success",
  warn: "bg-warning",
  over: "bg-destructive",
  future: "bg-transparent",
  idle: "bg-muted-foreground/40",
};

function CalendarPage() {
  const today = localToday();
  const [anchor, setAnchor] = useState(today);
  const cycle = getFinancialCycle(anchor);
  const fetchData = useServerFn(getCalendarData);
  const saveReserved = useServerFn(saveReservedAmount);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["calendar", cycle.startInclusive],
    queryFn: () => fetchData({ data: { cycleStart: cycle.startInclusive, cycleEnd: cycle.endExclusive } }),
  });

  const budget = useMemo(
    () => (data ? computeDailyBudget({ ...data, cycleStart: cycle.startInclusive, cycleEnd: cycle.endExclusive, today }) : null),
    [data, cycle.startInclusive, cycle.endExclusive, today],
  );

  const [selected, setSelected] = useState<BudgetDay | null>(null);
  const [simText, setSimText] = useState("");
  const [reservedText, setReservedText] = useState("");
  useEffect(() => {
    if (data) setReservedText(data.reserved ? String(data.reserved).replace(".", ",") : "");
  }, [data]);

  const reserveMutation = useMutation({
    mutationFn: (amount: number) => saveReserved({ data: { amount } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });

  const isCurrent = today >= cycle.startInclusive && today < cycle.endExclusive;
  const sim = budget && parseMoney(simText) > 0 ? simulatePurchase(budget, parseMoney(simText)) : null;
  const t = budget?.totals;
  const leading = budget ? new Date(`${cycle.startInclusive}T00:00:00Z`).getUTCDay() : 0;

  return (
    <div className="finance-app min-h-screen px-4 pb-8 pt-4 sm:px-8 sm:py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendário financeiro</h1>
            <p className="text-sm text-muted-foreground">Quanto você pode gastar por dia sem comprometer o ciclo.</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Ciclo anterior" onClick={() => setAnchor(addDays(cycle.startInclusive, -1))}>
              <ChevronLeft />
            </Button>
            <span className="min-w-[190px] text-center text-sm font-medium tabular-nums">{formatFinancialCycleRange(cycle)}</span>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Próximo ciclo" onClick={() => setAnchor(cycle.endExclusive)}>
              <ChevronRight />
            </Button>
            {!isCurrent && (
              <Button variant="outline" size="sm" className="ml-2 h-9" onClick={() => setAnchor(today)}>Hoje</Button>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">Não foi possível carregar o calendário.</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {budget && t && (
          <>
            {isCurrent && budget.today && (
              <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
                <Metric label="Disponível hoje" value={brl(budget.today.available)} />
                <Metric label="Gasto hoje" value={brl(budget.today.spent)} tone={budget.today.spent > budget.today.available ? "neg" : undefined} />
                <Metric label="Seu orçamento de amanhã" value={brl(t.tomorrow)} />
                <p className="bg-card px-4 py-3 text-sm sm:col-span-3">{tomorrowMessage(budget)}</p>
              </section>
            )}

            {t.variableBudget <= 0 && t.income === 0 && (
              <p className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
                Não há receitas previstas na Conferência deste mês. Cadastre-as para calcular o orçamento diário.
              </p>
            )}

            <section className="rounded-lg border border-border bg-card">
              <div className="hidden grid-cols-7 border-b border-border text-center text-xs font-medium text-muted-foreground md:grid">
                {WEEK.map((w) => <div key={w} className="py-2">{w}</div>)}
              </div>
              <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-7 md:divide-y-0">
                {Array.from({ length: leading }).map((_, i) => <div key={`e${i}`} className="hidden border-b border-r border-border md:block" />)}
                {budget.days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setSelected(d)}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-accent md:min-h-[92px] md:flex-col md:items-stretch md:justify-start md:border-b md:border-r md:border-border",
                      d.date === today && "bg-accent/60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", statusClass[d.status], d.status === "future" && "border border-border")} />
                      <span className="text-sm font-medium tabular-nums">
                        {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                        <span className="ml-1 text-xs text-muted-foreground md:hidden">{WEEK[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}</span>
                      </span>
                    </div>
                    <div className="text-right text-xs tabular-nums md:text-left">
                      <div className="text-muted-foreground">{brl(d.available)}</div>
                      {d.status !== "future" && (
                        <>
                          <div>{d.spent ? `− ${brl(d.spent)}` : "sem gastos"}</div>
                          <div className={d.balance < 0 ? "text-destructive" : "text-success"}>{brl(d.balance)}</div>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                <Legend cls="bg-success" label="Abaixo do orçamento" />
                <Legend cls="bg-warning" label="Perto do limite" />
                <Legend cls="bg-destructive" label="Acima do orçamento" />
                <span>Valores: disponível · gasto · saldo do dia</span>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold">Situação do ciclo</h2>
                <dl className="space-y-1.5 text-sm">
                  <Row label="Receitas previstas" value={brl(t.income)} />
                  <Row label="Despesas fixas previstas" value={`− ${brl(t.fixed)}`} />
                  <Row label="Parcelas e assinaturas do mês" value={`− ${brl(t.installments)}`} />
                  {t.reserved > 0 && <Row label="Reservado para metas" value={`− ${brl(t.reserved)}`} />}
                  <Row label="Orçamento variável do ciclo" value={brl(t.variableBudget)} strong />
                  <Row label="Gasto variável realizado" value={brl(t.spent)} />
                  <Row label="Orçamento variável restante" value={brl(t.remaining)} strong neg={t.remaining < 0} />
                  <Row label={t.accumulated >= 0 ? "Economia acumulada" : "Excesso acumulado"} value={brl(Math.abs(t.accumulated))} neg={t.accumulated < 0} />
                  <Row label="Planejado por dia" value={brl(t.plannedPerDay)} />
                  <Row label="Saldo projetado no fim (seguindo o limite)" value={brl(Math.max(0, t.projectedEnd) && 0)} />
                </dl>
                {t.deficit > 0 && (
                  <p className="mt-3 text-sm text-destructive">
                    O ciclo ultrapassou o orçamento em {brl(t.deficit)}. Mesmo sem gastar nada nos {t.daysLeftAfterToday} dias restantes não é possível recuperar com o orçamento variável — será preciso usar receitas extras ou a reserva.
                  </p>
                )}
                <div className="mt-4 flex items-end gap-2 border-t border-border pt-3">
                  <div className="flex-1">
                    <Label htmlFor="reserved" className="text-xs text-muted-foreground">Reservar para metas por ciclo (R$)</Label>
                    <Input id="reserved" inputMode="decimal" value={reservedText} onChange={(e) => setReservedText(e.target.value)} className="h-11" placeholder="0,00" />
                  </div>
                  <Button variant="outline" className="h-11" disabled={reserveMutation.isPending} onClick={() => reserveMutation.mutate(parseMoney(reservedText))}>
                    Salvar
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="mb-1 text-sm font-semibold">E se eu gastar…?</h2>
                <p className="mb-3 text-xs text-muted-foreground">Simulação apenas. Nada é registrado.</p>
                <Input inputMode="decimal" value={simText} onChange={(e) => setSimText(e.target.value)} placeholder="Valor da compra, ex.: 300" className="h-11" />
                {sim && (
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <Row label="Orçamento restante depois" value={brl(sim.remainingAfter)} neg={sim.exceedsBudget} />
                    <Row label="Novo limite diário" value={brl(sim.newTomorrow)} />
                    <Row label="Redução por dia" value={brl(sim.reductionPerDay)} />
                    <p className={cn("pt-2 text-sm", sim.exceedsBudget ? "text-destructive" : "text-muted-foreground")}>
                      {sim.touchesReserve
                        ? "Essa compra passa do orçamento variável e consumiria parte do valor reservado para metas."
                        : sim.exceedsBudget
                          ? "Essa compra ultrapassa o orçamento variável do ciclo e comprometeria despesas fixas ou parcelas."
                          : `Cabe no ciclo: seus próximos ${Math.max(1, t.daysLeftAfterToday)} dias ficariam com ${brl(sim.newTomorrow)} por dia.`}
                    </p>
                  </dl>
                )}
              </div>
            </section>
            <p className="text-xs text-muted-foreground">
              Receitas e despesas fixas vêm da Conferência; gastos do dia vêm de Lançamentos (compras no cartão pela data da compra, apenas a sua parte).
              Pagamentos de fatura e transferências não contam como gasto. O limite do cartão não é considerado dinheiro disponível.
            </p>
          </>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {selected && budget && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.date.split("-").reverse().join("/")}</SheetTitle>
                <SheetDescription>Detalhes do dia no ciclo atual.</SheetDescription>
              </SheetHeader>
              <dl className="mt-4 space-y-1.5 px-4 text-sm">
                <Row label="Orçamento disponível" value={brl(selected.available)} />
                <Row label="Gasto variável" value={brl(selected.spent)} />
                <Row label="Restante" value={brl(selected.balance)} neg={selected.balance < 0} strong />
                {selected.status !== "future" && (() => {
                  const left = budget.days.length - budget.days.indexOf(selected) - 1;
                  return left > 0 ? (
                    <p className="pt-2 text-muted-foreground">
                      Impacto: {selected.balance < 0 ? "reduziu" : "aumentou"} cerca de {brl(Math.abs(selected.balance) / left)} por dia nos {left} dias seguintes.
                    </p>
                  ) : null;
                })()}
              </dl>
              <div className="mt-6 px-4">
                <h3 className="mb-2 text-sm font-semibold">Lançamentos</h3>
                {selected.rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lançamento neste dia.</p>}
                <ul className="divide-y divide-border">
                  {selected.rows.map((r) => {
                    const counted = variableSpend(r) / 100;
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="truncate">{r.descricao}</div>
                          <div className="text-xs text-muted-foreground">
                            {counted ? "Conta no orçamento diário" : r.invoice_payment ? "Pagamento de fatura — não conta" : r.expense_class === "fixo" ? "Despesa fixa — já prevista" : (r.invoice_installment_total ?? 0) > 1 ? "Parcela — já prevista" : r.tipo === "entrada" ? "Entrada" : "Não conta"}
                          </div>
                        </div>
                        <span className="tabular-nums">{brl(Number(r.valor))}</span>
                      </li>
                    );
                  })}
                </ul>
                <Button asChild variant="outline" className="mt-4 h-11 w-full">
                  <Link to="/lancamentos">Abrir Lançamentos</Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "neg" }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold tabular-nums", tone === "neg" && "text-destructive")}>{value}</div>
    </div>
  );
}
function Row({ label, value, strong, neg }: { label: string; value: string; strong?: boolean; neg?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold", neg && "text-destructive")}>{value}</dd>
    </div>
  );
}
function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", cls)} />{label}</span>;
}
