import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FileText, Upload, LogOut, X, Check, AlertTriangle } from "lucide-react";
import { Logo } from "@/components/logo";
import { PageTabs } from "@/components/page-tabs";
import { MobileNav } from "@/components/mobile-nav";
import { InstallPWAButton } from "@/components/install-pwa-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { InvoiceReview, reviewRows, type ReviewRow } from "@/components/invoice-review";
import { supabase } from "@/integrations/supabase/client";
import { importInvoice } from "@/lib/invoice.functions";
import { MAX_INVOICE_SIZE, invoiceSchema, invoiceTotals, parseMoney, importSchema, type InvoicePreview, type ImportInput, type ImportResult } from "@/lib/invoice";

export const Route = createFileRoute("/_authenticated/analisar-fatura")({
  head: () => ({ meta: [{ title: "Analisar fatura — Month Check" }, { name: "description", content: "Analise sua fatura com IA e revise os lançamentos antes de importar." }, { property: "og:title", content: "Analisar fatura — Month Check" }, { property: "og:description", content: "Envie uma fatura, confira os valores e confirme a importação dos lançamentos." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: InvoicePage,
});
import { ownPortion, responsibilityTotals } from "@/lib/personal-finance";

const money = (value: number | null) => value === null ? "Não identificado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
function InvoicePage() {
  const navigate = useNavigate(); const cache = useQueryClient(); const importFn = useServerFn(importInvoice);
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [preview, setPreview] = useState<InvoicePreview | null>(null); const [rows, setRows] = useState<ReviewRow[]>([]);
  const [currency, setCurrency] = useState(""); const [ack, setAck] = useState(false); const [duplicatesAck, setDuplicatesAck] = useState(false);
  const [confirmation, setConfirmation] = useState<{ payload: ImportInput; result: ImportResult } | null>(null);
  const [saving, setSaving] = useState(false); const [checking, setChecking] = useState(false); const [success, setSuccess] = useState<ImportResult | null>(null);
  const abort = useRef<AbortController | null>(null); const upload = useRef<HTMLInputElement | null>(null); const importLock = useRef(false);
  useEffect(() => () => abort.current?.abort(), []);
  const updateRows = (next: ReviewRow[]) => { setRows(next); setAck(false); setConfirmation(null); setDuplicatesAck(false); };
  const parsedRows = rows.map(r => ({ value: parseMoney(r.value), type: r.type || null }));
  const totals = invoiceTotals(parsedRows, preview?.invoice.total ?? null);
  const selectedTotal = invoiceTotals(parsedRows.filter((_, i) => rows[i]?.selected), null).identified;
  const selectedCount = rows.filter(r => r.selected).length;
  const classifiedRows = rows.map(r => ({ value: parseMoney(r.value), type: r.type || null, responsibility: r.responsibility, personalValue: ownPortion(parseMoney(r.value), r.responsibility, parseMoney(r.ownValue)) }));
  const classified = responsibilityTotals(classifiedRows);
  const selectedPersonal = responsibilityTotals(classifiedRows.filter((_, i) => rows[i]?.selected));
  function selectFile(next: File | undefined) {
    if (!next) return;
    setError("");
    if (!/\.(pdf|jpe?g|png)$/i.test(next.name) || !["application/pdf", "image/jpeg", "image/png"].includes(next.type)) { setError("Arquivo inválido. Envie somente PDF, JPG, JPEG ou PNG."); return; }
    if (!next.size || next.size > MAX_INVOICE_SIZE) { setError(next.size ? "Arquivo muito grande. O limite é 20 MB." : "O arquivo está vazio."); return; }
    setFile(next); setPreview(null); setSuccess(null); setConfirmation(null); setRows([]); setAck(false);
  }
  async function analyze() {
    if (!file || busy) return;
    const control = new AbortController(); abort.current = control; setBusy(true); setError(""); setPreview(null); setConfirmation(null);
    try {
      const session = await supabase.auth.getSession(); if (!session.data.session) throw new Error("Entre na sua conta novamente.");
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/analisar-fatura", { method: "POST", headers: { Authorization: `Bearer ${session.data.session.access_token}` }, body: form, signal: control.signal });
      if (!response.ok) { const body = await response.json(); throw new Error(body.message || "Erro de comunicação com a IA."); }
      if (!response.body) throw new Error("Não foi possível receber a análise.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let received = false;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "result") {
            const data = event.data as InvoicePreview; data.invoice = invoiceSchema.parse(data.invoice);
            if (control.signal.aborted) return;
            setPreview(data); setRows(reviewRows(data.invoice)); setCurrency(data.invoice.currency ?? ""); setAck(false); setDuplicatesAck(false); received = true;
          }
        }
      }
      if (!received) throw new Error("A análise foi interrompida antes de retornar os lançamentos.");
    } catch (e) { if (!control.signal.aborted) setError(e instanceof Error ? e.message : "Erro de processamento da fatura."); }
    finally { setBusy(false); abort.current = null; }
  }
  async function prepareImport() {
    if (!preview || checking || saving) return;
    setError("");
    if (currency.trim().toUpperCase() !== "BRL") { setError("Nesta versão, importe somente faturas em BRL, sem conversão de moeda."); return; }
    if (!totals.matches && !ack) { setError("Reconheça o aviso de conferência antes de importar."); return; }
    const candidate = { source: preview.source, card: preview.invoice.card, rows: rows.filter(r => r.selected).map(r => ({ line: r.line, date: r.date, description: r.description, value: parseMoney(r.value), type: r.type, categoryId: r.categoryId || null, responsibility: r.responsibility, personalValue: ownPortion(parseMoney(r.value), r.responsibility, parseMoney(r.ownValue)), current: r.current ? Number(r.current) : null, total: r.total ? Number(r.total) : null })), confirmed: false, acknowledgeDuplicates: false };
    const parsed = importSchema.safeParse(candidate);
    if (!parsed.success) { setError("Revise os lançamentos selecionados: data válida, descrição, valor, tipo, parcelas (atual ≤ total), classificação e minha parte (zero até o integral). Selecione ao menos uma linha."); return; }
    setChecking(true);
    try { const result = await importFn({ data: parsed.data }); setConfirmation({ payload: parsed.data, result }); setDuplicatesAck(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível verificar duplicidades."); }
    finally { setChecking(false); }
  }
  async function confirmImport() {
    if (!confirmation || importLock.current) return;
    importLock.current = true; setSaving(true); setError("");
    try {
      const result = await importFn({ data: { ...confirmation.payload, confirmed: true, acknowledgeDuplicates: duplicatesAck || confirmation.result.duplicates.every(d => d.exact) } });
      if (result.needsReview) { setConfirmation({ ...confirmation, result }); setDuplicatesAck(false); return; }
      setSuccess(result); setConfirmation(null); setPreview(null); setFile(null); setRows([]);
      for (const key of ["transactions", "monthly-category-spending", "month-rows", "year-totals", "future-projection", "shared-metrics"]) void cache.invalidateQueries({ queryKey: [key] });
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível importar. Sua revisão foi preservada."); }
    finally { importLock.current = false; setSaving(false); }
  }
  const needsDuplicateAck = confirmation?.result.duplicates.some(d => !d.exact) ?? false;
  return <div className="finance-app min-h-screen px-4 pb-24 pt-4 sm:px-8 sm:py-6 lg:pb-8"><div className="mx-auto max-w-6xl">
    <header className="mb-6 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Logo height={40} /><div><h1 className="finance-app-title text-xl sm:text-3xl">Month Check</h1><p className="text-sm text-muted-foreground">Conferência financeira pessoal</p></div></div><div className="flex items-center gap-2"><InstallPWAButton /><Button variant="ghost" size="icon" aria-label="Sair" onClick={async () => { await supabase.auth.signOut(); await navigate({ to: "/auth" }); }}><LogOut className="h-4 w-4" /></Button></div></header>
    <PageTabs /><main className="space-y-7 py-6"><div><h2 className="finance-app-title text-2xl sm:text-3xl">Analisar fatura</h2><p className="mt-2 text-sm text-muted-foreground">Envie sua fatura e deixe a IA identificar os lançamentos para você.</p></div>
    {error && <div role="alert" className="flex items-start gap-2 border-l-2 border-danger py-2 pl-3 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{error}</span></div>}
    {success && <section role="status" className="space-y-3 border-y border-border py-6"><h3 className="flex items-center gap-2 font-semibold text-primary"><Check className="h-5 w-5" />Importação concluída</h3><p className="text-sm">{success.imported} lançamentos importados · {success.skipped} duplicados ignorados.</p><Button asChild variant="outline"><Link to="/lancamentos">Ver lançamentos</Link></Button></section>}
    {!preview && <section className="space-y-4"><div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) selectFile(e.dataTransfer.files[0]); }} className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-card px-5 py-8 text-center"><Upload className="h-7 w-7 text-muted-foreground" /><div><h3 className="font-medium">Arraste sua fatura aqui</h3><p className="mt-1 text-xs text-muted-foreground">PDF, JPG, JPEG ou PNG · Até 20 MB</p></div><input ref={upload} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" aria-label="Selecionar fatura" onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ""; }} /><Button variant="outline" disabled={busy} onClick={() => upload.current?.click()}>Selecionar arquivo</Button></div>
      {file && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"><div className="flex min-w-0 items-center gap-3"><FileText className="h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="break-all text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div></div><Button variant="ghost" size="icon" disabled={busy} aria-label="Remover arquivo" onClick={() => setFile(null)}><X className="h-4 w-4" /></Button></div>}
      <div className="flex flex-wrap items-center gap-3"><Button disabled={!file || busy} onClick={analyze}>{busy ? "Analisando fatura…" : "Analisar fatura"}</Button>{busy && <Button variant="outline" onClick={() => { abort.current?.abort(); setError("Análise cancelada. Nenhum lançamento foi criado."); }}>Cancelar análise</Button>}</div><p className="text-xs text-muted-foreground">A análise usa créditos de IA do workspace. Nenhum lançamento é criado antes da sua confirmação.</p></section>}
    {preview && <><section className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-semibold">Fatura analisada</h3><p className="mt-1 text-sm text-muted-foreground">{preview.invoice.issuer ?? "Emissor não identificado"}{preview.invoice.card ? ` · ${preview.invoice.card}` : ""}</p></div><Button variant="outline" disabled={saving || checking} onClick={() => { setPreview(null); setRows([]); setConfirmation(null); }}>Selecionar outra fatura</Button></div><div className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 sm:grid-cols-3 lg:grid-cols-5">{[["Total da fatura", money(preview.invoice.total)], ["Total identificado pela IA", money(invoiceTotals(preview.invoice.transactions, preview.invoice.total).identified)], ["Quantidade de lançamentos", String(preview.invoice.transactions.length)], ["Período", preview.invoice.period ?? "Não identificado"], ["Vencimento", preview.invoice.dueDate ?? "Não identificado"]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>)}</div>{preview.invoice.warnings.map((w,i) => <p key={i} className="text-sm text-muted-foreground">{w}</p>)}</section>
      <section className="space-y-3"><h3 className="font-semibold">Conferência</h3><dl className="grid grid-cols-2 gap-4 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Total da fatura</dt><dd className="mt-1 font-medium">{money(preview.invoice.total)}</dd></div><div><dt className="text-xs text-muted-foreground">Total identificado (revisado)</dt><dd className="mt-1 font-medium">{totals.known ? money(totals.identified) : "Valores pendentes"}</dd></div><div><dt className="text-xs text-muted-foreground">Diferença</dt><dd className="mt-1 font-medium">{money(totals.difference)}</dd></div></dl><p className={`text-sm ${totals.matches ? "text-primary" : "text-danger"}`}>{totals.matches ? "✓ Os valores conferem" : preview.invoice.total === null || !totals.known ? "⚠ Não foi possível conferir os valores: há dados não identificados." : "⚠ A soma dos lançamentos não corresponde ao total da fatura."}</p><p className="text-xs text-muted-foreground">Tolerância: R$ 0,01. Créditos e estornos reduzem o total. A confiança da IA não é garantia de precisão.</p>{!totals.matches && <label className="flex items-start gap-2 text-sm"><Checkbox checked={ack} onCheckedChange={v => setAck(v === true)} /><span>Estou ciente da diferença ou dos dados ausentes e revisei os lançamentos.</span></label>}
      <label className="block max-w-52 text-xs text-muted-foreground">Moeda da fatura<Input aria-label="Moeda da fatura" value={currency} maxLength={3} disabled={preview.invoice.currency !== null} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="Não identificada" /></label></section>
      <section aria-label="Composição da fatura" className="space-y-3 border-y border-border py-5"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{[["Despesas pessoais efetivas", classified.personal], ["Correspondente à Bia", classified.bia], ["Reembolsável", classified.reimbursable]].map(([label, amount]) => <div key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{classified.known ? money(Number(amount)) : "Valores pendentes"}</p></div>)}</div><p className="text-xs text-muted-foreground">Esta é apenas a composição da fatura. Os valores atribuídos à Bia ou reembolsáveis não são tratados como dívida, cobrança ou receita.</p></section>
      <InvoiceReview rows={rows} categories={preview.categories} onChange={updateRows} disabled={checking || saving} />
      <footer className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-medium">{selectedCount} selecionados · {money(selectedTotal)} integrais · Pessoal: {selectedPersonal.known ? money(selectedPersonal.personal) : "Pendente"}</p><p className="mt-1 text-xs text-muted-foreground">Não quitados · Apenas parcelas cobradas · Sem criar parcelas futuras</p></div><Button disabled={!selectedCount || checking || saving || !selectedPersonal.known || currency !== "BRL" || (!totals.matches && !ack)} onClick={prepareImport}>{checking ? "Verificando duplicidades…" : "Importar lançamentos"}</Button></footer></>}
    </main></div><MobileNav />
    <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !saving) setConfirmation(null); }}><DialogContent onEscapeKeyDown={e => { if (saving) e.preventDefault(); }} onPointerDownOutside={e => { if (saving) e.preventDefault(); }}><DialogHeader><DialogTitle>Confirmar importação</DialogTitle><DialogDescription>Você está prestes a importar {confirmation?.result.count ?? 0} lançamentos.</DialogDescription></DialogHeader><div className="space-y-4"><p className="text-sm">Os lançamentos serão adicionados ao seu Month Check.</p><p className="text-sm">Impacto pessoal selecionado: {money(selectedPersonal.personal)}. Valores integrais preservados.</p>{confirmation?.result.duplicates.length ? <div className="space-y-3"><h4 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" />Possíveis duplicidades</h4><div className="max-h-56 space-y-3 overflow-y-auto">{confirmation.result.duplicates.map((d,i) => <div className="border-b border-border pb-2 text-xs" key={i}><p className="font-medium">{d.description} · {d.date} · {money(Number(d.value))}</p><p className="mt-1 text-muted-foreground">{d.reason} {d.exact ? "Não será importado novamente." : "Compare antes de confirmar."}</p></div>)}</div>{needsDuplicateAck && <label className="flex items-start gap-2 text-sm"><Checkbox checked={duplicatesAck} onCheckedChange={v => setDuplicatesAck(v === true)} /><span>Revisei as possíveis duplicidades e desejo importar as linhas não bloqueadas.</span></label>}</div> : null}{error && <p role="alert" className="text-sm text-danger">{error}</p>}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setConfirmation(null)}>Cancelar</Button><Button disabled={saving || !confirmation?.result.count || (needsDuplicateAck && !duplicatesAck)} onClick={confirmImport}>{saving ? "Importando…" : "Confirmar importação"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
