import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, LogOut, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import {
  Bar,
  BarChart,
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Logo } from "@/components/logo";
import { InstallPWAButton } from "@/components/install-pwa-button";
import { MobileNav } from "@/components/mobile-nav";
import { PageTabs } from "@/components/page-tabs";
import { supabase } from "@/integrations/supabase/client";
import { getFutureProjection } from "@/lib/future-view.functions";

export const Route = createFileRoute("/_authenticated/visao-futura")({
  head: () => ({
    meta: [
      { title: "Visão Futura — Month Check" },
      { name: "description", content: "Veja a projeção de renda, gastos e saldo dos próximos meses." },
      { property: "og:title", content: "Visão Futura — Month Check" },
      { property: "og:description", content: "Veja a projeção de renda, gastos e saldo dos próximos meses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FutureViewPage,
});

type ProjectionMonth = {
  year: number;
  month: number;
  renda: number;
  fixos: number;
  parcelas: number;
  variaveis: number;
  gastos: number;
  saldo: number;
};

type ProjectionEvent = {
  id: string;
  kind: "installment" | "critical";
  year: number;
  month: number;
  title: string;
  message: string;
};

type Projection = {
  months: ProjectionMonth[];
  events: ProjectionEvent[];
  assumptions: { averageIncome: number; fixed: number; averageVariables: number; historyMonths: number };
};

const SHORT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const FULL_MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactBrl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" });

function label(year: number, month: number) {
  return `${SHORT_MONTHS[month - 1]}/${String(year).slice(-2)}`;
}

function FutureViewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProjection = useServerFn(getFutureProjection);
  const [horizon, setHorizon] = useState(6);
  const [custom, setCustom] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["future-projection", horizon],
    queryFn: () => fetchProjection({ data: { months: horizon } }) as Promise<Projection>,
  });

  const chartData = useMemo(
    () => (data?.months ?? []).map((item) => ({ ...item, label: label(item.year, item.month) })),
    [data],
  );
  const summary = useMemo(() => {
    if (chartData.length === 0) return null;
    const average = chartData.reduce((sum, item) => sum + item.gastos, 0) / chartData.length;
    const best = chartData.reduce((a, b) => (a.saldo >= b.saldo ? a : b));
    const worst = chartData.reduce((a, b) => (a.saldo <= b.saldo ? a : b));
    const accumulated = chartData.reduce((sum, item) => sum + item.saldo, 0);
    return { average, best, worst, accumulated };
  }, [chartData]);

  function chooseHorizon(value: number) {
    setHorizon(value);
    setCustom("");
  }

  function applyCustom(value: string) {
    setCustom(value);
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 60) setHorizon(parsed);
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6 sm:px-8 sm:py-8 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:mb-8 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo height={40} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold sm:text-3xl">Month Check</h1>
              <p className="truncate text-sm text-muted-foreground">Visão dos próximos meses</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <InstallPWAButton />
            <button onClick={signOut} className="neu-pressable inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <div className="mb-6"><PageTabs /></div>

        <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
          <div className="mb-4">
            <h2 className="font-bold">Quanto tempo você quer visualizar?</h2>
            <p className="mt-1 text-sm text-muted-foreground">A projeção começa no mês atual.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 6, 12].map((value) => (
              <button key={value} type="button" onClick={() => chooseHorizon(value)} className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold ${horizon === value && custom === "" ? "neu-inset text-primary" : "neu-pressable text-muted-foreground"}`}>
                {value} {value === 1 ? "mês" : "meses"}
              </button>
            ))}
            <label className="neu-inset flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground">
              Outro
              <input type="number" min={1} max={60} value={custom} onChange={(event) => applyCustom(event.target.value)} className="w-14 bg-transparent text-right font-semibold text-foreground outline-none" aria-label="Período personalizado em meses" placeholder="1–60" />
            </label>
          </div>
        </section>

        {isLoading || !summary ? (
          <div className="neu-raised rounded-2xl p-10 text-center text-muted-foreground">Calculando sua visão futura...</div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard icon={WalletCards} label="Gasto médio mensal" value={brl.format(summary.average)} tone="neutral" />
              <SummaryCard icon={TrendingUp} label="Melhor mês" value={brl.format(summary.best.saldo)} detail={summary.best.label} tone={summary.best.saldo >= 0 ? "positive" : "negative"} />
              <SummaryCard icon={TrendingDown} label="Pior mês" value={brl.format(summary.worst.saldo)} detail={summary.worst.label} tone={summary.worst.saldo >= 0 ? "positive" : "negative"} />
              <SummaryCard icon={CalendarCheck} label="Saldo acumulado" value={brl.format(summary.accumulated)} detail={`em ${horizon} ${horizon === 1 ? "mês" : "meses"}`} tone={summary.accumulated > 0 ? "positive" : summary.accumulated < 0 ? "negative" : "neutral"} />
            </div>

            <ChartSection title="Renda, gastos e saldo" subtitle="Veja como cada mês deve terminar.">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={74} tickFormatter={(value) => compactBrl.format(Number(value))} />
                  <Tooltip content={<ProjectionTooltip />} />
                  <Legend />
                  <Area name="Saldo positivo" type="monotone" dataKey={(item: ProjectionMonth) => Math.max(0, item.saldo)} stroke="none" fill="var(--color-primary)" fillOpacity={0.14} legendType="none" />
                  <Area name="Saldo negativo" type="monotone" dataKey={(item: ProjectionMonth) => Math.min(0, item.saldo)} stroke="none" fill="var(--color-danger)" fillOpacity={0.14} legendType="none" />
                  <Line name="Renda" type="monotone" dataKey="renda" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 3 }} />
                  <Line name="Gastos" type="monotone" dataKey="gastos" stroke="var(--color-danger)" strokeWidth={3} dot={{ r: 3 }} />
                  <Line name="Saldo" type="monotone" dataKey="saldo" stroke="var(--color-secondary)" strokeWidth={3} dot={{ r: 4 }} />
                  {chartData.filter((item) => item.saldo < 0).map((item) => (
                    <ReferenceDot key={item.label} x={item.label} y={item.saldo} r={6} fill="var(--color-danger)" stroke="var(--color-background)" strokeWidth={2} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection title="Para onde o dinheiro vai" subtitle="Comparação entre gastos fixos, parcelas e variáveis.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={74} tickFormatter={(value) => compactBrl.format(Number(value))} />
                  <Tooltip content={<ProjectionTooltip />} />
                  <Legend />
                  <Bar name="Fixos" dataKey="fixos" stackId="gastos" fill="var(--color-secondary)" radius={[3, 3, 0, 0]} />
                  <Bar name="Parcelas" dataKey="parcelas" stackId="gastos" fill="var(--color-danger)" radius={[3, 3, 0, 0]} />
                  <Bar name="Variáveis" dataKey="variaveis" stackId="gastos" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>

            <section className="mt-6">
              <div className="mb-4">
                <h2 className="text-lg font-bold">Eventos importantes</h2>
                <p className="text-sm text-muted-foreground">Mudanças que merecem atenção no período.</p>
              </div>
              {(data?.events ?? []).length === 0 ? (
                <div className="neu-inset rounded-2xl p-6 text-center text-sm text-muted-foreground">Nenhum alerta para este período.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(data?.events ?? []).map((event) => (
                    <article key={event.id} className="neu-raised flex gap-3 rounded-2xl p-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${event.kind === "installment" ? "text-primary" : "text-danger"}`}>
                        {event.kind === "installment" ? <CalendarCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground">{FULL_MONTHS[event.month - 1]} {event.year}</div>
                        <h3 className="mt-1 font-bold">{event.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{event.message.replace(/(\d+(?:\.\d+)?)(?= por mês)/, (value) => brl.format(Number(value)))}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <MobileNav />
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone }: { icon: typeof WalletCards; label: string; value: string; detail?: string; tone: "positive" | "negative" | "neutral" }) {
  const color = tone === "positive" ? "text-primary" : tone === "negative" ? "text-danger" : "text-muted-foreground";
  return (
    <article className="neu-raised min-w-0 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <div className={`mt-3 break-words text-xl font-bold sm:text-2xl ${color}`}>{value}</div>
      {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
    </article>
  );
}

function ChartSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-4 h-64 w-full sm:h-80">{children}</div>
    </section>
  );
}

function ProjectionTooltip({ active, payload, label: month }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
      <div className="mb-2 text-sm font-bold">{month}</div>
      {payload.map((item) => (
        <div key={item.name} className="flex min-w-44 items-center justify-between gap-4 text-xs">
          <span style={{ color: item.color }}>{item.name}</span><strong>{brl.format(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}