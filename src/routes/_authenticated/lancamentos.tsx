import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarDays, Check, Edit3, LogOut, Plus, Search, Tags, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Logo } from "@/components/logo";
import { InstallPWAButton } from "@/components/install-pwa-button";
import { MobileNav } from "@/components/mobile-nav";
import { PageTabs } from "@/components/page-tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  createExpenseCategory,
  createTransaction,
  deleteExpenseCategory,
  deleteTransaction,
  getTransactionWorkspace,
  renameExpenseCategory,
  updateTransaction,
} from "@/lib/transactions.functions";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [
    { title: "Lançamentos — Month Check" },
    { name: "description", content: "Cadastre e analise suas entradas e seus gastos por categoria." },
    { property: "og:title", content: "Lançamentos — Month Check" },
    { property: "og:description", content: "Cadastre e analise suas entradas e seus gastos por categoria." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TransactionsPage,
});

type Category = { id: string; name: string; color_key: string };
type Transaction = {
  id: string; year: number; month: number; transaction_date: string | null; descricao: string;
  tipo: "entrada" | "saida"; valor: number; quitado: boolean; expense_class: "fixo" | "variavel";
  category_id: string | null; position: number;
};
type FormState = { id?: string; date: string; description: string; type: "entrada" | "saida"; value: string; categoryId: string; expenseClass: "fixo" | "variavel"; settled: boolean };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactBrl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" });
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-chart-6)", "var(--color-chart-7)", "var(--color-muted-foreground)"];

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function firstDayMonthsAgo(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months + 1, 1);
  return localDate(date);
}
function emptyForm(): FormState { return { date: localDate(), description: "", type: "saida", value: "", categoryId: "", expenseClass: "variavel", settled: false }; }

function TransactionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getTransactionWorkspace);
  const createFn = useServerFn(createTransaction);
  const updateFn = useServerFn(updateTransaction);
  const deleteFn = useServerFn(deleteTransaction);
  const createCategoryFn = useServerFn(createExpenseCategory);
  const renameCategoryFn = useServerFn(renameExpenseCategory);
  const deleteCategoryFn = useServerFn(deleteExpenseCategory);
  const [from, setFrom] = useState(() => firstDayMonthsAgo(6));
  const [to, setTo] = useState(() => localDate());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [settledFilter, setSettledFilter] = useState("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const key = ["transactions", from, to] as const;
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => fetchWorkspace({ data: { from, to } }) as Promise<{ categories: Category[]; rows: Transaction[] }>,
  });
  const categories = data?.categories ?? [];
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const rows = useMemo(() => (data?.rows ?? []).filter((row) => {
    if (search && !row.descricao.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))) return false;
    if (typeFilter !== "todos" && row.tipo !== typeFilter) return false;
    if (categoryFilter === "sem-categoria" && row.category_id) return false;
    if (categoryFilter !== "todas" && categoryFilter !== "sem-categoria" && row.category_id !== categoryFilter) return false;
    if (settledFilter === "quitado" && !row.quitado) return false;
    if (settledFilter === "pendente" && row.quitado) return false;
    return true;
  }), [data, search, typeFilter, categoryFilter, settledFilter]);

  const totals = useMemo(() => rows.reduce((sum, row) => {
    if (row.tipo === "entrada") sum.income += Number(row.valor) || 0;
    else sum.expense += Number(row.valor) || 0;
    return sum;
  }, { income: 0, expense: 0 }), [rows]);
  const distribution = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const row of rows.filter((item) => item.tipo === "saida")) {
      const name = row.category_id ? categoryNames.get(row.category_id) ?? "Sem categoria" : "Sem categoria";
      grouped.set(name, (grouped.get(name) ?? 0) + (Number(row.valor) || 0));
    }
    return [...grouped].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rows, categoryNames]);
  const monthly = useMemo(() => {
    const values = new Map<string, Record<string, number | string>>();
    for (const row of rows.filter((item) => item.tipo === "saida")) {
      const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
      const name = row.category_id ? categoryNames.get(row.category_id) ?? "Sem categoria" : "Sem categoria";
      const item = values.get(key) ?? { key, label: `${MONTHS[row.month - 1]}/${String(row.year).slice(-2)}` };
      item[name] = Number(item[name] ?? 0) + (Number(row.valor) || 0);
      values.set(key, item);
    }
    return [...values.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }, [rows, categoryNames]);
  const visibleCategories = distribution.map((item) => item.name);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["month-rows"] });
    queryClient.invalidateQueries({ queryKey: ["year-totals"] });
    queryClient.invalidateQueries({ queryKey: ["future-projection"] });
  };
  const saveMutation = useMutation({ mutationFn: async () => {
    const value = Number(form.value.replace(",", ".")) || 0;
    const payload = { date: form.date, description: form.description, type: form.type, value, categoryId: form.categoryId || null, expenseClass: form.expenseClass, settled: form.settled };
    if (form.id) return updateFn({ data: { id: form.id, ...payload } });
    return createFn({ data: payload });
  }, onSuccess: () => { refresh(); setFormOpen(false); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => deleteFn({ data: { id } }), onSuccess: refresh });

  function edit(row: Transaction) {
    setForm({ id: row.id, date: row.transaction_date ?? `${row.year}-${String(row.month).padStart(2, "0")}-01`, description: row.descricao, type: row.tipo, value: String(row.valor), categoryId: row.category_id ?? "", expenseClass: row.expense_class, settled: row.quitado });
    setFormOpen(true);
  }
  async function signOut() { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6 sm:px-8 sm:py-8 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:mb-8 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3"><Logo height={40} /><div className="min-w-0"><h1 className="truncate text-xl font-bold sm:text-3xl">Month Check</h1><p className="truncate text-sm text-muted-foreground">Lançamentos e distribuição dos gastos</p></div></div>
          <div className="flex items-center gap-2"><InstallPWAButton /><Button variant="ghost" onClick={signOut} className="neu-pressable min-h-11"><LogOut /><span className="hidden sm:inline">Sair</span></Button></div>
        </header>
        <div className="mb-6"><PageTabs /></div>

        <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterField label="De"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></FilterField>
            <FilterField label="Até"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></FilterField>
            <FilterField label="Tipo"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="neu-inset min-h-11 w-full rounded-lg bg-transparent px-3"><option value="todos">Todos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select></FilterField>
            <FilterField label="Categoria"><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="neu-inset min-h-11 w-full rounded-lg bg-transparent px-3"><option value="todas">Todas</option><option value="sem-categoria">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></FilterField>
            <FilterField label="Situação"><select value={settledFilter} onChange={(event) => setSettledFilter(event.target.value)} className="neu-inset min-h-11 w-full rounded-lg bg-transparent px-3"><option value="todos">Todas</option><option value="quitado">Quitados</option><option value="pendente">Pendentes</option></select></FilterField>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="neu-inset flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3"><Search className="h-4 w-4 text-muted-foreground"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar descrição" className="w-full bg-transparent text-sm outline-none" /></label>
            <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setCategoryOpen(true)} className="neu-pressable min-h-11"><Tags />Categorias</Button><Button onClick={() => { setForm(emptyForm()); setFormOpen(true); }} className="min-h-11"><Plus />Novo lançamento</Button></div>
          </div>
        </section>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric icon={TrendingUp} label="Entradas" value={totals.income} tone="positive" />
          <Metric icon={TrendingDown} label="Saídas" value={totals.expense} tone="negative" />
          <Metric icon={Wallet} label="Saldo" value={totals.income - totals.expense} tone={totals.income - totals.expense >= 0 ? "positive" : "negative"} />
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <ChartCard title="Distribuição por categoria" empty={!distribution.length}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={distribution} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="76%" paddingAngle={2}>{distribution.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => brl.format(Number(value))} /><Legend /></PieChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Gastos por mês" empty={!monthly.length}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)"/><XAxis dataKey="label" fontSize={11}/><YAxis width={68} fontSize={11} tickFormatter={(value) => compactBrl.format(Number(value))}/><Tooltip formatter={(value) => brl.format(Number(value))}/><Legend />{visibleCategories.map((name, index) => <Bar key={name} dataKey={name} stackId="expenses" fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</BarChart></ResponsiveContainer>
          </ChartCard>
        </div>

        <section className="neu-raised rounded-2xl p-4 sm:p-6">
          <h2 className="font-bold">Lançamentos do período</h2>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "registro encontrado" : "registros encontrados"}</p>
          {isLoading ? <Empty text="Carregando lançamentos..." /> : error ? <Empty text="Não foi possível carregar os lançamentos." /> : rows.length === 0 ? <Empty text="Nenhum lançamento encontrado para os filtros escolhidos." /> : <div className="mt-4 grid gap-3 md:grid-cols-2">{rows.map((row) => <TransactionCard key={row.id} row={row} category={row.category_id ? categoryNames.get(row.category_id) : undefined} onEdit={() => edit(row)} onDelete={() => deleteMutation.mutate(row.id)} />)}</div>}
        </section>
      </div>

      <TransactionDialog open={formOpen} onOpenChange={setFormOpen} form={form} setForm={setForm} categories={categories} saving={saveMutation.isPending} onSave={() => saveMutation.mutate()} />
      <CategoriesDialog open={categoryOpen} onOpenChange={setCategoryOpen} categories={categories} onCreate={async (name, colorKey) => { await createCategoryFn({ data: { name, colorKey } }); refresh(); }} onRename={async (id, name) => { await renameCategoryFn({ data: { id, name } }); refresh(); }} onDelete={async (id) => { await deleteCategoryFn({ data: { id } }); refresh(); }} />
      <MobileNav />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{label}</span>{children}</label>; }
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: number; tone: "positive" | "negative" }) { return <article className="neu-raised rounded-2xl p-4 sm:p-5"><div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><Icon className="h-4 w-4" />{label}</div><div className={`mt-2 break-words text-xl font-bold sm:text-2xl ${tone === "positive" ? "text-primary" : "text-danger"}`}>{brl.format(value)}</div></article>; }
function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) { return <section className="neu-raised rounded-2xl p-4 sm:p-6"><h2 className="font-bold">{title}</h2><div className="mt-4 h-72">{empty ? <div className="neu-inset flex h-full items-center justify-center rounded-xl px-6 text-center text-sm text-muted-foreground">Adicione gastos categorizados para visualizar este gráfico.</div> : children}</div></section>; }
function Empty({ text }: { text: string }) { return <div className="neu-inset mt-4 rounded-xl p-8 text-center text-sm text-muted-foreground">{text}</div>; }

function TransactionCard({ row, category, onEdit, onDelete }: { row: Transaction; category?: string; onEdit: () => void; onDelete: () => void }) {
  const date = row.transaction_date ?? `${row.year}-${String(row.month).padStart(2, "0")}-01`;
  return <article className={`neu-inset rounded-xl p-4 ${row.quitado ? "opacity-70" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className={`truncate font-semibold ${row.quitado ? "line-through" : ""}`}>{row.descricao || "Sem descrição"}</h3><div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5"/>{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</span>{row.tipo === "saida" && <span>{category ?? "Sem categoria"}</span>}{row.quitado && <span className="inline-flex items-center gap-1 text-primary"><Check className="h-3.5 w-3.5"/>Quitado</span>}</div></div><div className={`shrink-0 font-bold ${row.tipo === "entrada" ? "text-primary" : "text-danger"}`}>{row.tipo === "entrada" ? "+" : "−"}{brl.format(Number(row.valor))}</div></div><div className="mt-3 flex justify-end gap-2"><Button variant="ghost" size="icon" onClick={onEdit} className="neu-pressable h-11 w-11" aria-label="Editar lançamento"><Edit3 /></Button><Button variant="ghost" size="icon" onClick={onDelete} className="neu-pressable h-11 w-11 text-danger" aria-label="Excluir lançamento"><Trash2 /></Button></div></article>;
}

function TransactionDialog({ open, onOpenChange, form, setForm, categories, saving, onSave }: { open: boolean; onOpenChange: (value: boolean) => void; form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; categories: Category[]; saving: boolean; onSave: () => void }) {
  const valid = form.date && form.description.trim() && Number(form.value.replace(",", ".")) > 0;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{form.id ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader><div className="space-y-4 overflow-y-auto px-1"><div className="grid grid-cols-2 gap-3"><FilterField label="Data"><Input type="date" value={form.date} onChange={(event) => setForm((old) => ({ ...old, date: event.target.value }))}/></FilterField><FilterField label="Tipo"><select value={form.type} onChange={(event) => setForm((old) => ({ ...old, type: event.target.value as FormState["type"] }))} className="neu-inset min-h-11 w-full rounded-lg bg-transparent px-3"><option value="saida">Saída</option><option value="entrada">Entrada</option></select></FilterField></div><div><Label>Descrição</Label><Input className="mt-1" value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} placeholder="Ex: Supermercado" /></div><div><Label>Valor (R$)</Label><Input className="mt-1" type="text" inputMode="decimal" value={form.value} onChange={(event) => setForm((old) => ({ ...old, value: event.target.value }))} placeholder="0,00" /></div>{form.type === "saida" && <><div><Label>Categoria</Label><select value={form.categoryId} onChange={(event) => setForm((old) => ({ ...old, categoryId: event.target.value }))} className="neu-inset mt-1 min-h-11 w-full rounded-lg bg-transparent px-3"><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="grid grid-cols-2 gap-2">{(["fixo", "variavel"] as const).map((value) => <Button key={value} type="button" variant="outline" className={`min-h-11 ${form.expenseClass === value ? "neu-inset text-secondary" : "neu-pressable"}`} onClick={() => setForm((old) => ({ ...old, expenseClass: value }))}>{value === "fixo" ? "Fixo" : "Variável"}</Button>)}</div></>}<label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={form.settled} onChange={(event) => setForm((old) => ({ ...old, settled: event.target.checked }))} className="h-5 w-5 accent-primary"/><span className="text-sm font-medium">Quitado</span></label></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={!valid || saving} onClick={onSave}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CategoriesDialog({ open, onOpenChange, categories, onCreate, onRename, onDelete }: { open: boolean; onOpenChange: (value: boolean) => void; categories: Category[]; onCreate: (name: string, color: string) => Promise<void>; onRename: (id: string, name: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Categorias de gastos</DialogTitle></DialogHeader><div className="space-y-3 overflow-y-auto">{categories.map((category) => <div key={category.id} className="neu-inset flex items-center gap-2 rounded-xl p-2"><input defaultValue={category.name} onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== category.name) void onRename(category.id, next); }} className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"/><Button variant="ghost" size="icon" className="h-11 w-11 text-danger" onClick={() => void onDelete(category.id)} aria-label={`Excluir ${category.name}`}><Trash2 /></Button></div>)}<div className="flex gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nova categoria"/><Button disabled={!name.trim()} onClick={async () => { await onCreate(name.trim(), "emerald"); setName(""); }}><Plus/>Adicionar</Button></div></div><DialogFooter><Button onClick={() => onOpenChange(false)}>Concluir</Button></DialogFooter></DialogContent></Dialog>;
}