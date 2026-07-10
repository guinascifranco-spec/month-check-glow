import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Plus, Trash2 } from "lucide-react";
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
import { Slider } from "@/components/ui/slider";
import {
  addInvestment,
  deleteInvestment,
  getAllMonthlyTotals,
  listInvestments,
  updateInvestment,
} from "@/lib/investments.functions";

export const Route = createFileRoute("/_authenticated/visao-geral")({
  head: () => ({
    meta: [
      { title: "Visão Geral — Month Check" },
      { name: "description", content: "Patrimônio, investimentos e projeção futura." },
    ],
  }),
  component: VisaoGeralPage,
});

type Investment = {
  id: string;
  category: string;
  balance: number;
  monthly_return_pct: number;
  position: number;
};

type MonthTotal = {
  year: number;
  month: number;
  entradas: number;
  saidas: number;
  saldo: number;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthLabel = (y: number, m: number) => `${MES_ABBR[m - 1]}/${String(y).slice(-2)}`;

function VisaoGeralPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchInvestments = useServerFn(listInvestments);
  const addFn = useServerFn(addInvestment);
  const updateFn = useServerFn(updateInvestment);
  const deleteFn = useServerFn(deleteInvestment);
  const fetchTotals = useServerFn(getAllMonthlyTotals);

  const invKey = ["investments"] as const;
  const totalsKey = ["all-monthly-totals"] as const;

  const { data: investments = [] } = useQuery({
    queryKey: invKey,
    queryFn: () => fetchInvestments() as Promise<Investment[]>,
  });

  const { data: monthly = [] } = useQuery({
    queryKey: totalsKey,
    queryFn: () => fetchTotals() as Promise<MonthTotal[]>,
  });

  const addMutation = useMutation({
    mutationFn: () => addFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: invKey });
      const prev = queryClient.getQueryData<Investment[]>(invKey);
      queryClient.setQueryData<Investment[]>(invKey, (old) => (old ?? []).filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(invKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: invKey }),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: { id: string; category?: string; balance?: number; monthly_return_pct?: number }) =>
      updateFn({ data: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: invKey });
      const prev = queryClient.getQueryData<Investment[]>(invKey);
      queryClient.setQueryData<Investment[]>(invKey, (old) =>
        (old ?? []).map((r) => (r.id === patch.id ? { ...r, ...patch } : r)),
      );
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(invKey, ctx.prev);
    },
  });

  // Aggregates
  const totalInvestido = useMemo(
    () => investments.reduce((s, i) => s + (Number(i.balance) || 0), 0),
    [investments],
  );
  const rendimentoMensal = useMemo(
    () =>
      investments.reduce(
        (s, i) => s + ((Number(i.balance) || 0) * (Number(i.monthly_return_pct) || 0)) / 100,
        0,
      ),
    [investments],
  );
  const saldoAcumulado = useMemo(
    () => monthly.reduce((s, m) => s + m.saldo, 0),
    [monthly],
  );
  const patrimonioTotal = saldoAcumulado + totalInvestido;

  // Historical chart data: saldo mensal (barra), saldo acumulado (linha),
  // patrimônio total = saldo acumulado + totalInvestido (constante atual).
  const histData = useMemo(() => {
    let acc = 0;
    return monthly.map((m) => {
      acc += m.saldo;
      return {
        label: monthLabel(m.year, m.month),
        saldoMensal: m.saldo,
        saldoAcumulado: acc,
        patrimonioTotal: acc + totalInvestido,
      };
    });
  }, [monthly, totalInvestido]);

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

    const lastReal = histData.length > 0 ? histData[histData.length - 1].patrimonioTotal : totalInvestido;
    let patrimonio = lastReal;

    const proj: Array<{ label: string; real: number | null; proj: number }> = [];
    // Anchor projection start at last real point for visual continuity
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

    // Merge: keep `real` series only on real points, `proj` only on projected
    const merged = [...real.slice(0, -1), ...proj];
    return { data: merged, base, finalValue: patrimonio, rate };
  }, [monthly, histData, totalInvestido, rendimentoMensal, horizon, modoContribuicao, saldoMensalFixo]);

  const ganhoProjetado = projData.finalValue - patrimonioTotal;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo height={40} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Month Check</h1>
              <p className="text-sm text-muted-foreground">Visão geral do patrimônio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <InstallPWAButton />
            <button
              onClick={signOut}
              className="neu-pressable inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </header>

        <div className="mb-6">
          <PageTabs />
        </div>

        {/* Balanço Geral cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Saldo acumulado" value={saldoAcumulado} tone="primary" />
          <SummaryCard label="Total investido" value={totalInvestido} tone="secondary" />
          <SummaryCard label="Patrimônio total" value={patrimonioTotal} tone="primary" emphasize />
        </div>

        {/* Histórico */}
        <section className="neu-raised mb-8 rounded-2xl p-6">
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
            <div className="h-80 w-full">
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
        <section className="neu-raised mb-8 rounded-2xl p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Investimentos
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Cadastre categorias, saldos e rentabilidade mensal estimada.
              </div>
            </div>
            <button
              onClick={() => addMutation.mutate()}
              className="neu-pressable inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-primary"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3">Categoria</th>
                  <th className="px-3 py-3 text-right">Saldo (R$)</th>
                  <th className="px-3 py-3 text-right">Rentab. mensal (%)</th>
                  <th className="px-3 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {investments.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">Nenhum investimento cadastrado.</td></tr>
                )}
                {investments.map((inv) => (
                  <InvestmentRow
                    key={inv.id}
                    investment={inv}
                    onPatch={(p) => updateMutation.mutate({ id: inv.id, ...p })}
                    onDelete={() => deleteMutation.mutate(inv.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SummaryCard label="Total investido" value={totalInvestido} tone="secondary" />
            <SummaryCard label="Rendimento mensal estimado" value={rendimentoMensal} tone="primary" />
          </div>
        </section>

        {/* Projeção */}
        <section className="neu-raised mb-8 rounded-2xl p-6">
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
            <div className="h-80 w-full">
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

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
      className={`neu-raised rounded-2xl p-6 ${
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

function InvestmentRow({
  investment,
  onPatch,
  onDelete,
}: {
  investment: Investment;
  onPatch: (p: { category?: string; balance?: number; monthly_return_pct?: number }) => void;
  onDelete: () => void;
}) {
  const [category, setCategory] = useState(investment.category);
  const [balance, setBalance] = useState(String(investment.balance ?? 0));
  const [pct, setPct] = useState(String(investment.monthly_return_pct ?? 0));
  const catFocused = useRef(false);
  const balFocused = useRef(false);
  const pctFocused = useRef(false);

  // Sync from server only when not focused and the value truly diverges.
  useEffect(() => {
    if (!catFocused.current && category !== investment.category) {
      setCategory(investment.category);
    }
    if (!balFocused.current) {
      const n = parseFloat(balance.replace(",", ".")) || 0;
      if (n !== Number(investment.balance)) setBalance(String(investment.balance ?? 0));
    }
    if (!pctFocused.current) {
      const n = parseFloat(pct.replace(",", ".")) || 0;
      if (n !== Number(investment.monthly_return_pct)) setPct(String(investment.monthly_return_pct ?? 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investment.id, investment.category, investment.balance, investment.monthly_return_pct]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounce = (fn: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, 1000);
  };

  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2">
        <input
          value={category}
          onFocus={() => { catFocused.current = true; }}
          onBlur={() => { catFocused.current = false; }}
          onChange={(e) => {
            setCategory(e.target.value);
            const v = e.target.value;
            debounce(() => onPatch({ category: v }));
          }}
          placeholder="Renda Fixa, Ações…"
          className="neu-inset w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9.,]*"
          value={balance}
          onFocus={() => { balFocused.current = true; }}
          onBlur={() => { balFocused.current = false; }}
          onChange={(e) => {
            const raw = e.target.value;
            setBalance(raw);
            const n = parseFloat(raw.replace(",", "."));
            if (!Number.isNaN(n)) debounce(() => onPatch({ balance: n }));
          }}
          className="neu-inset w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary/30"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9.,]*"
          value={pct}
          onFocus={() => { pctFocused.current = true; }}
          onBlur={() => { pctFocused.current = false; }}
          onChange={(e) => {
            const raw = e.target.value;
            setPct(raw);
            const n = parseFloat(raw.replace(",", "."));
            if (!Number.isNaN(n)) debounce(() => onPatch({ monthly_return_pct: n }));
          }}
          className="neu-inset w-full rounded-xl bg-transparent px-3 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary/30"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={onDelete}
          className="neu-pressable inline-flex items-center justify-center rounded-xl p-2 text-danger"
          aria-label="Remover investimento"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
