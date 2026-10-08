import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import type { Invoice } from "@/lib/invoice";

export type ReviewRow = { line: number; selected: boolean; date: string; description: string; value: string; type: "entrada" | "saida" | ""; categoryId: string; current: string; total: string; confidence: "alta" | "media" | "baixa" };
export function reviewRows(invoice: Invoice): ReviewRow[] {
  return invoice.transactions.map((t, line) => ({ line, selected: true, date: t.date ?? "", description: t.description ?? "", value: t.value === null ? "" : t.value.toFixed(2).replace(".", ","), type: t.type ?? "", categoryId: t.categoryId ?? "", current: t.current === null ? "" : String(t.current), total: t.total === null ? "" : String(t.total), confidence: t.confidence }));
}
export function InvoiceReview({ rows, categories, onChange, disabled }: { rows: ReviewRow[]; categories: { id: string; name: string }[]; onChange: (rows: ReviewRow[]) => void; disabled: boolean }) {
  const update = (line: number, changes: Partial<ReviewRow>) => onChange(rows.map(r => r.line === line ? { ...r, ...changes } : r));
  return <section aria-label="Revisão dos lançamentos" className="border-y border-border">
    <div className="hidden grid-cols-[44px_140px_minmax(150px,1fr)_120px_170px_108px_80px_44px] gap-2 border-b border-border py-3 text-xs font-medium text-muted-foreground xl:grid"><span>Selecionar</span><span>Data</span><span>Descrição / Tipo</span><span>Valor (R$)</span><span>Categoria</span><span>Parcela</span><span>Confiança</span><span /></div>
    {rows.map((r, index) => <fieldset disabled={disabled} key={r.line} className="grid grid-cols-2 items-start gap-3 border-b border-border py-4 last:border-b-0 xl:grid-cols-[44px_140px_minmax(150px,1fr)_120px_170px_108px_80px_44px] xl:gap-2">
      <div className="col-span-2 flex min-h-11 items-center gap-2 xl:col-span-1"><Checkbox id={`row-${r.line}`} checked={r.selected} onCheckedChange={v => update(r.line, { selected: v === true })} aria-label={`Selecionar lançamento ${index + 1}`} /><label htmlFor={`row-${r.line}`} className="text-sm xl:sr-only">Lançamento {index + 1}</label></div>
      <label className="min-w-0"><span className="text-xs text-muted-foreground xl:sr-only">Data</span><Input aria-label={`Data ${index + 1}`} type="date" value={r.date} onChange={e => update(r.line, { date: e.target.value })} /></label>
      <div className="col-span-2 min-w-0 xl:col-span-1"><label><span className="text-xs text-muted-foreground xl:sr-only">Descrição</span><Input maxLength={160} aria-label={`Descrição ${index + 1}`} value={r.description} onChange={e => update(r.line, { description: e.target.value })} /></label><Select value={r.type || "unknown"} onValueChange={v => update(r.line, { type: v === "unknown" ? "" : v as "entrada" | "saida" })}><SelectTrigger aria-label={`Tipo ${index + 1}`} className="mt-1 min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Tipo não identificado</SelectItem><SelectItem value="saida">Saída · compra/encargo</SelectItem><SelectItem value="entrada">Entrada · crédito/estorno</SelectItem></SelectContent></Select></div>
      <label className="min-w-0"><span className="text-xs text-muted-foreground xl:sr-only">Valor (R$)</span><Input aria-label={`Valor ${index + 1}`} inputMode="decimal" value={r.value} onChange={e => update(r.line, { value: e.target.value })} /></label>
      <div className="min-w-0"><span className="text-xs text-muted-foreground xl:sr-only">Categoria</span><Select value={r.categoryId || "none"} onValueChange={v => update(r.line, { categoryId: v === "none" ? "" : v })}><SelectTrigger aria-label={`Categoria ${index + 1}`} className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem categoria</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="min-w-0"><span className="text-xs text-muted-foreground xl:sr-only">Parcela atual / total</span><div className="flex items-center gap-1"><Input aria-label={`Parcela atual ${index + 1}`} inputMode="numeric" value={r.current} onChange={e => update(r.line, { current: e.target.value })} /><span>/</span><Input aria-label={`Total de parcelas ${index + 1}`} inputMode="numeric" value={r.total} onChange={e => update(r.line, { total: e.target.value })} /></div></div>
      <div className="flex min-h-11 items-center text-sm text-muted-foreground"><span className="xl:hidden">Confiança: </span>{({ alta: "Alta", media: "Média", baixa: "Baixa" })[r.confidence]}</div>
      <Button variant="ghost" size="icon" aria-label={`Remover lançamento ${index + 1}`} onClick={() => onChange(rows.filter(row => row.line !== r.line))}><Trash2 className="h-4 w-4" /></Button>
    </fieldset>)}
  </section>;
}