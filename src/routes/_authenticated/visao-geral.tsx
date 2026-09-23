import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LogOut } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { InstallPWAButton } from "@/components/install-pwa-button";
import { PageTabs } from "@/components/page-tabs";
import { MobileNav } from "@/components/mobile-nav";
import { Slider } from "@/components/ui/slider";
import { getAccumulatedWithPatrimony } from "@/lib/shared-metrics.functions";
import { listAtivos } from "@/lib/investments-portfolio.functions";

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
  patrimonioTotal: number;
};

type PatrimonyData = {
  months: MonthSnapshot[];
  totalInvestido: number;
  saldoAcumulado: number;
  patrimonioTotal: number;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthLabel = (y: number, m: number) => `${MES_ABBR[m - 1]}/${String(y).slice(-2)}`;

function VisaoGeralPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchPatrimony = useServerFn(getAccumulatedWithPatrimony);
  const fetchAtivos = useServerFn(listAtivos);

  const patrimonyKey = ["patrimony-accumulated"] as const;
  const ativosKey = ["ativos"] as const;

  const { data: patrimony } = useQuery({
    queryKey: patrimonyKey,
    queryFn: () => fetchPatrimony() as Promise<PatrimonyData>,
  });

  const { data: ativos = [] } = useQuery({
    queryKey: ativosKey,
    queryFn: () => fetchAtivos() as Promise<Ativo[]>,
  });

  const monthly = patrimony?.months ?? [];
  const totalInvestido = patrimony?.totalInvestido ?? 0;
  const saldoAcumulado = patrimony?.saldoAcumulado ?? 0;
  const patrimonioTotal = patrimony?.patrimonioTotal ?? 0;

  // Rendimento mensal estimado (soma de saldo_atual × rentabilidade_mensal_pct / 100)
  const rendimentoMensal = useMemo(
    () =>
      ativos.reduce(
        (s, a) => s + ((Number(a.saldo_atual) || 0) * (Number(a.rentabilidade_mensal_pct) || 0)) / 100,
        0,
      ),
    [ativos],
  );

  // Historical chart data
  const histData = useMemo(() => {
    return monthly.map((m) => ({
      label: monthLabel(m.year, m.month),
      saldoMensal: m.saldo,
      saldoAcumulado: m.saldoAcumulado,
      patrimonioTotal: m.patrimonioTotal,
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
    const rate = totalInvestido > 0 ? rendimentoMensal / totalInvestido : 0;

    const real = histData.map((d) => ({
      label: d.label,
      real: d.patrimonioTotal,
      proj: null as number | null,
    }));

    const lastReal = histData.length > 0 ? histData[histData.length - 1].patrimonioTotal : patrimonioTotal;
    let patrimonio = lastReal;

    const proj: Array<{ label: string; real: number | null; proj: number }> = [];
    if (real.length > 0) {
      proj.push({ label: real[real.length - 1].label, real: lastReal, proj: lastReal });
    }

    const now = new Date();
    let y = monthly.length > 0 ? monthly[monthly.length - 1].year : now.getFullYear();
    let mo = monthly.length > 0 ? monthly[monthly.length - 1].month : now.getMonth() + 1;
    for (let i = 0; i < horizon; i++) {
      mo += 1;
      if (mo > 12) { mo = 1; y += 1; }
      patrimonio = patrimonio * (1 + rate) + base;
      proj.push({ label: monthLabel(y, mo), real: null, proj: patrimonio });
    }

    const merged = [...real.slice(0, -1), ...proj];
    return { data: merged, base, finalValue: patrimonio, rate };
  }, [monthly, histData, patrimonioTotal, totalInvestido, rendimentoMensal, horizon, modoContribuicao, saldoMensalFixo]);

  const ganhoProjetado = projData.finalValue - patrimonioTotal;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6 sm:px-8 sm:py-8 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo height={40} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-3xl">Month Check</h1>
              <p className="text-sm text-muted-foreground">Visão geral do patrimônio</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <InstallPWAButton />
            <button
              onClick={signOut}
              className="neu-pressable inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <div className="mb-6">
          <PageTabs />
        </div>

        {/* Balanço Geral cards */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <SummaryCard label="Saldo acumulado" value={saldoAcumulado} tone="primary" />
          <SummaryCard label="Total investido" value={totalInvestido} tone="secondary" />
          <SummaryCard label="Patrimônio total" value={patrimonioTotal} tone="primary" emphasize />
        </div>

        {/* Histórico */}
        <section className="neu-raised mb-8 rounded-2xl p-4 sm:p-6">
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Balanço Geral
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Evolução mês a mês — saldo mensal, acumulado e patrimônio.
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
                  <Bar dataKey="saldoMensal" name="Saldo do mês" fill="var(--color-secondary)" opacity={0.7} radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="saldoAcumulado" name="Saldo acumulado" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="patrimonioTotal" name="Patrimônio total" stroke="var(--color-accent)" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
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
                    <th className="px-3 py-3 text-right">Saldo Atual (R$)</th>
                    <th className="px-3 py-3 text-right">Rentab. mensal (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {ativos.map((a) => (
                    <tr key={a.id} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">{a.nome}</td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">{a.tipo.replace("_", " ")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{brl.format(Number(a.saldo_atual))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(a.rentabilidade_mensal_pct).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SummaryCard label="Total investido" value={totalInvestido} tone="secondary" />
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
              <div className="mt-1 text-sm text-muted-foreground">
                {modoContribuicao === "auto"
                  ? `Baseada na média dos últimos ${Math.min(3, monthly.length)} meses + juros compostos dos investimentos.`
                  : "Baseada no saldo mensal fixo informado + juros compostos dos investimentos."}
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

          {monthly.length === 0 ? (
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

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <SummaryCard label="Patrimônio projetado" value={projData.finalValue} tone="primary" emphasize />
            <SummaryCard label="Ganho projetado" value={ganhoProjetado} tone={ganhoProjetado >= 0 ? "primary" : "danger"} />
            <SummaryCard
              label={modoContribuicao === "manual" ? "Saldo mensal fixo" : "Contribuição média mensal"}
              value={projData.base}
              tone="secondary"
            />
          </div>
        </section>
      </div>
      <MobileNav />
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
  value: number;
  tone: "primary" | "secondary" | "danger";
  emphasize?: boolean;
}) {
  const color =
    tone === "primary" ? "text-primary" : tone === "secondary" ? "text-secondary" : "text-danger";
  return (
    <div
      className={`neu-raised rounded-2xl p-4 sm:p-6 ${
        emphasize ? "ring-2 ring-offset-2 ring-offset-background ring-primary/20" : ""
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-bold sm:text-3xl ${color}`}>{brl.format(value)}</div>
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


