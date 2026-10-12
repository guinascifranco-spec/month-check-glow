import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Landmark,
  Plus,
  Wallet,
} from "lucide-react";
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
import type { FinancialAccount } from "@/lib/financial-accounts";
import {
  movementInputSchema,
  transferAccountCompatibility,
  transferInputSchema,
  type MovementInput,
} from "@/lib/financial-movements";
import {
  cancelFinancialTransfer,
  createFinancialMovement,
  createFinancialTransfer,
  deleteFinancialMovement,
  getFinancialAccountBalances,
  listFinancialMovementCategories,
  listFinancialMovements,
  listFinancialTransferCancellations,
  updateFinancialMovement,
} from "@/lib/financial-movements.functions";
import { listFinancialAccounts } from "@/lib/financial-accounts.functions";

export const Route = createFileRoute("/_authenticated/movimentacoes")({
  head: () => ({
    meta: [
      { title: "Movimentações — Month Check" },
      {
        name: "description",
        content: "Registre entradas, saídas e transferências das suas contas.",
      },
      { property: "og:title", content: "Movimentações — Month Check" },
      { property: "og:description", content: "Registre entradas, saídas e transferências das suas contas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MovementsPage,
});

type BalanceRow = {
  account_id: string;
  currency_code: string;
  is_active: boolean;
  opening_balance: string | null;
  opening_balance_date: string | null;
  recorded_net_activity: string;
  calculated_balance: string | null;
};

type MovementRow = {
  id: string;
  account_id: string;
  account_name: string;
  related_account_name: string | null;
  effective_date: string;
  movement_type: "income" | "expense" | "transfer_in" | "transfer_out";
  amount: string;
  description: string;
  category_id: string | null;
  category_name: string | null;
  transfer_id: string | null;
  transfer_status: "completed" | "cancelled" | null;
  created_at: string;
};

type Category = { id: string; name: string };
type MovementDraft = Omit<MovementInput, "id">;

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
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return `${value} ${currency}`;
  const negative = match[1] === "-";
  const whole = BigInt(match[2]!).toLocaleString("pt-BR");
  const fraction = (match[3] ?? "").padEnd(2, "0").slice(0, 2);
  try {
    const parts = new Intl.NumberFormat("pt-BR", { style: "currency", currency }).formatToParts(0);
    const integerIndex = parts.findIndex((part) => part.type === "integer");
    const fractionIndex = parts.findIndex((part) => part.type === "fraction");
    const prefix = parts
      .slice(0, integerIndex)
      .filter((part) => part.type !== "minusSign")
      .map((part) => part.value)
      .join("");
    const suffix = parts
      .slice(fractionIndex + 1)
      .map((part) => part.value)
      .join("");
    const decimal = parts.find((part) => part.type === "decimal")?.value ?? ",";
    return `${negative ? "−" : ""}${prefix}${whole}${decimal}${fraction}${suffix}`;
  } catch {
    return `${negative ? "−" : ""}${whole},${fraction} ${currency}`;
  }
}

const movementLabels = {
  income: "Entrada",
  expense: "Saída",
  transfer_in: "Transferência recebida",
  transfer_out: "Transferência enviada",
} as const;

function MovementsPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listFinancialAccounts);
  const fetchBalances = useServerFn(getFinancialAccountBalances);
  const fetchCategories = useServerFn(listFinancialMovementCategories);
  const fetchMovements = useServerFn(listFinancialMovements);
  const fetchTransferCancellations = useServerFn(listFinancialTransferCancellations);
  const addMovement = useServerFn(createFinancialMovement);
  const editMovement = useServerFn(updateFinancialMovement);
  const removeMovement = useServerFn(deleteFinancialMovement);
  const addTransfer = useServerFn(createFinancialTransfer);
  const cancelTransfer = useServerFn(cancelFinancialTransfer);

  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(localDate());
  const [accountFilter, setAccountFilter] = useState("all");
  const [dialogType, setDialogType] = useState<"income" | "expense" | "transfer" | null>(null);
  const [editing, setEditing] = useState<MovementRow | null>(null);

  const {
    data: accounts = [],
    isLoading: accountsLoading,
    error: accountsError,
  } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: () => fetchAccounts() as Promise<FinancialAccount[]>,
  });
  const asOfDate = localDate();
  const {
    data: balances = [],
    isLoading: balancesLoading,
    error: balancesError,
  } = useQuery({
    queryKey: ["financial-account-balances", asOfDate],
    queryFn: () => fetchBalances({ data: { as_of_date: asOfDate } }) as Promise<BalanceRow[]>,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["financial-movement-categories"],
    queryFn: () => fetchCategories() as Promise<Category[]>,
  });
  const { data: transferCancellations = [] } = useQuery({
    queryKey: ["financial-transfer-cancellations"],
    queryFn: () => fetchTransferCancellations(),
  });
  const range = {
    from_date: fromDate,
    to_date: toDate,
    account_id: accountFilter === "all" ? null : accountFilter,
  };
  const rangeValid = fromDate <= toDate;
  const {
    data: allMovements = [],
    isLoading: movementsLoading,
    error: movementsError,
  } = useQuery({
    queryKey: ["financial-movements", range],
    queryFn: () => fetchMovements({ data: range }) as Promise<MovementRow[]>,
    enabled: rangeValid,
  });

  const invalidateLedger = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["financial-account-balances"] }),
      queryClient.invalidateQueries({ queryKey: ["financial-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["financial-transfer-cancellations"] }),
    ]);
  };
  const saveMovement = useMutation({
    mutationFn: (payload: { id?: string; movement: MovementDraft }) =>
      payload.id
        ? editMovement({ data: { id: payload.id, ...payload.movement } })
        : addMovement({ data: payload.movement }),
    onSuccess: async () => {
      await invalidateLedger();
      setDialogType(null);
      setEditing(null);
    },
  });
  const saveTransfer = useMutation({
    mutationFn: (payload: {
      from_account_id: string;
      to_account_id: string;
      effective_date: string;
      amount: string;
      description: string;
    }) => addTransfer({ data: payload }),
    onSuccess: async () => {
      await invalidateLedger();
      setDialogType(null);
    },
  });
  const cancelTransferMutation = useMutation({
    mutationFn: (input: { transfer_id: string; reason: string }) => cancelTransfer({ data: input }),
    onSuccess: invalidateLedger,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeMovement({ data: { id } }),
    onSuccess: invalidateLedger,
  });

  const balancesByAccount = useMemo(
    () => new Map(balances.map((balance) => [balance.account_id, balance])),
    [balances],
  );
  const cashAccounts = accounts.filter((account) => account.account_type !== "benefit_wallet");
  const activeAccounts = cashAccounts.filter((account) => account.is_active);
  const movements = allMovements.filter((movement) =>
    cashAccounts.some((account) => account.id === movement.account_id),
  );
  const allErrors = [
    accountsError,
    balancesError,
    movementsError,
    saveMovement.error,
    saveTransfer.error,
    cancelTransferMutation.error,
    deleteMutation.error,
  ].filter(Boolean);

  function startEntry(type: "income" | "expense") {
    setEditing(null);
    setDialogType(type);
  }

  function saveDraft(draft: MovementDraft) {
    saveMovement.mutate({ id: editing?.id, movement: draft });
  }

  function onDelete(row: MovementRow) {
    if (
      window.confirm(
        `Excluir a movimentação “${row.description}”? Ela não será removida do orçamento porque é um registro separado.`,
      )
    ) {
      deleteMutation.mutate(row.id);
    }
  }

  function onCancelTransfer(row: MovementRow) {
    if (!row.transfer_id) return;
    if (!window.confirm("Cancelar esta transferência? As duas pernas serão preservadas no histórico e deixarão de afetar os saldos.")) return;
    const reason = window.prompt("Informe o motivo do cancelamento. Ele ficará registrado no histórico:");
    if (reason?.trim()) cancelTransferMutation.mutate({ transfer_id: row.transfer_id, reason: reason.trim() });
  }

  return (
    <div className="min-h-screen px-4 pb-8 pt-4 sm:px-6 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <main className="space-y-6">
          <section className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="finance-app-title text-2xl font-bold">Fluxo de caixa por conta</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Registre entradas e saídas efetivas e acompanhe o saldo calculado a partir do saldo
                inicial informado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => startEntry("income")} disabled={activeAccounts.length === 0}>
                <ArrowDownLeft className="mr-2 h-4 w-4" />
                Entrada
              </Button>
              <Button
                variant="outline"
                onClick={() => startEntry("expense")}
                disabled={activeAccounts.length === 0}
              >
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Saída
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setDialogType("transfer");
                }}
                disabled={activeAccounts.length < 2}
              >
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Transferir
              </Button>
            </div>
          </section>

          <aside
            className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
            role="note"
          >
            Saldo calculado = saldo inicial + movimentações registradas depois da data de
            referência. A abertura já inclui movimentações ocorridas na própria data, que não são
            somadas novamente. Sem abertura conhecida, mostramos somente a variação registrada, não
            o saldo total. As moedas são exibidas separadamente e não há conversão. Este livro-caixa
            não altera o orçamento pessoal.
          </aside>

          {allErrors.map((error, index) => (
            <p key={index} className="text-sm text-danger" role="alert">
              {error instanceof Error
                ? error.message
                : "Ocorreu um erro ao processar a movimentação."}
            </p>
          ))}

          <section aria-labelledby="account-balances-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="account-balances-title" className="text-lg font-bold">
                  Saldos das contas
                </h3>
                <p className="text-xs text-muted-foreground">
                  Cálculo até {formatDate(asOfDate)} · sem somar moedas diferentes
                </p>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link to="/contas">
                  <Landmark className="mr-2 h-4 w-4" />
                  Gerenciar contas
                </Link>
              </Button>
            </div>
            {accountsLoading || balancesLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Carregando saldos…</p>
            ) : accounts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center px-6 py-10 text-center">
                  <Wallet className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">Cadastre uma conta para começar</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nenhuma conta será criada a partir dos lançamentos existentes.
                  </p>
                  <Button asChild className="mt-4">
                    <Link to="/contas">
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar conta
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cashAccounts.map((account) => {
                  const balance = balancesByAccount.get(account.id);
                  if (!balance) return null;
                  return (
                    <Card key={account.id}>
                      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-muted p-2 text-primary">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle>{account.name}</CardTitle>
                            <CardDescription className="mt-1">
                              {account.account_type === "bank_account"
                                ? "Conta bancária"
                                : account.account_type === "wallet"
                                  ? "Carteira"
                                  : account.account_type === "benefit_wallet"
                                    ? "Carteira de benefício (VA)"
                                    : "Outro"}{" "}
                              · {balance.currency_code}
                            </CardDescription>
                          </div>
                        </div>
                        <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                          {balance.is_active ? "Ativa" : "Desativada"}
                        </span>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {balance.opening_balance !== null && balance.opening_balance_date ? (
                          <p className="text-xs text-muted-foreground">
                            Abertura: {formatMoney(balance.opening_balance, balance.currency_code)}{" "}
                            em {formatDate(balance.opening_balance_date)}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Saldo inicial: desconhecido
                          </p>
                        )}
                        {balance.calculated_balance !== null ? (
                          <div className="rounded-lg bg-muted/60 p-4">
                            <p className="text-xs font-medium text-muted-foreground">
                              Saldo calculado em {formatDate(asOfDate)}
                            </p>
                            <p className="mt-1 text-2xl font-semibold tabular-nums">
                              {formatMoney(balance.calculated_balance, balance.currency_code)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Baseado na abertura e nas movimentações registradas após ela.
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-muted/60 p-4">
                            <p className="text-xs font-medium text-muted-foreground">Saldo total</p>
                            <p className="mt-1 text-lg font-semibold">Desconhecido</p>
                            <p className="mt-1 text-sm">
                              Variação registrada:{" "}
                              {formatMoney(balance.recorded_net_activity, balance.currency_code)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              A variação não representa o saldo total real.
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4" aria-labelledby="movement-history-title">
            <div>
              <h3 id="movement-history-title" className="text-lg font-bold">
                Movimentações
              </h3>
              <p className="text-sm text-muted-foreground">
                Cada registro é independente dos lançamentos do orçamento.
              </p>
            </div>
            <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="movement-from">De</Label>
                <Input
                  id="movement-from"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="movement-to">Até</Label>
                <Input
                  id="movement-to"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="movement-account">Conta</Label>
                <select
                  id="movement-account"
                  value={accountFilter}
                  onChange={(event) => setAccountFilter(event.target.value)}
                  className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">Todas as contas</option>
                  {cashAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.is_active ? "" : " (desativada)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!rangeValid && (
              <p className="text-sm text-danger" role="alert">
                A data inicial deve ser anterior ou igual à data final.
              </p>
            )}
            {movementsLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Carregando movimentações…
              </p>
            ) : movements.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma movimentação neste período.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {movements.map((row) => {
                  const account = accounts.find((item) => item.id === row.account_id);
                  const cancelled = row.transfer_status === "cancelled";
                  const isTransfer = row.transfer_id !== null;
                  const isPositive =
                    row.movement_type === "income" || row.movement_type === "transfer_in";
                  return (
                    <Card key={row.id} className={cancelled ? "opacity-60" : undefined}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`rounded-full p-2 ${isPositive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                          >
                            {isTransfer ? (
                              <ArrowLeftRight className="h-4 w-4" />
                            ) : isPositive ? (
                              <ArrowDownLeft className="h-4 w-4" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{row.description}</p>
                              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                {cancelled ? "Cancelada" : movementLabels[row.movement_type]}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatDate(row.effective_date)} · {row.account_name}
                              {row.related_account_name
                                ? ` · ${isPositive ? "de" : "para"} ${row.related_account_name}`
                                : ""}
                              {row.category_name ? ` · ${row.category_name}` : ""}
                            </p>
                            {cancelled && transferCancellations.find((item) => item.transfer_id === row.transfer_id)?.reason && <p className="mt-1 text-xs text-muted-foreground">Motivo do cancelamento: {transferCancellations.find((item) => item.transfer_id === row.transfer_id)?.reason}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`whitespace-nowrap font-semibold tabular-nums ${cancelled ? "text-muted-foreground line-through" : isPositive ? "text-primary" : "text-foreground"}`}
                          >
                            {isPositive ? "+" : "−"}
                            {formatMoney(row.amount, account?.currency_code ?? "BRL")}
                          </span>
                          {isTransfer ? (
                            row.movement_type === "transfer_out" && !cancelled ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={cancelTransferMutation.isPending}
                                onClick={() => onCancelTransfer(row)}
                              >
                                Cancelar
                              </Button>
                            ) : null
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditing(row);
                                  setDialogType(
                                    row.movement_type === "income" ? "income" : "expense",
                                  );
                                }}
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={deleteMutation.isPending}
                                onClick={() => onDelete(row)}
                              >
                                Excluir
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>

      {(dialogType === "income" || dialogType === "expense") && (
        <MovementDialog
          key={`${editing?.id ?? "new"}-${dialogType}`}
          type={dialogType}
          accounts={cashAccounts}
          categories={categories}
          editing={editing}
          saving={saveMovement.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setDialogType(null);
              setEditing(null);
            }
          }}
          onSave={saveDraft}
        />
      )}
      {dialogType === "transfer" && (
        <TransferDialog
          accounts={activeAccounts}
          saving={saveTransfer.isPending}
          onOpenChange={(open) => {
            if (!open) setDialogType(null);
          }}
          onSave={(payload) => saveTransfer.mutate(payload)}
        />
      )}
    </div>
  );
}

function MovementDialog({
  type,
  accounts,
  categories,
  editing,
  saving,
  onOpenChange,
  onSave,
}: {
  type: "income" | "expense";
  accounts: FinancialAccount[];
  categories: Category[];
  editing: MovementRow | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: MovementDraft) => void;
}) {
  const eligibleAccounts = accounts.filter(
    (account) => account.is_active || account.id === editing?.account_id,
  );
  const [accountId, setAccountId] = useState(
    editing?.account_id ?? eligibleAccounts.find((account) => account.is_active)?.id ?? "",
  );
  const [date, setDate] = useState(editing?.effective_date ?? localDate());
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const account = eligibleAccounts.find((item) => item.id === accountId);
  const draft = {
    account_id: accountId,
    effective_date: date,
    movement_type: type,
    amount,
    description,
    category_id: type === "expense" && categoryId ? categoryId : null,
  };
  const parsed = movementInputSchema.omit({ id: true }).safeParse(draft);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    if (account && !account.is_active && account.id !== editing?.account_id) {
      setError("Ative a conta antes de registrar movimentações nela.");
      return;
    }
    setError(null);
    onSave(parsed.data);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing
              ? "Editar movimentação"
              : type === "income"
                ? "Registrar entrada"
                : "Registrar saída"}
          </DialogTitle>
          <DialogDescription>
            Este registro altera somente o saldo desta conta; não cria nem altera lançamentos do
            orçamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="movement-account">Conta</Label>
            <select
              id="movement-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {eligibleAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.is_active ? "" : " (desativada — edição)"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="movement-date">Data efetiva</Label>
              <Input
                id="movement-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="movement-amount">Valor positivo</Label>
              <Input
                id="movement-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="movement-description">Descrição</Label>
            <Input
              id="movement-description"
              value={description}
              maxLength={160}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: Recebimento"
            />
          </div>
          {type === "expense" && (
            <div>
              <Label htmlFor="movement-category">Categoria (opcional)</Label>
              <select
                id="movement-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sem categoria</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || eligibleAccounts.length === 0}>
              {saving ? "Salvando…" : "Salvar movimentação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  accounts,
  saving,
  onOpenChange,
  onSave,
}: {
  accounts: FinancialAccount[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    from_account_id: string;
    to_account_id: string;
    effective_date: string;
    amount: string;
    description: string;
  }) => void;
}) {
  const [sourceId, setSourceId] = useState(accounts[0]?.id ?? "");
  const [targetId, setTargetId] = useState(accounts[1]?.id ?? "");
  const [date, setDate] = useState(localDate());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Transferência entre contas");
  const [error, setError] = useState<string | null>(null);
  const source = accounts.find((account) => account.id === sourceId);
  const target = accounts.find((account) => account.id === targetId);
  const compatible =
    source && target
      ? transferAccountCompatibility(source, target)
      : { ok: false as const, reason: "different_users" as const };
  const parsed = transferInputSchema.safeParse({
    from_account_id: sourceId,
    to_account_id: targetId,
    effective_date: date,
    amount,
    description,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    if (!compatible.ok) {
      setError(
        compatible.reason === "different_currencies"
          ? "As contas precisam usar a mesma moeda."
          : "Selecione duas contas ativas compatíveis.",
      );
      return;
    }
    setError(null);
    onSave(parsed.data);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir entre contas</DialogTitle>
          <DialogDescription>
            A operação cria as duas movimentações juntas. Para corrigir, cancele a transferência
            inteira.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="transfer-from">Da conta</Label>
            <select
              id="transfer-from"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency_code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="transfer-to">Para a conta</Label>
            <select
              id="transfer-to"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency_code}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="transfer-date">Data efetiva</Label>
              <Input
                id="transfer-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="transfer-amount">Valor positivo</Label>
              <Input
                id="transfer-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="transfer-description">Descrição</Label>
            <Input
              id="transfer-description"
              maxLength={160}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {source && target && sourceId === targetId && (
            <p className="text-sm text-danger" role="alert">
              Escolha duas contas diferentes.
            </p>
          )}
          {source && target && source.currency_code !== target.currency_code && (
            <p className="text-sm text-danger" role="alert">
              As contas usam moedas diferentes; conversão não está disponível.
            </p>
          )}
          {source &&
            target &&
            sourceId !== targetId &&
            source.currency_code === target.currency_code && (
              <p className="text-xs text-muted-foreground">
                Moeda da transferência: {source.currency_code} · nenhum valor será somado ao
                orçamento.
              </p>
            )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || accounts.length < 2}>
              {saving ? "Transferindo…" : "Confirmar transferência"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
