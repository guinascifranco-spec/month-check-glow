import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getMonthRows,
  addRow,
  updateRow,
  deleteRow,
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

  const queryKey = ["month-rows", year, month] as const;
  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchRows({ data: { year, month } }) as Promise<Row[]>,
  });

  const addMutation = useMutation({
    mutationFn: (tipo: "entrada" | "saida") => addRowFn({ data: { year, month, tipo } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
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
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
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
