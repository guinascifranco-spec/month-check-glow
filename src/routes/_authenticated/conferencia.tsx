import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, LogOut, GripVertical, Check, Copy, Wand2, AlertCircle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { InstallPWAButton } from "@/components/install-pwa-button";
import { PageTabs } from "@/components/page-tabs";
import { MobileNav } from "@/components/mobile-nav";
import { BackupButton } from "@/components/backup-button";
import { Button } from "@/components/ui/button";
import {
  getChecklistMonth,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  reorderChecklistItems,
  copyFromPreviousMonth,
  seedTemplate,
  getChecklistCategories,
} from "@/lib/checklist.functions";

export const Route = createFileRoute("/_authenticated/conferencia")({
  head: () => ({
    meta: [
      { title: "Conferência — Month Check" },
      { name: "description", content: "Confira entradas e saídas previstas para o mês." },
      { property: "og:title", content: "Conferência — Month Check" },
      { property: "og:description", content: "Confira entradas e saídas previstas para o mês." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  quitado: boolean;
  expense_class: "fixo" | "variavel";
  category_id: string | null;
};

type Category = { id: string; name: string; color_key: string };

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

  const fetchRows = useServerFn(getChecklistMonth);
  const fetchCategories = useServerFn(getChecklistCategories);
  const addRowFn = useServerFn(addChecklistItem);
  const updateRowFn = useServerFn(updateChecklistItem);
  const deleteRowFn = useServerFn(deleteChecklistItem);
  const reorderRowsFn = useServerFn(reorderChecklistItems);
  const copyPrevFn = useServerFn(copyFromPreviousMonth);
  const seedTemplateFn = useServerFn(seedTemplate);

  const queryKey = ["checklist-rows", year, month] as const;
  const categoriesKey = ["checklist-categories"] as const;
  
  const { data = { items: [], isNew: false }, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchRows({ data: { year, month } }) as Promise<{ items: Row[]; isNew: boolean }>,
  });

  const { data: categories = [] } = useQuery({
    queryKey: categoriesKey,
    queryFn: () => fetchCategories({}) as Promise<Category[]>,
    staleTime: 5 * 60 * 1000,
  });
  
  const rows = data.items;
  const isNew = data.isNew;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  const addMutation = useMutation({
    mutationFn: (tipo: "entrada" | "saida") => addRowFn({ data: { year, month, tipo } }),
    onSuccess: invalidateAll,
  });

  const copyMutation = useMutation({
    mutationFn: () => copyPrevFn({ data: { year, month } }),
    onSuccess: invalidateAll,
  });

  const templateMutation = useMutation({
    mutationFn: () => seedTemplateFn({ data: { year, month } }),
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRowFn({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<{ items: Row[]; isNew: boolean }>(queryKey);
      queryClient.setQueryData<{ items: Row[]; isNew: boolean }>(queryKey, (old) => ({
        items: (old?.items ?? []).filter((r) => r.id !== id),
        isNew: old?.isNew ?? false,
      }));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: invalidateAll,
  });

  const updateMutation = useMutation({
    mutationFn: (patch: { id: string; descricao?: string; tipo?: "entrada" | "saida"; valor?: number; quitado?: boolean; expense_class?: "fixo" | "variavel"; category_id?: string | null }) =>
      updateRowFn({ data: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<{ items: Row[]; isNew: boolean }>(queryKey);
      queryClient.setQueryData<{ items: Row[]; isNew: boolean }>(queryKey, (old) => ({
        items: (old?.items ?? []).map((r) => (r.id === patch.id ? { ...r, ...patch } : r)),
        isNew: old?.isNew ?? false,
      }));
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: invalidateAll,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderRowsFn({ data: { orderedIds } }),
    onSettled: invalidateAll,
  });

  const [dragId, setDragId] = useState<string | null>(null);

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const current = queryClient.getQueryData<{ items: Row[]; isNew: boolean }>(queryKey)?.items ?? rows;
    const src = current.find((r) => r.id === dragId);
    const tgt = current.find((r) => r.id === targetId);
    if (!src || !tgt || src.tipo !== tgt.tipo) { setDragId(null); return; }
    const without = current.filter((r) => r.id !== dragId);
    const targetIdx = without.findIndex((r) => r.id === targetId);
    const reorderedItems = [...without.slice(0, targetIdx), src, ...without.slice(targetIdx)];
    
    queryClient.setQueryData<{ items: Row[]; isNew: boolean }>(queryKey, (old) => ({
      items: reorderedItems,
      isNew: old?.isNew ?? false,
    }));
    reorderMutation.mutate(reorderedItems.map((r) => r.id));
    setDragId(null);
  }

  const totals = useMemo(() => {
    let entradas = 0, saidas = 0;
    for (const r of rows) {
      if (r.tipo === "entrada") entradas += Number(r.valor) || 0;
      else saidas += Number(r.valor) || 0;
    }
    return { entradas, saidas, saldo: entradas - saidas };
  }, [rows]);

  const checkedCount = rows.filter((row) => row.quitado).length;
  const progress = rows.length > 0 ? (checkedCount / rows.length) * 100 : 0;
  const pendingClassification = rows.filter((row) => row.tipo === "saida" && !row.category_id);
  const pendingAmount = pendingClassification.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);

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
    <div className="finance-app min-h-screen px-4 pb-24 pt-4 sm:px-8 sm:py-6 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:mb-8 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo height={40} />
            <div className="min-w-0">
              <h1 className="finance-app-title truncate text-xl sm:text-3xl">Month Check</h1>
              <p className="truncate text-sm text-muted-foreground">Conferência de Planejamento</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <BackupButton />
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

        {/* Month selector */}
        <div className="mb-5 flex items-center justify-between border-y border-border py-3">
          <button onClick={prevMonth} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-card text-primary transition-colors hover:bg-muted">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Período Planejado</div>
            <div className="truncate text-xl font-bold sm:text-2xl">{MESES[month - 1]} {year}</div>
          </div>
          <button onClick={nextMonth} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-card text-primary transition-colors hover:bg-muted">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Monthly summary */}
        <h2 className="mb-3 text-lg font-bold sm:text-xl">Resumo de {MESES[month - 1]} {year}</h2>
        <div className="mb-6 grid grid-cols-2 border-y border-border py-3 sm:grid-cols-3">
          <SummaryCard label="Total Entradas" value={totals.entradas} tone="success" />
          <SummaryCard label="Total Saídas" value={totals.saidas} tone="danger" />
          <SummaryCard
            label="Resultado planejado"
            value={totals.saldo}
            tone={totals.saldo >= 0 ? "success" : "danger"}
            emphasize
          />
        </div>

        <section className="mb-6" aria-label="Progresso da conferência">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-base font-bold sm:text-lg">Conferência do mês</h2>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">
              {checkedCount} de {rows.length} lançamentos conferidos
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Conferência do mês"
            aria-valuemin={0}
            aria-valuemax={rows.length}
            aria-valuenow={checkedCount}
            className="h-2.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </section>

        {!isLoading && pendingClassification.length > 0 && (
          <section className="mb-6 flex flex-col gap-4 rounded-lg border border-danger/20 bg-card p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Pendências de classificação">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
                <AlertCircle className="h-4 w-4 shrink-0 text-secondary" /> Pendências de classificação
              </h2>
              <p className="mt-1 pl-6 text-sm text-muted-foreground tabular-nums">
                {pendingClassification.length} {pendingClassification.length === 1 ? "lançamento" : "lançamentos"} · {brl.format(pendingAmount)}
              </p>
            </div>
            <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => navigate({ to: "/lancamentos" })}>
              Classificar agora <ArrowRight className="h-4 w-4" />
            </Button>
          </section>
        )}

        {/* Empty State Banner */}
        {!isLoading && isNew && rows.length === 0 && (
          <div className="neu-raised mb-6 rounded-2xl p-6 text-center">
            <h3 className="mb-2 text-lg font-bold">Mês Vazio</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Você ainda não tem nenhum planejamento para {MESES[month - 1]} {year}. Como deseja começar?
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={() => copyMutation.mutate()}
                disabled={copyMutation.isPending}
                className="neu-pressable inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 font-semibold text-primary"
              >
                <Copy className="h-5 w-5" />
                Copiar do mês passado
              </button>
              <button
                onClick={() => templateMutation.mutate()}
                disabled={templateMutation.isPending}
                className="neu-pressable inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 font-semibold text-secondary"
              >
                <Wand2 className="h-5 w-5" />
                Usar Template Padrão
              </button>
            </div>
          </div>
        )}

        {/* Mobile list */}
        <div className="space-y-3 md:hidden">
          {isLoading && (
            <div className="neu-raised rounded-2xl p-4 sm:p-6 text-center text-muted-foreground">Carregando...</div>
          )}
          {!isLoading && !isNew && rows.length === 0 && (
            <div className="neu-raised rounded-2xl p-4 sm:p-6 text-center text-sm text-muted-foreground">
              Nenhuma linha. Adicione uma entrada ou saída.
            </div>
          )}
          {rows.map((row) => (
            <RowCard
              key={row.id}
              row={row}
              categories={categories}
              isDragging={dragId === row.id}
              onDragStart={() => setDragId(row.id)}
              onDragEnd={() => setDragId(null)}
              onDropRow={() => handleDrop(row.id)}
              onUpdate={(patch) => updateMutation.mutate({ id: row.id, ...patch })}
              onDelete={() => deleteMutation.mutate(row.id)}
            />
          ))}
        </div>

        {/* Table */}
        <div className="finance-ledger hidden overflow-hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="w-8 px-2 py-4"></th>
                  <th className="px-4 py-4">Descrição</th>
                  <th className="px-4 py-4">Classe</th>
                  <th className="px-4 py-4">Categoria</th>
                  <th className="px-4 py-4 text-right">Entrada (R$)</th>
                  <th className="px-4 py-4 text-right">Saída (R$)</th>
                  <th className="px-4 py-4 text-center">Conferido</th>
                  <th className="px-4 py-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Carregando...</td></tr>
                )}
                {!isLoading && !isNew && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Nenhuma linha. Adicione uma entrada ou saída.</td></tr>
                )}
                {rows.map((row) => (
                  <RowItem
                     key={row.id}
                     row={row}
                     categories={categories}
                     isDragging={dragId === row.id}
                    onDragStart={() => setDragId(row.id)}
                    onDragEnd={() => setDragId(null)}
                    onDropRow={() => handleDrop(row.id)}
                    onUpdate={(patch) => updateMutation.mutate({ id: row.id, ...patch })}
                    onDelete={() => deleteMutation.mutate(row.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add buttons */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-end">
          <button
            onClick={() => addMutation.mutate("entrada")}
            className="neu-pressable inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary"
          >
            <Plus className="h-4 w-4" /> Entrada
          </button>
          <button
            onClick={() => addMutation.mutate("saida")}
            className="neu-pressable inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-secondary"
          >
            <Plus className="h-4 w-4" /> Saída
          </button>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}

type RowPatch = { descricao?: string; tipo?: "entrada" | "saida"; valor?: number; quitado?: boolean; expense_class?: "fixo" | "variavel"; category_id?: string | null };

function RowCard({
  row, categories, onUpdate, onDelete, isDragging, onDragStart, onDragEnd, onDropRow,
}: {
  row: Row;
  categories: Category[];
  onUpdate: (patch: RowPatch) => void;
  onDelete: () => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropRow: () => void;
}) {
  const [descricao, setDescricao] = useState(row.descricao);
  const [valor, setValor] = useState<string>(String(row.valor ?? 0));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descFocused = useRef(false);
  const valorFocused = useRef(false);

  useEffect(() => {
    if (descFocused.current) return;
    if (descricao !== row.descricao) setDescricao(row.descricao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.descricao]);
  useEffect(() => {
    if (valorFocused.current) return;
    const localNum = parseFloat(valor.replace(",", ".")) || 0;
    if (localNum !== Number(row.valor)) setValor(String(row.valor ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.valor]);

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
  const quitado = row.quitado;
  const textCls = quitado ? "line-through" : "";

  return (
    <div
      className={`finance-line py-4 ${isDragging ? "opacity-40" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropRow}
    >
      <div className="flex items-center gap-2">
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex h-11 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground/60 active:cursor-grabbing"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <input
          value={descricao}
          onFocus={() => { descFocused.current = true; }}
          onChange={(e) => { setDescricao(e.target.value); scheduleSave(commitDescricao); }}
          onBlur={() => { descFocused.current = false; commitDescricao(); }}
          className={`neu-inset min-h-[44px] w-full min-w-0 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 ${textCls}`}
          placeholder="Descrição"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="neu-inset inline-flex shrink-0 rounded-full p-1">
          <button
            type="button"
            onClick={() => changeTipo("entrada")}
            className={`rounded-full px-3 py-2 text-xs font-semibold transition-all ${isEntrada ? "neu-raised-sm text-primary" : "text-muted-foreground"}`}
          >
            Entrada
          </button>
          <button
            type="button"
            onClick={() => changeTipo("saida")}
            className={`rounded-full px-3 py-2 text-xs font-semibold transition-all ${!isEntrada ? "neu-raised-sm text-danger" : "text-muted-foreground"}`}
          >
            Saída
          </button>
        </div>
        <input
          type="text" inputMode="decimal" pattern="[0-9.,]*"
          value={valor}
          onFocus={() => { valorFocused.current = true; }}
          onChange={(e) => { setValor(e.target.value); scheduleSave(commitValor); }}
          onBlur={() => { valorFocused.current = false; commitValor(); }}
          className={`neu-inset min-h-[44px] w-full min-w-0 rounded-lg px-3 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 ${isEntrada ? "focus:ring-primary/40" : "focus:ring-danger/40"} ${textCls}`}
          placeholder="0,00"
        />
      </div>

      {!isEntrada && (
        <div className="mt-3 space-y-2" aria-label="Classificação do gasto">
          <div className="grid grid-cols-2 gap-2">
            {(["fixo", "variavel"] as const).map((cls) => (
              <button
                key={cls}
                type="button"
                onClick={() => onUpdate({ expense_class: cls })}
                className={`min-h-[44px] rounded-xl text-xs font-semibold ${row.expense_class === cls ? "neu-inset text-secondary" : "neu-pressable text-muted-foreground"}`}
              >
                {cls === "fixo" ? "Fixo" : "Variável"}
              </button>
            ))}
          </div>
          {categories.length > 0 && (
            <select
              value={row.category_id ?? ""}
              onChange={(e) => onUpdate({ category_id: e.target.value || null })}
              aria-label="Categoria de despesa"
              className="neu-inset min-h-[44px] w-full rounded-lg bg-transparent px-3 text-xs outline-none focus:ring-2 focus:ring-secondary/40"
            >
              <option value="">Sem categoria</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onUpdate({ quitado: !quitado })}
          aria-pressed={quitado}
          aria-label={quitado ? "Marcar como não conferido" : "Marcar como conferido"}
          className={`neu-pressable inline-flex h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold ${quitado ? "text-primary" : "text-muted-foreground/70"}`}
        >
          <Check className={`h-4 w-4 ${quitado ? "opacity-100" : "opacity-40"}`} /> {quitado ? "Conferido" : "Não conferido"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="neu-pressable inline-flex h-11 w-11 items-center justify-center rounded-xl text-danger"
          aria-label="Excluir linha"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SummaryCard({
  label, value, tone, emphasize,
}: { label: string; value: number; tone: "success" | "danger"; emphasize?: boolean }) {
  const color = tone === "success" ? "text-primary" : "text-danger";
  return (
    <div className={`finance-metric ${emphasize ? "col-span-2 border-l-2 border-primary pl-4 sm:col-span-1" : ""}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`finance-value mt-2 whitespace-nowrap text-2xl font-semibold sm:text-3xl ${color}`}>{brl.format(value)}</div>
    </div>
  );
}

function RowItem({
  row, categories, onUpdate, onDelete, isDragging, onDragStart, onDragEnd, onDropRow,
}: {
  row: Row;
  categories: Category[];
  onUpdate: (patch: RowPatch) => void;
  onDelete: () => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropRow: () => void;
}) {
  const [descricao, setDescricao] = useState(row.descricao);
  const [valor, setValor] = useState<string>(String(row.valor ?? 0));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descFocused = useRef(false);
  const valorFocused = useRef(false);

  useEffect(() => {
    if (descFocused.current) return;
    if (descricao !== row.descricao) setDescricao(row.descricao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.descricao]);
  useEffect(() => {
    if (valorFocused.current) return;
    const localNum = parseFloat(valor.replace(",", ".")) || 0;
    if (localNum !== Number(row.valor)) setValor(String(row.valor ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, row.valor]);

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
  const quitado = row.quitado;
  const rowCls = `border-t border-border/60 transition-opacity ${isDragging ? "opacity-40" : ""}`;
  const textCls = quitado ? "line-through" : "";

  return (
    <tr
      className={rowCls}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropRow}
    >
      <td className="px-2 py-3">
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex cursor-grab items-center justify-center text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </td>
      <td className="px-4 py-3">
        <input
          value={descricao}
          onFocus={() => { descFocused.current = true; }}
          onChange={(e) => { setDescricao(e.target.value); scheduleSave(commitDescricao); }}
          onBlur={() => { descFocused.current = false; commitDescricao(); }}
          className={`neu-inset w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 ${textCls}`}
          placeholder="Descrição"
        />
      </td>
      <td className="px-4 py-3">
        {isEntrada ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <select
            value={row.expense_class}
            onChange={(event) => onUpdate({ expense_class: event.target.value as "fixo" | "variavel" })}
            aria-label={`Classe de ${row.descricao || "saída"}`}
            className="neu-inset min-h-[44px] rounded-lg bg-transparent px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-secondary/40"
          >
            <option value="fixo">Fixo</option>
            <option value="variavel">Variável</option>
          </select>
        )}
      </td>
      <td className="px-4 py-3">
        {isEntrada ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : categories.length > 0 ? (
          <select
            value={row.category_id ?? ""}
            onChange={(e) => onUpdate({ category_id: e.target.value || null })}
            aria-label={`Categoria de ${row.descricao || "saída"}`}
            className="neu-inset min-h-[44px] rounded-lg bg-transparent px-3 text-xs outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Sem categoria</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
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
          type="text" inputMode="decimal" pattern="[0-9.,]*"
          value={isEntrada ? valor : ""}
          disabled={!isEntrada}
          onFocus={() => { valorFocused.current = true; }}
          onChange={(e) => { setValor(e.target.value); scheduleSave(commitValor); }}
          onBlur={() => { valorFocused.current = false; commitValor(); }}
          className={`neu-inset w-full max-w-[140px] rounded-lg px-3 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary/40 ${!isEntrada ? "opacity-40" : ""} ${textCls}`}
          placeholder="0,00"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <input
          type="text" inputMode="decimal" pattern="[0-9.,]*"
          value={!isEntrada ? valor : ""}
          disabled={isEntrada}
          onFocus={() => { valorFocused.current = true; }}
          onChange={(e) => { setValor(e.target.value); scheduleSave(commitValor); }}
          onBlur={() => { valorFocused.current = false; commitValor(); }}
          className={`neu-inset w-full max-w-[140px] rounded-lg px-3 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-danger/40 ${isEntrada ? "opacity-40" : ""} ${textCls}`}
          placeholder="0,00"
        />
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={() => onUpdate({ quitado: !quitado })}
          aria-pressed={quitado}
          aria-label={quitado ? "Marcar como não conferido" : "Marcar como conferido"}
          title={quitado ? "Conferido" : "Não conferido"}
          className={`neu-pressable inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${quitado ? "text-primary" : "text-muted-foreground/50"}`}
        >
          <Check className={`h-4 w-4 transition-opacity ${quitado ? "opacity-100" : "opacity-30"}`} />
        </button>
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
