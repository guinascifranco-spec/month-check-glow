import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarDays, Check, Edit3, LogOut, Plus, Search, Tags, Trash2, TrendingDown, TrendingUp, Wallet, Wand2, Settings2 } from "lucide-react";
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
  createCategoryRule,
  deleteCategoryRule,
  applyCategoryRules,
} from "@/lib/transactions.functions";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [
    { title: "Lançamentos — Month Check" },
    { name: "description", content: "Cadastre e analise suas entradas e seus gastos por categoria." },
  ] }),
  component: TransactionsPage,
});

type Category = { id: string; name: string; color_key: string };
type Rule = { id: string; keyword: string; category_id: string };
type Transaction = {
  id: string; year: number; month: number; transaction_date: string | null; descricao: string;
  tipo: "entrada" | "saida"; valor: number; quitado: boolean; expense_class: "fixo" | "variavel";
  category_id: string | null; position: number;
};
type FormState = { id?: string; date: string; description: string; type: "entrada" | "saida"; value: string; categoryId: string; expenseClass: "fixo" | "variavel"; settled: boolean };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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

function getSuggestedCategory(description: string, rules: Rule[]) {
  const desc = description.toLowerCase();
  for (const rule of rules) {
    if (desc.includes(rule.keyword)) {
      return rule.category_id;
    }
  }
  return null;
}

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
  const createRuleFn = useServerFn(createCategoryRule);
  const deleteRuleFn = useServerFn(deleteCategoryRule);
  const applyRulesFn = useServerFn(applyCategoryRules);

  const [from, setFrom] = useState(() => firstDayMonthsAgo(6));
  const [to, setTo] = useState(() => localDate());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [settledFilter, setSettledFilter] = useState("todos");
  
  const [formOpen, setFormOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const key = ["transactions", from, to] as const;
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => fetchWorkspace({ data: { from, to } }) as Promise<{ categories: Category[]; rules: Rule[]; rows: Transaction[] }>,
  });
  
  const categories = data?.categories ?? [];
  const rules = data?.rules ?? [];
  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  
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

  // Group by month/year
  const groupedRows = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const row of rows) {
      const g = `${row.year}-${String(row.month).padStart(2, "0")}`;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(row);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0])); // newest first
  }, [rows]);

  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.tipo === "saida" && row.valor > 0) {
        const catName = row.category_id ? (categoryNames.get(row.category_id) ?? "Desconhecida") : "Sem categoria";
        map.set(catName, (map.get(catName) || 0) + Number(row.valor));
      }
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rows, categoryNames]);

  const monthlyChartData = useMemo(() => {
    const arr = [...groupedRows].reverse();
    return arr.map(([key, groupRows]) => {
      let income = 0;
      let expense = 0;
      for (const r of groupRows) {
        if (r.tipo === "entrada") income += Number(r.valor) || 0;
        else expense += Number(r.valor) || 0;
      }
      const [y, m] = key.split("-");
      const label = `${MONTHS[parseInt(m, 10) - 1].slice(0,3)}/${y.slice(2)}`;
      return { label, Entradas: income, Saídas: expense };
    });
  }, [groupedRows]);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#64748b'];

  // Suggestions
  const suggestions = useMemo(() => {
    return rows
      .filter((r) => r.tipo === "saida" && !r.category_id)
      .map((r) => ({ row: r, suggestedCategoryId: getSuggestedCategory(r.descricao, rules) }))
      .filter((s) => s.suggestedCategoryId !== null) as { row: Transaction; suggestedCategoryId: string }[];
  }, [rows, rules]);

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
  
  const applyRulesMutation = useMutation({
    mutationFn: (updates: Array<{ id: string; categoryId: string }>) => applyRulesFn({ data: { updates } }),
    onSuccess: () => { refresh(); setReviewOpen(false); }
  });

  function edit(row: Transaction) {
    setForm({ id: row.id, date: row.transaction_date ?? `${row.year}-${String(row.month).padStart(2, "0")}-01`, description: row.descricao, type: row.tipo, value: String(row.valor || ""), categoryId: row.category_id ?? "", expenseClass: row.expense_class, settled: row.quitado });
    setFormOpen(true);
  }

  async function signOut() { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6 sm:px-8 sm:py-8 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:mb-8 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3"><Logo height={40} /><div className="min-w-0"><h1 className="truncate text-xl font-bold sm:text-3xl">Month Check</h1><p className="truncate text-sm text-muted-foreground">Histórico Oficial (Lançamentos)</p></div></div>
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
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="neu-inset flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3"><Search className="h-4 w-4 text-muted-foreground"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar descrição" className="w-full bg-transparent text-sm outline-none" /></label>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => setRulesOpen(true)} className="neu-pressable min-h-11"><Settings2 />Regras</Button>
              <Button variant="outline" onClick={() => setCategoryOpen(true)} className="neu-pressable min-h-11"><Tags />Categorias</Button>
              <Button onClick={() => { setForm(emptyForm()); setFormOpen(true); }} className="min-h-11"><Plus />Novo</Button>
            </div>
          </div>
        </section>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric icon={TrendingUp} label="Entradas (Filtro)" value={totals.income} tone="positive" />
          <Metric icon={TrendingDown} label="Saídas (Filtro)" value={totals.expense} tone="negative" />
          <Metric icon={Wallet} label="Saldo (Filtro)" value={totals.income - totals.expense} tone={totals.income - totals.expense >= 0 ? "positive" : "negative"} />
        </div>

        {suggestions.length > 0 && (
          <div className="neu-raised mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl p-4 border-l-4 border-secondary/50">
            <div>
              <h3 className="font-bold flex items-center gap-2"><Wand2 className="h-4 w-4 text-secondary" /> Categorias sugeridas</h3>
              <p className="text-sm text-muted-foreground">Encontramos {suggestions.length} lançamentos sem categoria que combinam com suas regras.</p>
            </div>
            <Button onClick={() => setReviewOpen(true)} variant="secondary" className="shrink-0">Revisar {suggestions.length} sugestões</Button>
          </div>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="neu-raised rounded-2xl p-4 sm:p-6 flex flex-col">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Despesas por Categoria</h3>
              <div className="h-[250px] w-full">
                {categoryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2}>
                        {categoryChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value: number) => brl.format(value)} contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Legend verticalAlign="middle" align="right" layout="vertical" wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty text="Nenhuma despesa para exibir no gráfico." />
                )}
              </div>
            </div>

            <div className="neu-raised rounded-2xl p-4 sm:p-6 flex flex-col">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Evolução Mensal</h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.3)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(val) => `R$${val > 1000 ? (val/1000).toFixed(0)+'k' : val}`} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.3)' }} formatter={(value: number) => brl.format(value)} contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <section className="space-y-8">
          {isLoading ? <Empty text="Carregando lançamentos..." /> : error ? <Empty text="Não foi possível carregar os lançamentos." /> : rows.length === 0 ? <Empty text="Nenhum lançamento encontrado." /> : (
            groupedRows.map(([groupKey, groupRows]) => {
              const [y, m] = groupKey.split("-");
              const monthName = `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
              return (
                <div key={groupKey} className="neu-raised rounded-2xl overflow-hidden">
                  <div className="bg-muted/30 px-4 py-3 font-bold border-b border-border/50 text-sm tracking-wide">
                    {monthName}
                  </div>
                  <div className="divide-y divide-border/50">
                    {groupRows.map(row => (
                      <TransactionRow key={row.id} row={row} category={row.category_id ? categoryNames.get(row.category_id) : undefined} onEdit={() => edit(row)} onDelete={() => deleteMutation.mutate(row.id)} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      <TransactionDialog open={formOpen} onOpenChange={setFormOpen} form={form} setForm={setForm} categories={categories} saving={saveMutation.isPending} onSave={() => saveMutation.mutate()} />
      <CategoriesDialog open={categoryOpen} onOpenChange={setCategoryOpen} categories={categories} onCreate={async (name, colorKey) => { await createCategoryFn({ data: { name, colorKey } }); refresh(); }} onRename={async (id, name) => { await renameCategoryFn({ data: { id, name } }); refresh(); }} onDelete={async (id) => { await deleteCategoryFn({ data: { id } }); refresh(); }} />
      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} rules={rules} categories={categories} categoryNames={categoryNames} onCreate={async (keyword, categoryId) => { await createRuleFn({ data: { keyword, categoryId } }); refresh(); }} onDelete={async (id) => { await deleteRuleFn({ data: { id } }); refresh(); }} />
      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} suggestions={suggestions} categoryNames={categoryNames} onApply={(updates) => applyRulesMutation.mutate(updates)} isApplying={applyRulesMutation.isPending} />
      <MobileNav />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{label}</span>{children}</label>; }
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: number; tone: "positive" | "negative" }) { return <article className="neu-raised rounded-2xl p-4 sm:p-5"><div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><Icon className="h-4 w-4" />{label}</div><div className={`mt-2 break-words text-xl font-bold sm:text-2xl ${tone === "positive" ? "text-primary" : "text-danger"}`}>{brl.format(value)}</div></article>; }
function Empty({ text }: { text: string }) { return <div className="neu-inset rounded-xl p-8 text-center text-sm text-muted-foreground">{text}</div>; }

function TransactionRow({ row, category, onEdit, onDelete }: { row: Transaction; category?: string; onEdit: () => void; onDelete: () => void }) {
  const date = row.transaction_date ?? `${row.year}-${String(row.month).padStart(2, "0")}-01`;
  const formattedDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(new Date(`${date}T12:00:00Z`));
  const hasValue = row.valor && row.valor > 0;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 p-3 sm:p-4 hover:bg-muted/10 transition-colors ${row.quitado ? "opacity-60" : ""}`}>
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground bg-muted/20 rounded p-1 text-center">{formattedDate}</div>
        <div className="min-w-0">
          <div className={`truncate font-semibold text-sm sm:text-base ${row.quitado ? "line-through" : ""}`}>{row.descricao || "Sem descrição"}</div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
            {row.tipo === "saida" && <span className="bg-muted/30 px-1.5 py-0.5 rounded">{category ?? "Sem categoria"}</span>}
            {row.tipo === "saida" && row.expense_class && <span className="opacity-70">{row.expense_class === "fixo" ? "Fixo" : "Variável"}</span>}
            {row.quitado && <span className="text-primary flex items-center gap-1"><Check className="h-3 w-3"/> Quit.</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-4 mt-2 sm:mt-0 pl-15 sm:pl-0">
        <div className={`font-bold tabular-nums text-right ${row.tipo === "entrada" ? "text-primary" : "text-danger"} ${!hasValue ? "text-muted-foreground/50 text-sm font-medium" : ""}`}>
          {!hasValue ? "sem valor" : `${row.tipo === "entrada" ? "+" : "−"}${brl.format(Number(row.valor))}`}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8 hover:bg-background"><Edit3 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 text-danger hover:bg-background"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function TransactionDialog({ open, onOpenChange, form, setForm, categories, saving, onSave }: { open: boolean; onOpenChange: (value: boolean) => void; form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; categories: Category[]; saving: boolean; onSave: () => void }) {
  const valid = form.date && form.description.trim(); // valor 0 is now allowed as 'sem valor'
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{form.id ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader><div className="space-y-4 overflow-y-auto px-1"><div className="grid grid-cols-2 gap-3"><FilterField label="Data"><Input type="date" value={form.date} onChange={(event) => setForm((old) => ({ ...old, date: event.target.value }))}/></FilterField><FilterField label="Tipo"><select value={form.type} onChange={(event) => setForm((old) => ({ ...old, type: event.target.value as FormState["type"] }))} className="neu-inset min-h-11 w-full rounded-lg bg-transparent px-3"><option value="saida">Saída</option><option value="entrada">Entrada</option></select></FilterField></div><div><Label>Descrição</Label><Input className="mt-1" value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} placeholder="Ex: Supermercado" /></div><div><Label>Valor (R$) <span className="text-muted-foreground font-normal">(Deixe vazio para "sem valor")</span></Label><Input className="mt-1" type="text" inputMode="decimal" value={form.value} onChange={(event) => setForm((old) => ({ ...old, value: event.target.value }))} placeholder="0,00" /></div>{form.type === "saida" && <><div><Label>Categoria</Label><select value={form.categoryId} onChange={(event) => setForm((old) => ({ ...old, categoryId: event.target.value }))} className="neu-inset mt-1 min-h-11 w-full rounded-lg bg-transparent px-3"><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="grid grid-cols-2 gap-2">{(["fixo", "variavel"] as const).map((value) => <Button key={value} type="button" variant="outline" className={`min-h-11 ${form.expenseClass === value ? "neu-inset text-secondary" : "neu-pressable"}`} onClick={() => setForm((old) => ({ ...old, expenseClass: value }))}>{value === "fixo" ? "Fixo" : "Variável"}</Button>)}</div></>}<label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={form.settled} onChange={(event) => setForm((old) => ({ ...old, settled: event.target.checked }))} className="h-5 w-5 accent-primary"/><span className="text-sm font-medium">Quitado</span></label></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={!valid || saving} onClick={onSave}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CategoriesDialog({ open, onOpenChange, categories, onCreate, onRename, onDelete }: { open: boolean; onOpenChange: (value: boolean) => void; categories: Category[]; onCreate: (name: string, color: string) => Promise<void>; onRename: (id: string, name: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Categorias de gastos</DialogTitle></DialogHeader><div className="space-y-3 overflow-y-auto max-h-[50vh]">{categories.map((category) => <div key={category.id} className="neu-inset flex items-center gap-2 rounded-xl p-2"><input defaultValue={category.name} onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== category.name) void onRename(category.id, next); }} className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"/><Button variant="ghost" size="icon" className="h-11 w-11 text-danger shrink-0" onClick={() => void onDelete(category.id)} aria-label={`Excluir ${category.name}`}><Trash2 /></Button></div>)}</div><div className="flex gap-2 pt-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nova categoria"/><Button disabled={!name.trim()} onClick={async () => { await onCreate(name.trim(), "emerald"); setName(""); }}><Plus/>Adicionar</Button></div><DialogFooter><Button onClick={() => onOpenChange(false)}>Concluir</Button></DialogFooter></DialogContent></Dialog>;
}

function RulesDialog({ open, onOpenChange, rules, categories, categoryNames, onCreate, onDelete }: { open: boolean; onOpenChange: (value: boolean) => void; rules: Rule[]; categories: Category[]; categoryNames: Map<string, string>; onCreate: (keyword: string, categoryId: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [keyword, setKeyword] = useState("");
  const [catId, setCatId] = useState("");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Regras de Categoria Automática</DialogTitle><p className="text-sm text-muted-foreground mt-1">Se a descrição contiver a palavra-chave, a categoria será sugerida automaticamente.</p></DialogHeader><div className="space-y-3 overflow-y-auto max-h-[50vh]">{rules.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma regra criada ainda.</p>}{rules.map((rule) => <div key={rule.id} className="neu-inset flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl p-3"><div className="text-sm">Palavra: <span className="font-bold">"{rule.keyword}"</span> → <span className="bg-muted/30 px-2 py-0.5 rounded font-medium">{categoryNames.get(rule.category_id) ?? "Desconhecida"}</span></div><Button variant="ghost" size="icon" className="h-8 w-8 text-danger shrink-0 self-end sm:self-auto" onClick={() => void onDelete(rule.id)} aria-label="Excluir regra"><Trash2 className="h-4 w-4" /></Button></div>)}</div><div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 pt-4 border-t border-border/50"><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Palavra-chave (ex: uber)"/><select value={catId} onChange={(e) => setCatId(e.target.value)} className="neu-inset min-h-11 rounded-lg bg-transparent px-3 text-sm"><option value="" disabled>Selecionar categoria...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Button disabled={!keyword.trim() || !catId} onClick={async () => { await onCreate(keyword.trim(), catId); setKeyword(""); setCatId(""); }}><Plus/>Criar</Button></div><DialogFooter><Button onClick={() => onOpenChange(false)}>Fechar</Button></DialogFooter></DialogContent></Dialog>;
}

function ReviewDialog({ open, onOpenChange, suggestions, categoryNames, onApply, isApplying }: { open: boolean; onOpenChange: (value: boolean) => void; suggestions: { row: Transaction; suggestedCategoryId: string }[]; categoryNames: Map<string, string>; onApply: (updates: {id: string, categoryId: string}[]) => void; isApplying: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(suggestions.map(s => s.row.id)));
  
  // Update selections when suggestions change
  useMemo(() => {
    setSelected(new Set(suggestions.map(s => s.row.id)));
  }, [suggestions]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function apply() {
    const updates = suggestions.filter(s => selected.has(s.row.id)).map(s => ({ id: s.row.id, categoryId: s.suggestedCategoryId }));
    onApply(updates);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Revisar Categorias Sugeridas</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">Selecione quais sugestões deseja aplicar aos seus lançamentos.</p>
        </DialogHeader>
        <div className="space-y-2 overflow-y-auto max-h-[50vh] pr-2">
          {suggestions.map(({row, suggestedCategoryId}) => {
            const isSelected = selected.has(row.id);
            const date = row.transaction_date ?? `${row.year}-${String(row.month).padStart(2, "0")}-01`;
            return (
              <label key={row.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors cursor-pointer ${isSelected ? "border-primary bg-primary/5" : "border-border/50 bg-background"}`}>
                <input type="checkbox" className="h-5 w-5 accent-primary shrink-0" checked={isSelected} onChange={() => toggle(row.id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-sm truncate">{row.descricao}</span>
                    <span className="font-medium text-danger text-sm shrink-0 pl-2">−{brl.format(Number(row.valor))}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs mt-1 text-muted-foreground">
                    <span>{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short", day: "2-digit" }).format(new Date(`${date}T12:00:00Z`))}</span>
                    <span>→</span>
                    <span className="font-bold text-foreground">{categoryNames.get(suggestedCategoryId)}</span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        <DialogFooter className="mt-2 flex sm:justify-between items-center">
          <div className="text-sm text-muted-foreground hidden sm:block">
            {selected.size} de {suggestions.length} selecionados
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={selected.size === 0 || isApplying} onClick={apply}>
              {isApplying ? "Aplicando..." : "Aplicar Categorias"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}