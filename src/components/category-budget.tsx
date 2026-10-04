import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Category = { id: string; name: string; monthly_budget: number | null };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function BudgetRow({ category, spent, onSave }: {
  category: Category; spent: number;
  onSave: (id: string, amount: number | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(category.monthly_budget === null ? "" : String(category.monthly_budget));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { setDraft(category.monthly_budget === null ? "" : String(category.monthly_budget)); }, [category.monthly_budget]);
  const budget = category.monthly_budget;
  const over = budget !== null && spent > budget;
  const percent = budget !== null && budget > 0 ? spent / budget * 100 : spent > 0 && budget === 0 ? 100 : 0;

  async function save() {
    const normalized = draft.trim().replace(",", ".");
    const value = normalized === "" ? null : Number(normalized);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 999999999999)) { setError(true); return; }
    if (value === budget) return;
    setSaving(true);
    setError(false);
    try { await onSave(category.id, value); }
    catch { setError(true); }
    finally { setSaving(false); }
  }

  return <div className="border-b border-border/60 py-4 last:border-b-0">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_minmax(0,10rem)] sm:items-center">
      <div className="min-w-0">
        <div className="font-semibold text-foreground">{category.name}</div>
        <div className={`text-sm ${over ? "text-danger" : "text-muted-foreground"}`}>
          {budget === null ? "Sem orçamento definido" : over ? `${brl.format(spent - budget)} acima do orçamento` : `${brl.format(budget - spent)} disponível`}
        </div>
      </div>
      <label className="text-xs font-medium text-muted-foreground">Orçamento mensal (R$)
        <Input aria-label={`Orçamento mensal de ${category.name}`} type="text" inputMode="decimal" placeholder="Não definido" value={draft}
          onChange={(event) => { setDraft(event.target.value); setError(false); }} onBlur={() => void save()}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} disabled={saving} className="mt-1 min-h-11" />
      </label>
      <div className="sm:text-right"><div className="text-xs text-muted-foreground">Real lançado</div><div className={`font-semibold tabular-nums ${over ? "text-danger" : "text-foreground"}`}>{brl.format(spent)}</div></div>
    </div>
    {error && <p role="alert" className="mt-1 text-xs text-danger">Não foi possível salvar. Confira o valor e tente novamente.</p>}
    {budget !== null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Uso do orçamento de ${category.name}`} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={Math.max(100, Math.round(percent))}>
      <div className={`h-full rounded-full ${over ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>}
  </div>;
}

export function CategoryBudget({ categories, year, month, onPeriodChange, spending, uncategorized, loading, onSave }: {
  categories: Category[]; year: number; month: number; onPeriodChange: (year: number, month: number) => void;
  spending: Record<string, number>; uncategorized: number; loading: boolean;
  onSave: (id: string, amount: number | null) => Promise<void>;
}) {
  const shift = (offset: number) => { const date = new Date(year, month - 1 + offset, 1); onPeriodChange(date.getFullYear(), date.getMonth() + 1); };
  return <section className="mb-6" aria-label="Orçamento por categoria">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-foreground">Orçamento x Real por categoria</h2>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft /></Button>
        <span className="min-w-32 text-center text-sm font-semibold capitalize" aria-live="polite">{monthFormatter.format(new Date(year, month - 1, 1))}</span>
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Próximo mês" onClick={() => shift(1)}><ChevronRight /></Button>
      </div>
    </div>
    <div className="border-t border-border/60">
      {categories.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p> :
        categories.map((category) => <BudgetRow key={category.id} category={category} spent={spending[category.id] ?? 0} onSave={onSave} />)}
    </div>
    {uncategorized > 0 && <p className="mt-3 text-sm text-muted-foreground">{brl.format(uncategorized)} em saídas sem categoria neste mês. Classifique os lançamentos para incluí-los no comparativo.</p>}
    {loading && <p className="py-2 text-sm text-muted-foreground">Atualizando valores...</p>}
  </section>;
}