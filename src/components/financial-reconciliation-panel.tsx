import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FinancialAccount } from "@/lib/financial-accounts";
import { decimalToCents } from "@/lib/financial-reconciliation";
import { getFinancialAccountBalances } from "@/lib/financial-movements.functions";
import { listAccountReconciliations, recordAccountReconciliation } from "@/lib/financial-reconciliation.functions";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function money(value: string | number | null, currency: string) {
  if (value === null) return "Inconclusivo · saldo calculado desconhecido";
  const cents = decimalToCents(value);
  const amount = Number(cents) / 100;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);
}

type BalanceRow = { account_id: string; calculated_balance: string | null };
type ReconciliationRow = {
  id: string; account_id: string; account_name: string; account_type: string; currency_code: string;
  reference_date: string; reported_balance: string; calculated_balance: string | null;
  difference: string | null; status: "reconciled" | "divergent" | "inconclusive"; note: string | null;
};

export function FinancialReconciliationPanel({ accounts, title = "Conciliação de saldos" }: {
  accounts: FinancialAccount[]; title?: string;
}) {
  const queryClient = useQueryClient();
  const fetchBalances = useServerFn(getFinancialAccountBalances);
  const fetchReconciliations = useServerFn(listAccountReconciliations);
  const saveReconciliation = useServerFn(recordAccountReconciliation);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [referenceDate, setReferenceDate] = useState(localDate());
  const [reportedBalance, setReportedBalance] = useState("");
  const [note, setNote] = useState("");
  const account = accounts.find((row) => row.id === accountId) ?? accounts[0];
  const effectiveAccountId = account?.id ?? "";
  const balances = useQuery({
    queryKey: ["financial-account-balances", referenceDate],
    queryFn: () => fetchBalances({ data: { as_of_date: referenceDate } }) as Promise<BalanceRow[]>,
    enabled: Boolean(effectiveAccountId),
  });
  const history = useQuery({
    queryKey: ["account-reconciliations", effectiveAccountId],
    queryFn: () => fetchReconciliations({ data: { account_id: effectiveAccountId } }) as Promise<ReconciliationRow[]>,
    enabled: Boolean(effectiveAccountId),
  });
  const mutation = useMutation({
    mutationFn: () => saveReconciliation({ data: {
      account_id: effectiveAccountId, reference_date: referenceDate,
      reported_balance: reportedBalance.trim().replace(",", "."), note: note.trim() || undefined,
    } }),
    onSuccess: async () => {
      setReportedBalance(""); setNote("");
      await queryClient.invalidateQueries({ queryKey: ["account-reconciliations", effectiveAccountId] });
    },
  });
  const calculated = balances.data?.find((row) => row.account_id === effectiveAccountId)?.calculated_balance ?? null;
  if (accounts.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Informe o saldo observado no extrato. A conciliação é apenas um registro: não altera abertura, movimentações, carteira VA ou orçamento.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {accounts.length > 1 && <div className="max-w-md"><Label htmlFor="reconciliation-account">Conta ou carteira</Label><select id="reconciliation-account" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={account?.id} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.currency_code}</option>)}</select></div>}
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <div><Label htmlFor="reconciliation-date">Data de referência</Label><Input id="reconciliation-date" type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} /></div>
          <div><Label htmlFor="reconciliation-balance">Saldo informado ({account?.currency_code})</Label><Input id="reconciliation-balance" inputMode="decimal" value={reportedBalance} onChange={(event) => setReportedBalance(event.target.value)} placeholder="Ex.: 1250,00" /></div>
          <Button disabled={!reportedBalance || mutation.isPending || !referenceDate} onClick={() => mutation.mutate()}>{mutation.isPending ? "Salvando…" : "Registrar conciliação"}</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Saldo calculado em {referenceDate}</div><div className="mt-1 font-semibold">{balances.isLoading ? "Calculando…" : money(calculated, account?.currency_code ?? "BRL")}</div></div>
          <div><Label htmlFor="reconciliation-note">Observação (opcional)</Label><Input id="reconciliation-note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: saldo consultado no aplicativo do banco" /></div>
        </div>
        {mutation.error && <p role="alert" className="text-sm text-danger">Não foi possível registrar: {mutation.error.message}</p>}
        <div>
          <h4 className="mb-2 text-sm font-semibold">Histórico preservado</h4>
          {history.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : !history.data?.length ? <p className="text-sm text-muted-foreground">Ainda não há conciliações para esta conta.</p> : <ul className="space-y-2">{history.data.slice(0, 8).map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"><span><strong>{row.reference_date.split("-").reverse().join("/")}</strong> · informado {money(row.reported_balance, row.currency_code)} · calculado {row.calculated_balance === null ? "inconclusivo" : money(row.calculated_balance, row.currency_code)}</span><span className={row.status === "reconciled" ? "text-emerald-600" : row.status === "divergent" ? "text-amber-600" : "text-muted-foreground"}>{row.status === "reconciled" ? "Conciliado" : row.status === "divergent" ? `Divergência ${money(row.difference, row.currency_code)}` : "Inconclusivo"}</span></li>)}</ul>}
        </div>
      </CardContent>
    </Card>
  );
}
