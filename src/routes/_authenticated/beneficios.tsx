import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, Wallet } from "lucide-react";
import { FinancialReconciliationPanel } from "@/components/financial-reconciliation-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listFinancialAccounts } from "@/lib/financial-accounts.functions";
import type { FinancialAccount } from "@/lib/financial-accounts";
import { decimalToCents } from "@/lib/financial-movements";
import {
  benefitEventInputSchema,
  benefitPurchaseMatchesBudgetRow,
  type BenefitBudgetRow,
} from "@/lib/benefits";
import {
  getFinancialAccountBalances,
  listFinancialMovementCategories,
} from "@/lib/financial-movements.functions";
import {
  listBenefitWalletEvents,
  listUnlinkedBenefitBudgetRows,
  recordBenefitWalletEvent,
  unlinkBenefitBudgetRow,
} from "@/lib/benefits.functions";

export const Route = createFileRoute("/_authenticated/beneficios")({
  head: () => ({
    meta: [
      { title: "Vale-alimentação — Month Check" },
      { name: "description", content: "Acompanhe créditos e compras feitas com vale-alimentação." },
      { property: "og:title", content: "Vale-alimentação — Month Check" },
      { property: "og:description", content: "Acompanhe créditos e compras feitas com vale-alimentação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BenefitsPage,
});

type EventDraft = {
  account_id: string;
  effective_date: string;
  event_type: "benefit_credit" | "benefit_purchase";
  amount: string;
  description: string;
  category_id: string;
  month_check_row_id: string;
};
type BenefitRow = {
  movement_id: string;
  account_id: string;
  effective_date: string;
  event_type: "benefit_credit" | "benefit_purchase";
  amount: string;
  description: string;
  category_id: string | null;
  category_name: string | null;
  month_check_row_id: string | null;
  budget_description: string | null;
  created_at: string;
};
type BalanceRow = {
  account_id: string;
  currency_code: string;
  opening_balance: string | null;
  opening_balance_date: string | null;
  calculated_balance: string | null;
  recorded_net_activity: string;
  is_active: boolean;
};

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDate(date);
}
function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
function formatMoney(value: string, currency: string) {
  const cents = decimalToCents(value);
  if (cents === null) return `${value} ${currency}`;
  const sign = cents < 0n ? "−" : "";
  const absolute = cents < 0n ? -cents : cents;
  const whole = (absolute / 100n).toLocaleString("pt-BR");
  const fraction = String(absolute % 100n).padStart(2, "0");
  try {
    const parts = new Intl.NumberFormat("pt-BR", { style: "currency", currency }).formatToParts(0);
    const integerIndex = parts.findIndex((part) => part.type === "integer");
    const fractionIndex = parts.findIndex((part) => part.type === "fraction");
    const prefix = parts
      .slice(0, integerIndex)
      .map((part) => part.value)
      .join("");
    const decimal = parts.find((part) => part.type === "decimal")?.value ?? ",";
    const suffix = parts
      .slice(fractionIndex + 1)
      .map((part) => part.value)
      .join("");
    return `${sign}${prefix}${whole}${decimal}${fraction}${suffix}`;
  } catch {
    return `${sign}${whole},${fraction} ${currency}`;
  }
}
function sumAmounts(rows: BenefitRow[], eventType: BenefitRow["event_type"]) {
  return rows
    .reduce((sum, row) => {
      const cents = decimalToCents(row.amount);
      return row.event_type === eventType && cents !== null ? sum + cents : sum;
    }, 0n)
    .toString();
}
function initialDraft(accountId: string, eventType: EventDraft["event_type"]): EventDraft {
  return {
    account_id: accountId,
    effective_date: localDate(),
    event_type: eventType,
    amount: "",
    description: "",
    category_id: "",
    month_check_row_id: "",
  };
}

function BenefitsPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listFinancialAccounts);
  const fetchBalances = useServerFn(getFinancialAccountBalances);
  const fetchCategories = useServerFn(listFinancialMovementCategories);
  const fetchEvents = useServerFn(listBenefitWalletEvents);
  const fetchBudgetRows = useServerFn(listUnlinkedBenefitBudgetRows);
  const saveEvent = useServerFn(recordBenefitWalletEvent);
  const unlinkBudgetRow = useServerFn(unlinkBenefitBudgetRow);
  const [selectedId, setSelectedId] = useState("");
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(localDate());
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const requestKey = useRef(crypto.randomUUID());

  const accountsQuery = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: () => fetchAccounts() as Promise<FinancialAccount[]>,
  });
  const wallets = (accountsQuery.data ?? []).filter(
    (account) => account.account_type === "benefit_wallet",
  );
  const accountId = wallets.some((account) => account.id === selectedId)
    ? selectedId
    : (wallets[0]?.id ?? "");
  const balancesQuery = useQuery({
    queryKey: ["financial-account-balances", localDate()],
    queryFn: () => fetchBalances({ data: { as_of_date: localDate() } }) as Promise<BalanceRow[]>,
  });
  const categoriesQuery = useQuery({
    queryKey: ["financial-movement-categories"],
    queryFn: () => fetchCategories() as Promise<{ id: string; name: string }[]>,
  });
  const eventsQuery = useQuery({
    queryKey: ["benefit-wallet-events", accountId, fromDate, toDate],
    queryFn: () =>
      fetchEvents({
        data: { account_id: accountId || null, from_date: fromDate, to_date: toDate },
      }) as Promise<BenefitRow[]>,
    enabled: Boolean(accountId) && fromDate <= toDate,
  });
  const budgetRowsQuery = useQuery({
    queryKey: ["unlinked-benefit-budget-rows"],
    queryFn: () => fetchBudgetRows() as Promise<BenefitBudgetRow[]>,
  });
  const eventMutation = useMutation({
    mutationFn: (input: EventDraft) => {
      const parsed = benefitEventInputSchema.parse({
        ...input,
        category_id: input.event_type === "benefit_purchase" ? input.category_id || null : null,
        month_check_row_id:
          input.event_type === "benefit_purchase" ? input.month_check_row_id || null : null,
        idempotency_key: requestKey.current,
      });
      return saveEvent({ data: parsed });
    },
    onSuccess: async () => {
      requestKey.current = crypto.randomUUID();
      setDraft(null);
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["financial-account-balances"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["benefit-wallet-events"] }),
        queryClient.invalidateQueries({ queryKey: ["unlinked-benefit-budget-rows"] }),
      ]);
    },
    onError: (error) =>
      setFormError(error instanceof Error ? error.message : "Não foi possível registrar o evento."),
  });
  const unlinkMutation = useMutation({
    mutationFn: (movementId: string) => unlinkBudgetRow({ data: { movement_id: movementId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["benefit-wallet-events"] }),
        queryClient.invalidateQueries({ queryKey: ["unlinked-benefit-budget-rows"] }),
      ]);
    },
  });

  const wallet = wallets.find((item) => item.id === accountId);
  const balance = balancesQuery.data?.find((item) => item.account_id === accountId);
  const events = eventsQuery.data ?? [];
  const creditTotal = sumAmounts(events, "benefit_credit");
  const purchaseTotal = sumAmounts(events, "benefit_purchase");
  const matchingBudgetRows = useMemo(() => {
    if (!draft || draft.event_type !== "benefit_purchase" || !wallet) return [];
    return (budgetRowsQuery.data ?? []).filter((row) =>
      benefitPurchaseMatchesBudgetRow(
        { effective_date: draft.effective_date, amount: draft.amount },
        row,
        wallet.currency_code,
      ),
    );
  }, [budgetRowsQuery.data, draft, wallet]);

  function startEvent(eventType: EventDraft["event_type"]) {
    if (!accountId) return;
    requestKey.current = crypto.randomUUID();
    setFormError(null);
    setDraft(initialDraft(accountId, eventType));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (
      draft.event_type === "benefit_purchase" &&
      draft.month_check_row_id &&
      !matchingBudgetRows.some((row) => row.id === draft.month_check_row_id)
    ) {
      setFormError(
        "A associação exige uma despesa do orçamento com a mesma data e o mesmo valor total.",
      );
      return;
    }
    eventMutation.mutate(draft);
  }

  return (
    <div className="min-h-screen bg-background pb-8 text-foreground">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Vale-alimentação</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Créditos e compras do benefício ficam separados do dinheiro bancário e do orçamento
              pessoal.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/contas">
                <Wallet className="mr-2 h-4 w-4" />
                Configurar carteira
              </Link>
            </Button>
            <Button disabled={!wallet?.is_active} onClick={() => startEvent("benefit_credit")}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar crédito
            </Button>
            <Button
              variant="outline"
              disabled={!wallet?.is_active}
              onClick={() => startEvent("benefit_purchase")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Registrar compra
            </Button>
          </div>
        </div>
        {accountsQuery.error && (
          <p className="text-sm text-danger" role="alert">
            {accountsQuery.error.message}
          </p>
        )}
        {accountsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando carteiras…</p>
        ) : wallets.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nenhuma carteira de benefício</CardTitle>
              <CardDescription>
                Cadastre uma carteira do tipo “Carteira de benefício (VA)” em Contas. Informe o
                saldo inicial e sua data apenas se você souber esse valor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/contas">Abrir Contas</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56">
                <Label htmlFor="benefit-wallet">Carteira</Label>
                <select
                  id="benefit-wallet"
                  value={accountId}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {wallets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.currency_code}
                      {item.is_active ? "" : " · inativa"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="benefit-from">De</Label>
                <Input
                  id="benefit-from"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="benefit-to">Até</Label>
                <Input
                  id="benefit-to"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </div>
            </div>
            {wallet && (
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Saldo inicial informado</CardDescription>
                    <CardTitle className="text-xl">
                      {balance?.opening_balance === null || !balance
                        ? "Desconhecido"
                        : formatMoney(balance.opening_balance, wallet.currency_code)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {balance?.opening_balance_date
                      ? `Referência: ${formatDate(balance.opening_balance_date)}`
                      : "Nenhuma abertura foi informada."}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Saldo calculado</CardDescription>
                    <CardTitle className="text-xl">
                      {balance?.calculated_balance === null || !balance
                        ? "Desconhecido"
                        : formatMoney(balance.calculated_balance, wallet.currency_code)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {balance?.calculated_balance === null || !balance
                      ? `Movimentação líquida registrada: ${formatMoney(balance?.recorded_net_activity ?? "0.00", wallet.currency_code)}`
                      : "A partir do saldo inicial e dos registros posteriores."}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>No período selecionado</CardDescription>
                    <CardTitle className="text-base">
                      Créditos {formatMoney(creditTotal, wallet.currency_code)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Compras com VA: {formatMoney(purchaseTotal, wallet.currency_code)}
                  </CardContent>
                </Card>
              </div>
            )}
            {balancesQuery.error && (
              <p className="text-sm text-danger" role="alert">
                {balancesQuery.error.message}
              </p>
            )}
            {!wallet?.is_active && (
              <p className="rounded-md border border-border bg-muted p-3 text-sm">
                Esta carteira está inativa. O histórico permanece disponível; novos créditos e
                compras estão bloqueados.
              </p>
            )}
            {eventsQuery.error && (
              <p className="text-sm text-danger" role="alert">
                {eventsQuery.error.message}
              </p>
            )}
            {unlinkMutation.error && (
              <p className="text-sm text-danger" role="alert">
                {unlinkMutation.error instanceof Error
                  ? unlinkMutation.error.message
                  : "Não foi possível remover a associação."}
              </p>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Histórico</CardTitle>
                <CardDescription>
                  Créditos efetivamente recebidos e compras registradas na carteira. A associação
                  com o orçamento é opcional e explícita.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {eventsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando histórico…</p>
                ) : events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma movimentação neste período.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-2 pr-3">Data</th>
                          <th className="py-2 pr-3">Tipo</th>
                          <th className="py-2 pr-3">Descrição</th>
                          <th className="py-2 pr-3">Orçamento</th>
                          <th className="py-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((item) => (
                          <tr key={item.movement_id} className="border-b border-border/70">
                            <td className="py-3 pr-3">{formatDate(item.effective_date)}</td>
                            <td className="py-3 pr-3">
                              {item.event_type === "benefit_credit"
                                ? "Crédito do benefício"
                                : "Compra com VA"}
                            </td>
                            <td className="py-3 pr-3">
                              {item.description}
                              {item.category_name ? (
                                <span className="block text-xs text-muted-foreground">
                                  {item.category_name}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-3 pr-3">
                              {item.event_type === "benefit_credit" ? (
                                "—"
                              ) : item.budget_description ? (
                                <div>
                                  Vinculada: {item.budget_description}
                                  <Button
                                    className="mt-1 block h-auto px-0 py-1 text-xs"
                                    variant="link"
                                    disabled={unlinkMutation.isPending}
                                    onClick={() => unlinkMutation.mutate(item.movement_id)}
                                  >
                                    Desvincular
                                  </Button>
                                </div>
                              ) : (
                                "Sem vínculo"
                              )}
                            </td>
                            <td className="py-3 text-right tabular-nums">
                              {formatMoney(item.amount, wallet?.currency_code ?? "BRL")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
        <FinancialReconciliationPanel
          title="Conciliação do vale-alimentação"
          accounts={wallets.filter((item) => item.is_active)}
        />
      </main>
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.event_type === "benefit_credit"
                ? "Registrar crédito do benefício"
                : "Registrar compra com VA"}
            </DialogTitle>
            <DialogDescription>
              {draft?.event_type === "benefit_credit"
                ? "Registre somente créditos efetivamente recebidos. Eles aumentam o saldo do VA, não a renda do orçamento."
                : "A compra reduz o saldo de VA. Não cria uma despesa de orçamento; associe uma despesa já existente quando houver correspondência exata."}
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="benefit-date">Data efetiva</Label>
                <Input
                  id="benefit-date"
                  type="date"
                  required
                  value={draft.effective_date}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      effective_date: event.target.value,
                      month_check_row_id: "",
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="benefit-amount">Valor</Label>
                <Input
                  id="benefit-amount"
                  inputMode="decimal"
                  required
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft({ ...draft, amount: event.target.value, month_check_row_id: "" })
                  }
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label htmlFor="benefit-description">Descrição</Label>
                <Input
                  id="benefit-description"
                  required
                  maxLength={160}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder={
                    draft.event_type === "benefit_credit" ? "Crédito recebido" : "Compra no mercado"
                  }
                />
              </div>
              {draft.event_type === "benefit_purchase" && (
                <>
                  <div>
                    <Label htmlFor="benefit-category">Categoria (opcional)</Label>
                    <select
                      id="benefit-category"
                      value={draft.category_id}
                      onChange={(event) => setDraft({ ...draft, category_id: event.target.value })}
                      className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Sem categoria</option>
                      {(categoriesQuery.data ?? []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="benefit-budget-row">
                      Despesa existente no orçamento (opcional)
                    </Label>
                    <select
                      id="benefit-budget-row"
                      value={draft.month_check_row_id}
                      onChange={(event) =>
                        setDraft({ ...draft, month_check_row_id: event.target.value })
                      }
                      className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Não associar</option>
                      {matchingBudgetRows.map((row) => (
                        <option key={row.id} value={row.id}>
                          {formatDate(row.transaction_date)} · {row.descricao} ·{" "}
                          {formatMoney(row.valor, wallet?.currency_code ?? "BRL")}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Somente despesas sem vínculo, na mesma data e com o mesmo valor em BRL
                      aparecem aqui. A associação não altera nem duplica o lançamento.
                    </p>
                  </div>
                </>
              )}
              {formError && (
                <p className="text-sm text-danger" role="alert">
                  {formError}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={eventMutation.isPending || !wallet?.is_active}>
                  {eventMutation.isPending ? "Salvando…" : "Registrar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
