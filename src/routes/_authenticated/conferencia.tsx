import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import {
  getMonthRows,
  addRow,
  updateRow,
  deleteRow,
  getYearTotals,
} from "@/lib/month-check.functions";


export const Route = createFileRoute("/_authenticated/conferencia")({
  head: () => ({
    meta: [
      { title: "Conferência — Month Check" },
      { name: "description", content: "Confira entradas, saídas e saldo do mês." },
    ],
  }),
  component: ConferenciaPage,
});

type Row = {
  id: string;
  descricao: string;
  tipo: "entrada" | "saida";
  valor: number;
  position: number;
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function ConferenciaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const fetchRows = useServerFn(getMonthRows);
  const addRowFn = useServerFn(addRow);
  const updateRowFn = useServerFn(updateRow);
  const deleteRowFn = useServerFn(deleteRow);
  const fetchYearTotals = useServerFn(getYearTotals);

  const queryKey = ["month-rows", year, month] as const;
  const yearKey = ["year-totals", year] as const;
  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchRows({ data: { year, month } }) as Promise<Row[]>,
  });
  const { data: yearTotals = [] } = useQuery({
    queryKey: yearKey,
    queryFn: () =>
      fetchYearTotals({ data: { year } }) as Promise<
        Array<{ month: number; entradas: number; saidas: number }>
      >,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: yearKey });
  };

  const addMutation = useMutation({
    mutationFn: (tipo: "entrada" | "saida") => addRowFn({ data: { year, month, tipo } }),
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRowFn({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Row[]>(queryKey);
      queryClient.setQueryData<Row[]>(queryKey, (old) => (old ?? []).filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: invalidateAll,
  });

  const updateMutation = useMutation({
    mutationFn: (patch: { id: string; descricao?: string; tipo?: "entrada" | "saida"; valor?: number }) =>
      updateRowFn({ data: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Row[]>(queryKey);
      queryClient.setQueryData<Row[]>(queryKey, (old) =>
        (old ?? []).map((r) => (r.id === patch.id ? { ...r, ...patch } : r)),
      );
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: invalidateAll,
  });


  const totals = useMemo(() => {
    let entradas = 0, saidas = 0;
    for (const r of rows) {
      if (r.tipo === "entrada") entradas += Number(r.valor) || 0;
      else saidas += Number(r.valor) || 0;
    }
    return { entradas, saidas, saldo: entradas - saidas };
  }, [rows]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

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
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Month Check</h1>
            <p className="text-sm text-muted-foreground">Conferência financeira mensal</p>
          </div>
          <button
            onClick={signOut}
            className="neu-pressable inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </header>

        {/* Month selector */}
        <div className="neu-raised mb-6 flex items-center justify-between rounded-2xl p-4">
          <button onClick={prevMonth} className="neu-pressable rounded-xl p-3 text-primary">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Período</div>
            <div className="text-xl font-bold sm:text-2xl">{MESES[month - 1]} {year}</div>
          </div>
          <button onClick={nextMonth} className="neu-pressable rounded-xl p-3 text-primary">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Total Entradas" value={totals.entradas} tone="success" />
          <SummaryCard label="Total Saídas" value={totals.saidas} tone="danger" />
          <SummaryCard
            label="Saldo do Mês"
            value={totals.saldo}
            tone={totals.saldo >= 0 ? "success" : "danger"}
            emphasize
          />
        </div>

        {/* Table */}
        <div className="neu-raised overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-4">Descrição</th>
                  <th className="px-4 py-4">Tipo</th>
                  <th className="px-4 py-4 text-right">Entrada (R$)</th>
                  <th className="px-4 py-4 text-right">Saída (R$)</th>
                  <th className="px-4 py-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Carregando...</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhuma linha. Adicione uma entrada ou saída.</td></tr>
                )}
                {rows.map((row) => (
                  <RowItem
                    key={row.id}
                    row={row}
                    onUpdate={(patch) => updateMutation.mutate({ id: row.id, ...patch })}
                    onDelete={() => deleteMutation.mutate(row.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Thermometer chart */}
        <MonthThermometer entradas={totals.entradas} saidas={totals.saidas} />

        <YearLineChart data={yearTotals} currentMonth={month} year={year} />


        {/* Add buttons */}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            onClick={() => addMutation.mutate("entrada")}
            className="neu-pressable inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary"
          >
            <Plus className="h-4 w-4" /> Entrada
          </button>
          <button
            onClick={() => addMutation.mutate("saida")}
            className="neu-pressable inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-secondary"
          >
            <Plus className="h-4 w-4" /> Saída
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label, value, tone, emphasize,
}: { label: string; value: number; tone: "success" | "danger"; emphasize?: boolean }) {
  const color = tone === "success" ? "text-primary" : "text-danger";
  return (
    <div className={`neu-raised rounded-2xl p-6 ${emphasize ? "ring-2 ring-offset-2 ring-offset-background ring-primary/20" : ""}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-bold sm:text-3xl ${color}`}>{brl.format(value)}</div>
    </div>
  );
}

function MonthThermometer({ entradas, saidas }: { entradas: number; saidas: number }) {
  const hasEntradas = entradas > 0;
  const rawPct = hasEntradas ? (saidas / entradas) * 100 : 0;
  const pct = Math.min(rawPct, 100);
  const overBudget = rawPct > 100;
  const restante = entradas - saidas;

  // Color shifts from primary (safe) → amber (warning) → danger (over)
  let fillColor = "var(--color-primary)";
  if (rawPct >= 100) fillColor = "var(--color-danger)";
  else if (rawPct >= 75) fillColor = "oklch(0.78 0.16 75)";

  return (
    <div className="neu-raised mt-6 rounded-2xl p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Saídas vs Entradas
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {hasEntradas
              ? `${brl.format(saidas)} de ${brl.format(entradas)} comprometidos`
              : "Adicione uma entrada para visualizar o termômetro"}
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-3xl font-bold tabular-nums"
            style={{ color: hasEntradas ? fillColor : "var(--color-muted-foreground)" }}
          >
            {hasEntradas ? `${rawPct.toFixed(0)}%` : "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {hasEntradas
              ? overBudget
                ? `Excedeu ${brl.format(saidas - entradas)}`
                : `Resta ${brl.format(restante)}`
              : "sem dados"}
          </div>
        </div>
      </div>

      {/* Bullet bar */}
      <div className="neu-inset relative h-6 w-full overflow-hidden rounded-full">
        {/* tick markers at 50% and 75% */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-foreground/10" />
        <div className="pointer-events-none absolute inset-y-0 left-3/4 w-px bg-foreground/10" />
        <div
          className="h-full rounded-full transition-[width,background-color] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: fillColor,
            boxShadow: "0 0 12px 0 color-mix(in oklch, currentColor 35%, transparent)",
            color: fillColor,
          }}
        />
      </div>

      <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>0%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

type MonthTotal = { month: number; entradas: number; saidas: number };

const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function YearLineChart({
  data,
  currentMonth,
  year,
}: {
  data: MonthTotal[];
  currentMonth: number;
  year: number;
}) {
  const points = data.length === 12
    ? data
    : Array.from({ length: 12 }, (_, i) => ({ month: i + 1, entradas: 0, saidas: 0 }));

  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.entradas, p.saidas)),
  );

  // SVG geometry
  const W = 720;
  const H = 260;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = innerW / 11;

  const x = (i: number) => padL + stepX * i;
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const pathFor = (key: "entradas" | "saidas") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(p[key]).toFixed(2)}`).join(" ");

  const areaFor = (key: "entradas" | "saidas") =>
    `${pathFor(key)} L ${x(11).toFixed(2)} ${(padT + innerH).toFixed(2)} L ${x(0).toFixed(2)} ${(padT + innerH).toFixed(2)} Z`;

  // 4 gridlines
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  const fmtCompact = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return n.toFixed(0);
  };

  const totalEntradas = points.reduce((s, p) => s + p.entradas, 0);
  const totalSaidas = points.reduce((s, p) => s + p.saidas, 0);

  return (
    <div className="neu-raised mt-6 rounded-2xl p-6" aria-label={`Gráfico anual de entradas e saídas em ${year}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Visão anual {year}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Entradas vs saídas por mês
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-primary)" }} />
            <span className="font-medium text-muted-foreground">Entradas</span>
            <span className="font-semibold tabular-nums" style={{ color: "var(--color-primary)" }}>
              {brl.format(totalEntradas)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-danger)" }} />
            <span className="font-medium text-muted-foreground">Saídas</span>
            <span className="font-semibold tabular-nums" style={{ color: "var(--color-danger)" }}>
              {brl.format(totalSaidas)}
            </span>
          </div>
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
          <title>Entradas e saídas por mês em {year}</title>

          {/* Gridlines + Y labels */}
          {gridVals.map((v, i) => {
            const yy = y(v);
            return (
              <g key={i}>
                <line
                  x1={padL} x2={W - padR} y1={yy} y2={yy}
                  stroke="currentColor"
                  className="text-foreground/10"
                  strokeWidth={1}
                />
                <text
                  x={padL - 8} y={yy + 3}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  style={{ fontSize: 10 }}
                >
                  {fmtCompact(v)}
                </text>
              </g>
            );
          })}

          {/* Current month highlight */}
          <line
            x1={x(currentMonth - 1)} x2={x(currentMonth - 1)}
            y1={padT} y2={padT + innerH}
            stroke="currentColor"
            className="text-primary/30"
            strokeWidth={1}
            strokeDasharray="3 3"
          />

          {/* Areas */}
          <path d={areaFor("entradas")} fill="var(--color-primary)" opacity={0.12} />
          <path d={areaFor("saidas")} fill="var(--color-danger)" opacity={0.12} />

          {/* Lines */}
          <path d={pathFor("entradas")} fill="none" stroke="var(--color-primary)" strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathFor("saidas")} fill="none" stroke="var(--color-danger)" strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" />

          {/* Points + X labels */}
          {points.map((p, i) => {
            const isCurrent = p.month === currentMonth;
            return (
              <g key={i}>
                <circle cx={x(i)} cy={y(p.entradas)} r={isCurrent ? 4 : 3}
                        fill="var(--color-background)"
                        stroke="var(--color-primary)" strokeWidth={2}>
                  <title>{`${MES_ABBR[i]} — Entradas: ${brl.format(p.entradas)}`}</title>
                </circle>
                <circle cx={x(i)} cy={y(p.saidas)} r={isCurrent ? 4 : 3}
                        fill="var(--color-background)"
                        stroke="var(--color-danger)" strokeWidth={2}>
                  <title>{`${MES_ABBR[i]} — Saídas: ${brl.format(p.saidas)}`}</title>
                </circle>
                <text
                  x={x(i)} y={H - 10}
                  textAnchor="middle"
                  className={isCurrent ? "fill-foreground font-semibold" : "fill-muted-foreground"}
                  style={{ fontSize: 11 }}
                >
                  {MES_ABBR[i]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}




function RowItem({
  row, onUpdate, onDelete,
}: {
  row: Row;
  onUpdate: (patch: { descricao?: string; tipo?: "entrada" | "saida"; valor?: number }) => void;
  onDelete: () => void;
}) {
  const [descricao, setDescricao] = useState(row.descricao);
  const [valor, setValor] = useState<string>(String(row.valor ?? 0));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setDescricao(row.descricao); }, [row.descricao]);
  useEffect(() => { setValor(String(row.valor ?? 0)); }, [row.valor]);

  function scheduleSave(fn: () => void) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fn, 1000);
  }

  function commitDescricao() {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (descricao !== row.descricao) onUpdate({ descricao });
  }
  function commitValor() {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const num = parseFloat(valor.replace(",", ".")) || 0;
    if (num !== Number(row.valor)) onUpdate({ valor: num });
  }
  function changeTipo(novo: "entrada" | "saida") {
    if (novo === row.tipo) return;
    onUpdate({ tipo: novo, valor: 0 });
  }

  const isEntrada = row.tipo === "entrada";

  return (
    <tr className="border-t border-border/60">
      <td className="px-4 py-3">
        <input
          value={descricao}
          onChange={(e) => { setDescricao(e.target.value); scheduleSave(commitDescricao); }}
          onBlur={commitDescricao}
          className="neu-inset w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="Descrição"
        />
      </td>
      <td className="px-4 py-3">
        <div className="neu-inset inline-flex rounded-full p-1">
          <button
            type="button"
            onClick={() => changeTipo("entrada")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${isEntrada ? "neu-raised-sm text-primary" : "text-muted-foreground"}`}
          >
            Entrada
          </button>
          <button
            type="button"
            onClick={() => changeTipo("saida")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${!isEntrada ? "neu-raised-sm text-danger" : "text-muted-foreground"}`}
          >
            Saída
          </button>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <input
          type="number" step="0.01" min="0"
          value={isEntrada ? valor : ""}
          disabled={!isEntrada}
          onChange={(e) => { setValor(e.target.value); scheduleSave(commitValor); }}
          onBlur={commitValor}
          className={`neu-inset w-full max-w-[140px] rounded-lg px-3 py-2 text-right text-sm outline-none focus:ring-2 focus:ring-primary/40 ${!isEntrada ? "opacity-40" : ""}`}
          placeholder="0,00"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <input
          type="number" step="0.01" min="0"
          value={!isEntrada ? valor : ""}
          disabled={isEntrada}
          onChange={(e) => { setValor(e.target.value); scheduleSave(commitValor); }}
          onBlur={commitValor}
          className={`neu-inset w-full max-w-[140px] rounded-lg px-3 py-2 text-right text-sm outline-none focus:ring-2 focus:ring-danger/40 ${isEntrada ? "opacity-40" : ""}`}
          placeholder="0,00"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={onDelete}
          className="neu-pressable inline-flex items-center justify-center rounded-lg p-2 text-danger"
          aria-label="Excluir linha"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
