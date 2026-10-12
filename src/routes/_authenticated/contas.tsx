import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Landmark, Plus, Wallet } from "lucide-react";
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
import {
  createFinancialAccount,
  listFinancialAccounts,
  setFinancialAccountActive,
  updateFinancialAccount,
} from "@/lib/financial-accounts.functions";
import {
  didOpeningBalanceChange,
  financialAccountInputSchema,
  openingBalanceLabel,
  type FinancialAccount,
  type FinancialAccountInput,
} from "@/lib/financial-accounts";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({
    meta: [
      { title: "Contas — Month Check" },
      { name: "description", content: "Cadastre contas e saldos iniciais informados." },
      { property: "og:title", content: "Contas — Month Check" },
      { property: "og:description", content: "Cadastre contas e saldos iniciais informados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

const ACCOUNT_TYPES = {
  bank_account: "Conta bancária",
  wallet: "Carteira",
  benefit_wallet: "Carteira de benefício",
  other: "Outro",
} as const;

type AccountFormState = {
  name: string;
  account_type: FinancialAccountInput["account_type"];
  currency_code: string;
  opening_balance: string;
  opening_balance_date: string;
};

function emptyForm(): AccountFormState {
  return {
    name: "",
    account_type: "bank_account",
    currency_code: "BRL",
    opening_balance: "",
    opening_balance_date: "",
  };
}

function stateFromAccount(account: FinancialAccount): AccountFormState {
  return {
    name: account.name,
    account_type: account.account_type,
    currency_code: account.currency_code,
    opening_balance: account.opening_balance === null ? "" : String(account.opening_balance),
    opening_balance_date: account.opening_balance_date ?? "",
  };
}

function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function AccountsPage() {
  const queryClient = useQueryClient();
  const fetchAccounts = useServerFn(listFinancialAccounts);
  const createAccount = useServerFn(createFinancialAccount);
  const updateAccount = useServerFn(updateFinancialAccount);
  const setAccountActive = useServerFn(setFinancialAccountActive);
  const [editing, setEditing] = useState<FinancialAccount | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    data: accounts = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: () => fetchAccounts() as Promise<FinancialAccount[]>,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
  const saveMutation = useMutation({
    mutationFn: async (payload: { id?: string; changes: FinancialAccountInput }) =>
      payload.id
        ? updateAccount({ data: { id: payload.id, changes: payload.changes } })
        : createAccount({ data: payload.changes }),
    onSuccess: async () => {
      await invalidate();
      setDialogOpen(false);
      setEditing(null);
    },
  });
  const activeMutation = useMutation({
    mutationFn: (payload: { id: string; is_active: boolean }) =>
      setAccountActive({ data: payload }),
    onSuccess: invalidate,
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(account: FinancialAccount) {
    setEditing(account);
    setDialogOpen(true);
  }

  const activeAccounts = accounts.filter((account) => account.is_active);
  const inactiveAccounts = accounts.filter((account) => !account.is_active);

  return (
    <div className="min-h-screen px-4 pb-24 pt-4 sm:px-6 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <main className="space-y-6">
          <section className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="finance-app-title text-2xl font-bold">Contas e carteiras</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Cadastre contas e informe um saldo inicial com a data em que ele foi conferido.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nova conta
            </Button>
          </section>

          <aside
            className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
            role="note"
          >
            O saldo calculado usa a abertura informada e as movimentações registradas depois dela.
            Sem abertura conhecida, a conciliação permanece inconclusiva; o aplicativo não altera
            movimentos para fazer os valores coincidirem.
          </aside>

          {error && (
            <p className="text-sm text-danger" role="alert">
              Não foi possível carregar as contas: {error.message}
            </p>
          )}
          {saveMutation.error && (
            <p className="text-sm text-danger" role="alert">
              Não foi possível salvar a conta: {saveMutation.error.message}
            </p>
          )}
          {activeMutation.error && (
            <p className="text-sm text-danger" role="alert">
              Não foi possível atualizar o estado da conta: {activeMutation.error.message}
            </p>
          )}

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando contas…</p>
          ) : activeAccounts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center px-6 py-12 text-center">
                <Landmark className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Nenhuma conta cadastrada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  O cadastro não altera seus lançamentos nem o orçamento.
                </p>
                <Button className="mt-5" variant="outline" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar conta
                </Button>
              </CardContent>
            </Card>
          ) : (
            <section
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              aria-label="Contas ativas"
            >
              {activeAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={() => openEdit(account)}
                  onToggle={() => activeMutation.mutate({ id: account.id, is_active: false })}
                  busy={activeMutation.isPending}
                />
              ))}
            </section>
          )}

          <FinancialReconciliationPanel
            title="Conciliação de contas bancárias e carteiras"
            accounts={activeAccounts.filter((account) => account.account_type !== "benefit_wallet")}
          />

          {inactiveAccounts.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Contas desativadas</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {inactiveAccounts.map((account) => (
                  <Card key={account.id} className="opacity-75">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ACCOUNT_TYPES[account.account_type as keyof typeof ACCOUNT_TYPES]} ·
                          Desativada
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(account)}>
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={activeMutation.isPending}
                          onClick={() => activeMutation.mutate({ id: account.id, is_active: true })}
                        >
                          Reativar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      <AccountDialog
        key={`${editing?.id ?? "new"}-${dialogOpen ? "open" : "closed"}`}
        open={dialogOpen}
        account={editing}
        saving={saveMutation.isPending}
        onOpenChange={setDialogOpen}
        onSave={(changes) => saveMutation.mutate({ id: editing?.id, changes })}
      />
    </div>
  );
}

function AccountCard({
  account,
  onEdit,
  onToggle,
  busy,
}: {
  account: FinancialAccount;
  onEdit: () => void;
  onToggle: () => void;
  busy: boolean;
}) {
  const opening = openingBalanceLabel(account);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2 text-primary">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{account.name}</CardTitle>
            <CardDescription className="mt-1">
              {ACCOUNT_TYPES[account.account_type as keyof typeof ACCOUNT_TYPES]} ·{" "}
              {account.currency_code}
            </CardDescription>
          </div>
        </div>
        <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
          Ativa
        </span>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-muted/60 p-4">
          <p className="text-xs font-medium text-muted-foreground">Saldo inicial informado</p>
          {opening.known ? (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatCurrency(opening.amount, account.currency_code)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Referência: {opening.referenceDate}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-lg font-semibold">Saldo desconhecido</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhum saldo inicial foi informado.
              </p>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Este valor não representa um saldo atual calculado.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onEdit}>
            Editar
          </Button>
          <Button variant="ghost" className="flex-1" disabled={busy} onClick={onToggle}>
            Desativar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountDialog({
  open,
  account,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  account: FinancialAccount | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: FinancialAccountInput) => void;
}) {
  const [form, setForm] = useState<AccountFormState>(() =>
    account ? stateFromAccount(account) : emptyForm(),
  );
  const [confirmOpeningChange, setConfirmOpeningChange] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(account ? stateFromAccount(account) : emptyForm());
    setConfirmOpeningChange(false);
    setError(null);
  }, [account, open]);

  const amount = parseMoneyInput(form.opening_balance);
  const payload: FinancialAccountInput = {
    name: form.name.trim(),
    account_type: form.account_type,
    currency_code: form.currency_code.trim().toUpperCase(),
    opening_balance: amount,
    opening_balance_date: amount === null ? null : form.opening_balance_date || null,
  };
  const parsed = financialAccountInputSchema.safeParse(payload);
  const openingChanged = account ? didOpeningBalanceChange(account, payload) : false;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos informados.");
      return;
    }
    if (openingChanged && !confirmOpeningChange) return;
    setError(null);
    onSave(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>
            O cadastro é independente dos lançamentos e não cria receitas ou despesas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="account-name">Nome</Label>
            <Input
              id="account-name"
              autoFocus
              value={form.name}
              maxLength={80}
              onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))}
              placeholder="Ex.: Conta principal"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="account-type">Tipo</Label>
              <select
                id="account-type"
                value={form.account_type}
                onChange={(event) =>
                  setForm((old) => ({
                    ...old,
                    account_type: event.target.value as AccountFormState["account_type"],
                  }))
                }
                className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="bank_account">Conta bancária</option>
                <option value="wallet">Carteira</option>
                <option value="benefit_wallet">Carteira de benefício (VA)</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <Label htmlFor="account-currency">Moeda (código ISO)</Label>
              <Input
                id="account-currency"
                value={form.currency_code}
                maxLength={3}
                onChange={(event) =>
                  setForm((old) => ({ ...old, currency_code: event.target.value.toUpperCase() }))
                }
                placeholder="BRL"
              />
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="font-medium">Saldo inicial informado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Informe o valor e a data de referência. Se deixar o valor vazio, o saldo permanece
              desconhecido. Ainda não há cálculo automático do saldo atual.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="opening-balance">Valor</Label>
              <Input
                id="opening-balance"
                inputMode="decimal"
                value={form.opening_balance}
                onChange={(event) =>
                  setForm((old) => ({ ...old, opening_balance: event.target.value }))
                }
                placeholder="Ex.: 0,00"
              />
            </div>
            <div>
              <Label htmlFor="opening-date">Data de referência</Label>
              <Input
                id="opening-date"
                type="date"
                disabled={!form.opening_balance.trim()}
                value={form.opening_balance_date}
                onChange={(event) =>
                  setForm((old) => ({ ...old, opening_balance_date: event.target.value }))
                }
              />
            </div>
          </div>
          {openingChanged && (
            <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
              <input
                type="checkbox"
                checked={confirmOpeningChange}
                onChange={(event) => setConfirmOpeningChange(event.target.checked)}
                className="mt-0.5"
              />
              <span>Confirmo que estou substituindo o saldo inicial informado anteriormente.</span>
            </label>
          )}
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {!parsed.success && amount !== null && (
            <p className="text-xs text-muted-foreground">
              O valor deve ter até duas casas decimais e a data é obrigatória quando há saldo
              inicial.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || (openingChanged && !confirmOpeningChange)}>
              {saving ? "Salvando…" : "Salvar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
