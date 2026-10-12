import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Slider } from "@/components/ui/slider";
import { getAccumulatedWithPatrimony } from "@/lib/shared-metrics.functions";
import { formatFinancialCycleRange, getFinancialCycle } from "@/lib/financial-cycle";
import { listAtivos, listProventos } from "@/lib/investments-portfolio.functions";
import { getIntegratedFinancialSnapshot, getKnownNetWorth } from "@/lib/patrimony.functions";
import { formatCents } from "@/lib/net-worth";
import { decimalToCents } from "@/lib/financial-reconciliation";

export const Route = createFileRoute("/_authenticated/visao-geral")({
  head: () => ({
    meta: [
      { title: "Visão Geral — Month Check" },
      { name: "description", content: "Patrimônio, investimentos e projeção futura." },
      { property: "og:title", content: "Visão Geral — Month Check" },
      { property: "og:description", content: "Patrimônio, investimentos e projeção futura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VisaoGeralPage,
});

type Ativo = {
  id: string;
  tipo: string;
  nome: string;
  corretora: string | null;
  saldo_atual: number;
  current_value_known: boolean;
  current_value_date: string | null;
  currency_code: string;
  rentabilidade_mensal_pct: number;
};

type MonthSnapshot = {
  year: number;
  month: number;
  entradas: number;
  saidas: number;
  saldo: number;
  saldoAcumulado: number;
  totalInvestido: number;
  patrimonioTotal: null;
};

type PatrimonyData = {
  months: MonthSnapshot[];
  totalInvestido: number;
  totalInvestidoByCurrency: Record<string, number>;
  saldoAcumulado: number;
  patrimonioTotal: null;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const currencySummary = (totals: Record<string, number>) => Object.entries(totals)
  .map(([code, value]) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(value))
  .join(" · ") || "—";
const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthLabel = (y: number, m: number) => `${MES_ABBR[m - 1]}/${String(y).slice(-2)}`;

function VisaoGeralPage() {
  const fetchPatrimony = useServerFn(getAccumulatedWithPatrimony);
  const fetchAtivos = useServerFn(listAtivos);
  const fetchProventos = useServerFn(listProventos);
  const fetchKnownNetWorth = useServerFn(getKnownNetWorth);
  const fetchIntegratedSnapshot = useServerFn(getIntegratedFinancialSnapshot);

  const patrimonyKey = ["patrimony-accumulated"] as const;
  const ativosKey = ["ativos"] as const;

  const { data: patrimony, isLoading: patrimonyLoading } = useQuery({
    queryKey: patrimonyKey,
    queryFn: () => fetchPatrimony() as Promise<PatrimonyData>,
  });

  const { data: ativos = [] } = useQuery({
    queryKey: ativosKey,
    queryFn: () => fetchAtivos() as Promise<Ativo[]>,
  });
  const { data: proventos = [] } = useQuery({
    queryKey: ["proventos"],
    queryFn: () => fetchProventos() as Promise<Array<{ valor: number; ativo_id: string }>>,
  });
  const { data: netWorth = [], isLoading: netWorthLoading } = useQuery({
    queryKey: ["known-net-worth"],
    queryFn: () => fetchKnownNetWorth(),
  });
  const { data: integratedSnapshot, isLoading: integratedLoading } = useQuery({
    queryKey: ["integrated-financial-snapshot"],
    queryFn: () => fetchIntegratedSnapshot(),
  });

  const monthly = useMemo(() => patrimony?.months ?? [], [patrimony?.months]);
  const latestMonth = monthly[monthly.length - 1];
  const totalInvestidoLabel = currencySummary(patrimony?.totalInvestidoByCurrency ?? {});
  const saldoAcumulado = patrimony?.saldoAcumulado ?? 0;
  const brlNetWorth = netWorth.find((item) => item.currencyCode === "BRL");
  const patrimonioTotal = brlNetWorth ? Number(BigInt(brlNetWorth.netWorthCents)) / 100 : 0;
  const netWorthIncomplete = !!brlNetWorth && (brlNetWorth.unknownBankAccounts > 0 || brlNetWorth.unknownInvestments > 0 || brlNetWorth.unknownBenefitWallets > 0);
  const totalProventosByCurrency = proventos.reduce<Record<string, number>>((totals, item) => {
    const code = ativos.find((asset) => asset.id === item.ativo_id)?.currency_code;
    if (code) totals[code] = (totals[code] ?? 0) + Number(item.valor);
    return totals;
  }, {});
  const totalProventosLabel = currencySummary(totalProventosByCurrency);

  // Rendimento mensal estimado (soma de saldo_atual × rentabilidade_mensal_pct / 100)
  const rendimentoMensal = useMemo(
    () =>
      ativos.reduce(
        (s, a) => s + (a.current_value_known && a.currency_code === "BRL"
          ? ((Number(a.saldo_atual) || 0) * (Number(a.rentabilidade_mensal_pct) || 0)) / 100
          : 0),
        0,
      ),
    [ativos],
  );
  const totalInvestimentoAtualBRL = ativos
    .filter((asset) => asset.current_value_known && asset.currency_code === "BRL")
    .reduce((sum, asset) => sum + Number(asset.saldo_atual), 0);

  // Historical chart data
  const histData = useMemo(() => {
    return monthly.map((m) => ({
      label: monthLabel(m.year, m.month),
      saldoMensal: m.saldo,
      saldoAcumulado: m.saldoAcumulado,
    }));
  }, [monthly]);

  // Projection
  const [horizon, setHorizon] = useState(12);
  const [modoContribuicao, setModoContribuicao] = useState<"auto" | "manual">("auto");
  const [saldoMensalFixo, setSaldoMensalFixo] = useState("");
  const projData = useMemo(() => {
    const last3 = monthly.slice(-3);
    const autoBase =
      last3.length > 0 ? last3.reduce((s, m) => s + m.saldo, 0) / last3.length : 0;
    const manualNum = parseFloat(saldoMensalFixo.replace(",", "."));
    const base =
      modoContribuicao === "manual" && !Number.isNaN(manualNum)
        ? manualNum
        : autoBase;
    const lastReal = patrimonioTotal;
    const investmentStart = brlNetWorth ? Number(BigInt(brlNetWorth.investmentValueCents)) / 100 : 0;
    const fixedComponents = lastReal - investmentStart;
    let projectedInvestments = investmentStart;
    let projectedBudgetResults = 0;

    const proj: Array<{ label: string; real: number | null; proj: number }> = [];
    if (brlNetWorth) proj.push({ label: "Atual", real: lastReal, proj: lastReal });
    const rate = totalInvestimentoAtualBRL > 0 ? rendimentoMensal / totalInvestimentoAtualBRL : 0;

    const now = new Date();
    let y = monthly.length > 0 ? monthly[monthly.length - 1].year : now.getFullYear();
    let mo = monthly.length > 0 ? monthly[monthly.length - 1].month : now.getMonth() + 1;
    for (let i = 0; i < horizon; i++) {
      mo += 1;
      if (mo > 12) { mo = 1; y += 1; }
      projectedInvestments *= 1 + rate;
      projectedBudgetResults += base;
      const projectedNetWorth = fixedComponents + projectedInvestments + projectedBudgetResults;
      proj.push({ label: monthLabel(y, mo), real: null, proj: projectedNetWorth });
    }

    const finalValue = proj[proj.length - 1]?.proj ?? lastReal;
    return { data: proj, base, finalValue, rate };
  }, [monthly, patrimonioTotal, brlNetWorth, totalInvestimentoAtualBRL, rendimentoMensal, horizon, modoContribuicao, saldoMensalFixo]);

  const ganhoProjetado = projData.finalValue - patrimonioTotal;

  return (
    <div className="finance-app min-h-screen px-4 pb-8 pt-4 sm:px-8 sm:py-6 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8" aria-labelledby="flow-title">
          <h2 id="flow-title" className="text-lg font-bold">Fluxo financeiro</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {latestMonth
              ? `Último ciclo com lançamentos: ${formatFinancialCycleRange(getFinancialCycle(`${latestMonth.year}-${String(latestMonth.month).padStart(2, "0")}-02`))}`
              : "Último ciclo com lançamentos"}
          </p>
          {patrimonyLoading ? (
            <p className="text-sm text-muted-foreground">Carregando lançamentos...</p>
          ) : latestMonth ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
              <SummaryCard label="Entradas" value={latestMonth.entradas} tone="primary" />
              <SummaryCard label="Saídas" value={latestMonth.saidas} tone="danger" />
              <SummaryCard label="Resultado" value={latestMonth.saldo} tone={latestMonth.saldo >= 0 ? "primary" : "danger"} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum lançamento registrado para mostrar o fluxo.</p>
          )}
        </section>

        <section className="mb-8" aria-labelledby="cash-title">
          <h2 id="cash-title" className="mb-4 text-lg font-bold">Caixa</h2>
          <div className="max-w-sm">
            <SummaryCard label="Saldo acumulado dos lançamentos" value={saldoAcumulado} tone="primary" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {netWorth.map((row) => (
              <div key={row.currencyCode} className="finance-metric">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caixa conhecido em contas · {row.currencyCode}</div>
                <div className="finance-value mt-2 text-xl font-semibold text-primary">{formatCents(BigInt(row.bankCashCents), row.currencyCode)}</div>
                {row.unknownBankAccounts > 0 && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">{row.unknownBankAccounts} conta(s) ativa(s) sem abertura conhecida; total parcial.</div>}
              </div>
            ))}
          </div>
          {integratedSnapshot?.accounts.filter((account) => account.accountType !== "benefit_wallet").length ? <div className="mt-3 max-w-2xl rounded-xl border border-border p-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contas ativas · calculadas em {integratedSnapshot.asOfDate}</div><ul className="space-y-1.5">{integratedSnapshot.accounts.filter((account) => account.accountType !== "benefit_wallet").map((account) => <li key={account.id} className="flex justify-between gap-3 text-sm"><span>{account.name} · {account.currencyCode}</span><span>{account.calculatedBalance === null ? "Saldo desconhecido" : formatCents(decimalToCents(account.calculatedBalance), account.currencyCode)}</span></li>)}</ul></div> : null}
        </section>

        <section className="mb-8 grid gap-4 lg:grid-cols-2" aria-label="Visão financeira integrada">
          <div className="finance-metric">
            <h2 className="mb-1 text-lg font-bold">Benefícios · VA</h2>
            <p className="mb-3 text-xs text-muted-foreground">Carteiras de benefício separadas do dinheiro bancário · saldos em {integratedSnapshot?.asOfDate ?? "—"}</p>
            {integratedLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (integratedSnapshot?.accounts.filter((account) => account.accountType === "benefit_wallet") ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma carteira VA ativa.</p> : <ul className="space-y-2">{integratedSnapshot?.accounts.filter((account) => account.accountType === "benefit_wallet").map((account) => <li key={account.id} className="flex justify-between gap-3 text-sm"><span>{account.name}</span><span className="font-semibold">{account.calculatedBalance === null ? "Saldo desconhecido" : formatCents(decimalToCents(account.calculatedBalance), account.currencyCode)}</span></li>)}</ul>}
          </div>
          <div className="finance-metric">
            <h2 className="mb-1 text-lg font-bold">Cartões · obrigações abertas</h2>
            <p className="mb-3 text-xs text-muted-foreground">Pagamentos registrados reduzem o saldo devido. Esta lista não cria movimentos para diferenças.</p>
            {integratedLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : !integratedSnapshot?.invoices.length ? <p className="text-sm text-muted-foreground">Nenhuma fatura com saldo em aberto.</p> : <ul className="space-y-2">{integratedSnapshot.invoices.slice(0, 8).map((invoice) => <li key={invoice.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-border/60 pb-2 text-sm"><span>{invoice.cardName} · {invoice.status}{invoice.dueDate ? ` · vence ${invoice.dueDate.split("-").reverse().join("/")}` : " · vencimento desconhecido"}<span className="block text-xs text-muted-foreground">Total {invoice.totalAmount} · pago {invoice.paidAmount} · período {invoice.periodStart} a {invoice.periodEnd}</span></span><strong>{formatCents(decimalToCents(invoice.remainingAmount), invoice.currencyCode)}</strong></li>)}</ul>}
          </div>
        </section>

        <section className="mb-8" aria-labelledby="patrimony-title">
          <h2 id="patrimony-title" className="mb-4 text-lg font-bold">Patrimônio</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
            <SummaryCard label="Aportes históricos (custo)" value={totalInvestidoLabel} tone="secondary" />
            <SummaryCard label="Proventos registrados" value={totalProventosLabel} tone="primary" />
            {netWorth.map((row) => (
              <div key={row.currencyCode} className="finance-metric border-l-2 border-primary pl-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patrimônio líquido conhecido · {row.currencyCode}</div>
                <div className="finance-value mt-2 text-2xl font-semibold text-primary">{formatCents(BigInt(row.netWorthCents), row.currencyCode)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Caixa {formatCents(BigInt(row.bankCashCents), row.currencyCode)} + investimentos {formatCents(BigInt(row.investmentValueCents), row.currencyCode)} + VA separado {formatCents(BigInt(row.benefitBalanceCents), row.currencyCode)} − faturas abertas {formatCents(BigInt(row.invoiceLiabilitiesCents), row.currencyCode)}
                </div>
                {(row.unknownBankAccounts + row.unknownInvestments + row.unknownBenefitWallets > 0) && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">Total parcial: há componentes sem saldo ou valor atual conhecido.</div>}
              </div>
            ))}
            {netWorthLoading && <p className="text-sm text-muted-foreground">Calculando saldos e passivos conhecidos…</p>}
          </div>
        </section>

        {/* Histórico */}
        <section className="neu-raised mb-8 rounded-2xl p-4 sm:p-6">
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Evolução financeira
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Evolução ciclo a ciclo — cada ciclo vai do dia 2 ao dia 1 seguinte.
            </div>
          </div>
          {histData.length === 0 ? (
            <EmptyChart text="Lance entradas e saídas na Conferência para visualizar o histórico." />
          ) : (
            <div className="h-56 w-full sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={histData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => brl.format(Number(v))} width={90} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-background)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                    formatter={(v: number) => brl.format(Number(v))}
                  />
                  <Bar dataKey="saldoMensal" name="Saldo do ciclo" fill="var(--color-secondary)" opacity={0.7} radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="saldoAcumulado" name="Saldo acumulado" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">O histórico mostra resultados do orçamento. Não há avaliações históricas de mercado e saldos de caixa suficientes para reconstruir patrimônio passado.</p>
        </section>

        {/* Investimentos */}
        <section className="neu-raised mb-8 rounded-2xl p-4 sm:p-6">
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Investimentos
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Gerencie seus ativos e saldos na aba{" "}
              <a href="/investimentos" className="font-semibold text-primary underline-offset-2 hover:underline">
                Investimentos
              </a>
              .
            </div>
          </div>

          {ativos.length === 0 ? (
            <div className="neu-inset rounded-xl p-6 text-center text-sm text-muted-foreground">
              Nenhum ativo cadastrado. Acesse a aba Investimentos para adicionar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3">Ativo</th>
                    <th className="px-3 py-3">Tipo</th>
                    <th className="px-3 py-3 text-right">Valor atual informado</th>
                    <th className="px-3 py-3 text-right">Rentab. mensal (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {ativos.map((a) => (
                    <tr key={a.id} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">{a.nome}</td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">{a.tipo.replace("_", " ")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.current_value_known ? `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: a.currency_code }).format(Number(a.saldo_atual))} · ${a.current_value_date ?? "data não informada"}` : "Desconhecido"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(a.rentabilidade_mensal_pct).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 max-w-sm">
            <SummaryCard label="Rendimento mensal estimado" value={rendimentoMensal} tone="primary" />
          </div>
        </section>

        {/* Projeção */}
        <section className="neu-raised mb-8 rounded-2xl p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Projeção Futura
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Projeção baseada nos dados financeiros registrados no Month Check.</p>
              <div className="mt-1 text-sm text-muted-foreground">
                {modoContribuicao === "auto"
                  ? monthly.length > 0
                    ? `Média dos últimos ${Math.min(3, monthly.length)} meses com lançamentos e juros compostos dos investimentos.`
                    : "A média histórica estará disponível quando houver lançamentos; juros compostos dos investimentos."
                  : "Saldo mensal fixo informado e juros compostos dos investimentos."}
              </div>
              {/* Radio de modo de contribuição */}
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="modoContribuicao"
                    value="auto"
                    checked={modoContribuicao === "auto"}
                    onChange={() => setModoContribuicao("auto")}
                    className="accent-primary"
                  />
                  <span className={modoContribuicao === "auto" ? "font-semibold text-foreground" : "text-muted-foreground"}>
                    Automático (média dos últimos meses)
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="modoContribuicao"
                    value="manual"
                    checked={modoContribuicao === "manual"}
                    onChange={() => setModoContribuicao("manual")}
                    className="accent-primary"
                  />
                  <span className={modoContribuicao === "manual" ? "font-semibold text-foreground" : "text-muted-foreground"}>
                    Manual (valor fixo)
                  </span>
                </label>
                {modoContribuicao === "manual" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9.,]*"
                      placeholder="0,00"
                      value={saldoMensalFixo}
                      onChange={(e) => setSaldoMensalFixo(e.target.value)}
                      className="neu-inset w-40 rounded-xl bg-transparent px-3 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="min-w-[260px] flex-1 max-w-md">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Horizonte</span>
                <span className="tabular-nums text-foreground">
                  {horizon} meses ({(horizon / 12).toFixed(horizon % 12 === 0 ? 0 : 1)} {horizon === 12 ? "ano" : "anos"})
                </span>
              </div>
              <Slider
                min={6}
                max={60}
                step={6}
                value={[horizon]}
                onValueChange={(v) => setHorizon(v[0] ?? 12)}
              />
            </div>
          </div>

          {!brlNetWorth || netWorthLoading ? (
            <EmptyChart text="Informe saldos iniciais e valores atuais para gerar uma projeção patrimonial conhecida em BRL." />
          ) : monthly.length === 0 ? (
            <EmptyChart text="Lance ao menos um mês na Conferência para gerar a projeção." />
          ) : (
            <div className="h-56 w-full sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projData.data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="realFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-secondary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => brl.format(Number(v))} width={90} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-background)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                    formatter={(v: number) => brl.format(Number(v))}
                  />
                  <Area type="monotone" dataKey="real" name="Real" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#realFill)" connectNulls={false} />
                  <Area
                    type="monotone"
                    dataKey="proj"
                    name="Projetado"
                    stroke="var(--color-secondary)"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    fill="url(#projFill)"
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {netWorthIncomplete && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">A projeção parte de um patrimônio parcial, pois há contas ou investimentos sem valor conhecido.</p>}

          {brlNetWorth && <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <SummaryCard label="Patrimônio projetado" value={projData.finalValue} tone="primary" emphasize />
            <SummaryCard label="Ganho projetado" value={ganhoProjetado} tone={ganhoProjetado >= 0 ? "primary" : "danger"} />
            <SummaryCard label={modoContribuicao === "manual" ? "Saldo mensal fixo" : "Contribuição média mensal"} value={projData.base} tone="secondary" />
          </div>}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  emphasize,
}: {
  label: string;
  value: number | string;
  tone: "primary" | "secondary" | "danger";
  emphasize?: boolean;
}) {
  const color =
    tone === "primary" ? "text-primary" : tone === "secondary" ? "text-secondary" : "text-danger";
  return (
    <div
      className={`finance-metric ${
        emphasize ? "border-l-2 border-primary pl-4" : ""
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`finance-value mt-2 break-words text-2xl font-semibold sm:text-3xl ${color}`}>{typeof value === "number" ? brl.format(value) : value}</div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="neu-inset flex h-60 items-center justify-center rounded-xl px-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}


