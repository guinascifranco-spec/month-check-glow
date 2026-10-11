import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { CreditCard, LogOut, Plus, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { InstallPWAButton } from "@/components/install-pwa-button";
import { PageTabs } from "@/components/page-tabs";
import { MobileNav } from "@/components/mobile-nav";
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
  creditCardInputSchema,
  decimalAmountToCents,
  getInvoiceStatus,
  invoiceInputSchema,
  invoicePaymentSchema,
  remainingInvoiceCents,
  type CreditCardInput,
  type InvoiceInput,
  type InvoicePaymentInput,
} from "@/lib/credit-cards";
import {
  associateCreditCardInvoiceRow,
  closeCreditCardInvoice,
  createCreditCardInvoice,
  listCreditCardInvoiceItems,
  listCreditCardInvoices,
  listCreditCardPayments,
  listCreditCards,
  listUnlinkedInvoiceRows,
  recordCreditCardPayment,
  reopenCreditCardInvoice,
  saveCreditCard,
  setCreditCardActive,
  unlinkCreditCardInvoiceRow,
} from "@/lib/credit-cards.functions";
import { listFinancialAccounts } from "@/lib/financial-accounts.functions";

export const Route = createFileRoute("/_authenticated/faturas")({
  head: () => ({ meta: [
    { title: "Cartões e faturas — Month Check" },
    { name: "description", content: "Confira cartões, compras e pagamentos de faturas." },
    { property: "og:title", content: "Cartões e faturas — Month Check" },
    { property: "og:description", content: "Confira cartões, compras e pagamentos de faturas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CreditCardsPage,
});

type CardRow = {
  id: string;
  name: string;
  last_four: string | null;
  currency_code: string;
  payment_account_id: string | null;
  payment_account_name: string | null;
  closing_day: number | null;
  due_day: number | null;
  is_active: boolean;
};
type InvoiceRow = {
  id: string;
  card_id: string;
  card_name: string;
  currency_code: string;
  period_start: string;
  period_end: string;
  closing_date: string | null;
  due_date: string | null;
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  closed_at: string | null;
  source: "manual" | "imported";
  item_count: number;
};
type InvoiceRowItem = {
  id: string;
  transaction_date: string | null;
  descricao: string;
  tipo: string;
  valor: string;
  invoice_card: string | null;
  invoice_source: string | null;
  invoice_installment_current: number | null;
  invoice_installment_total: number | null;
  invoice_responsibility: string | null;
  invoice_personal_value: string | null;
};
type PaymentRow = {
  id: string;
  account_id: string;
  account_name: string;
  effective_date: string;
  amount: string;
  created_at: string;
};

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateLabel(value: string | null) {
  if (!value) return "Não informado";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
function money(value: string, currency = "BRL") {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return `${value} ${currency}`;
  const whole = BigInt(match[2]!).toLocaleString("pt-BR");
  const decimal = (match[3] ?? "").padEnd(2, "0").slice(0, 2);
  try {
    const parts = new Intl.NumberFormat("pt-BR", { style: "currency", currency }).formatToParts(0);
    const integerIndex = parts.findIndex((part) => part.type === "integer");
    const fractionIndex = parts.findIndex((part) => part.type === "fraction");
    const prefix = parts
      .slice(0, integerIndex)
      .map((part) => part.value)
      .join("");
    const suffix = parts
      .slice(fractionIndex + 1)
      .map((part) => part.value)
      .join("");
    return `${match[1] ? "−" : ""}${prefix}${whole},${decimal}${suffix}`;
  } catch {
    return `${whole},${decimal} ${currency}`;
  }
}
const statusLabels = {
  open: "Aberta",
  closed: "Fechada",
  partially_paid: "Parcialmente paga",
  paid: "Paga",
  overdue: "Vencida",
} as const;

function CreditCardsPage() {
  const queryClient = useQueryClient();
  const fetchCards = useServerFn(listCreditCards);
  const fetchInvoices = useServerFn(listCreditCardInvoices);
  const fetchAccounts = useServerFn(listFinancialAccounts);
  const fetchUnlinked = useServerFn(listUnlinkedInvoiceRows);
  const fetchInvoiceItems = useServerFn(listCreditCardInvoiceItems);
  const fetchPayments = useServerFn(listCreditCardPayments);
  const saveCard = useServerFn(saveCreditCard);
  const setCardActive = useServerFn(setCreditCardActive);
  const createInvoice = useServerFn(createCreditCardInvoice);
  const closeInvoice = useServerFn(closeCreditCardInvoice);
  const reopenInvoice = useServerFn(reopenCreditCardInvoice);
  const associateRow = useServerFn(associateCreditCardInvoiceRow);
  const unlinkRow = useServerFn(unlinkCreditCardInvoiceRow);
  const payInvoice = useServerFn(recordCreditCardPayment);
  const [cardDialog, setCardDialog] = useState(false);
  const [editingCard, setEditingCard] = useState<CardRow | null>(null);
  const [invoiceDialog, setInvoiceDialog] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceRow | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");

  const cardsQuery = useQuery({
    queryKey: ["credit-cards"],
    queryFn: () => fetchCards() as Promise<CardRow[]>,
  });
  const invoicesQuery = useQuery({
    queryKey: ["credit-card-invoices"],
    queryFn: () => fetchInvoices() as Promise<InvoiceRow[]>,
  });
  const accountsQuery = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: () => fetchAccounts() as Promise<FinancialAccount[]>,
  });
  const unlinkedQuery = useQuery({
    queryKey: ["unlinked-invoice-rows"],
    queryFn: () => fetchUnlinked({ data: { limit: 500 } }) as Promise<InvoiceRowItem[]>,
  });

  const activeAccounts = (accountsQuery.data ?? []).filter(
    (account) => account.is_active && account.account_type !== "benefit_wallet",
  );
  const cards = cardsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
  const selectedInvoiceQuery = useQuery({
    queryKey: ["credit-card-invoice-items", selectedInvoiceId],
    queryFn: () => fetchInvoiceItems({ data: { invoice_id: selectedInvoiceId } }),
    enabled: !!selectedInvoiceId,
  });
  const selectedPaymentsQuery = useQuery({
    queryKey: ["credit-card-payments", selectedInvoiceId],
    queryFn: () => fetchPayments({ data: { invoice_id: selectedInvoiceId } }),
    enabled: !!selectedInvoiceId,
  });

  const invalidateStatements = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["credit-cards"] }),
      queryClient.invalidateQueries({ queryKey: ["credit-card-invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["credit-card-invoice-items"] }),
      queryClient.invalidateQueries({ queryKey: ["credit-card-payments"] }),
      queryClient.invalidateQueries({ queryKey: ["unlinked-invoice-rows"] }),
      queryClient.invalidateQueries({ queryKey: ["financial-account-balances"] }),
      queryClient.invalidateQueries({ queryKey: ["financial-movements"] }),
    ]);
  };
  const cardMutation = useMutation({
    mutationFn: (input: CreditCardInput) => saveCard({ data: input }),
    onSuccess: async () => {
      await invalidateStatements();
      setCardDialog(false);
      setEditingCard(null);
    },
  });
  const activeMutation = useMutation({
    mutationFn: (input: { id: string; is_active: boolean }) => setCardActive({ data: input }),
    onSuccess: invalidateStatements,
  });
  const invoiceMutation = useMutation({
    mutationFn: (input: InvoiceInput) => createInvoice({ data: input }),
    onSuccess: async (result) => {
      await invalidateStatements();
      if (result.id) setSelectedInvoiceId(result.id);
      setInvoiceDialog(false);
    },
  });
  const closeMutation = useMutation({
    mutationFn: (invoice_id: string) => closeInvoice({ data: { invoice_id } }),
    onSuccess: invalidateStatements,
  });
  const reopenMutation = useMutation({
    mutationFn: (invoice_id: string) => reopenInvoice({ data: { invoice_id } }),
    onSuccess: invalidateStatements,
  });
  const associateMutation = useMutation({
    mutationFn: (input: { invoice_id: string; row_id: string }) => associateRow({ data: input }),
    onSuccess: invalidateStatements,
  });
  const unlinkMutation = useMutation({
    mutationFn: (input: { invoice_id: string; row_id: string }) => unlinkRow({ data: input }),
    onSuccess: invalidateStatements,
  });
  const payMutation = useMutation({
    mutationFn: (input: InvoicePaymentInput) => payInvoice({ data: input }),
    onSuccess: async () => {
      await invalidateStatements();
      setPaymentInvoice(null);
    },
  });
  const errors = [
    cardsQuery.error,
    invoicesQuery.error,
    accountsQuery.error,
    unlinkedQuery.error,
    selectedInvoiceQuery.error,
    selectedPaymentsQuery.error,
    cardMutation.error,
    activeMutation.error,
    invoiceMutation.error,
    closeMutation.error,
    reopenMutation.error,
    associateMutation.error,
    unlinkMutation.error,
    payMutation.error,
  ].filter(Boolean);

  const today = localDate();
  const unlinkedRows = useMemo(() => unlinkedQuery.data ?? [], [unlinkedQuery.data]);

  return (
    <div className="min-h-screen px-4 pb-24 pt-4 sm:px-6 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo height={40} />
            <div>
              <h1 className="finance-app-title text-2xl font-bold">Month Check</h1>
              <p className="text-sm text-muted-foreground">Cartões e faturas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <InstallPWAButton />
            <button
              onClick={() => void supabase.auth.signOut()}
              className="neu-pressable inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>
        <div className="mb-6">
          <PageTabs />
        </div>
        <main className="space-y-6">
          <section className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="finance-app-title text-2xl font-bold">Faturas de cartão</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                As compras continuam no orçamento pela data original. Pagamentos reduzem o saldo da
                conta e da fatura, sem criar consumo duplicado.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingCard(null);
                  setCardDialog(true);
                }}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Cadastrar cartão
              </Button>
              <Button
                onClick={() => setInvoiceDialog(true)}
                disabled={cards.every((card) => !card.is_active)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova fatura
              </Button>
            </div>
          </section>
          <aside
            className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
            role="note"
          >
            Faturas e pagamentos não alteram os lançamentos de orçamento. Linhas importadas só são
            vinculadas depois que você as seleciona; seus valores, datas, parcelas e classificações
            permanecem intactos. Uma fatura só pode receber pagamentos depois de fechada.
          </aside>
          {errors.map((error, index) => (
            <p key={index} className="text-sm text-danger" role="alert">
              {error instanceof Error
                ? error.message
                : "Ocorreu um erro ao processar o cartão ou a fatura."}
            </p>
          ))}

          <section aria-labelledby="cards-title">
            <div className="mb-3">
              <h3 id="cards-title" className="text-lg font-bold">
                Cartões cadastrados
              </h3>
            </div>
            {cardsQuery.isLoading ? (
              <p className="py-5 text-sm text-muted-foreground">Carregando cartões…</p>
            ) : cards.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum cartão cadastrado.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => (
                  <Card key={card.id}>
                    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                      <div>
                        <CardTitle className="text-base">
                          {card.name}
                          {card.last_four ? ` · •••• ${card.last_four}` : ""}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {card.currency_code} · Fecha {card.closing_day ?? "—"} · Vence{" "}
                          {card.due_day ?? "—"}
                        </CardDescription>
                      </div>
                      <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                        {card.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Conta de pagamento: {card.payment_account_name ?? "não definida"}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingCard(card);
                            setCardDialog(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={activeMutation.isPending}
                          onClick={() =>
                            activeMutation.mutate({ id: card.id, is_active: !card.is_active })
                          }
                        >
                          {card.is_active ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-bold">Faturas</h3>
                <p className="text-xs text-muted-foreground">
                  Status calculado por fechamento, vencimento e pagamentos registrados.
                </p>
              </div>
              {invoicesQuery.isLoading ? (
                <p className="py-5 text-sm text-muted-foreground">Carregando faturas…</p>
              ) : invoices.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma fatura registrada. Os dados de faturas antigas não são inferidos
                    automaticamente.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {invoices.map((invoice) => {
                    const status = getInvoiceStatus(invoice, today);
                    const selected = invoice.id === selectedInvoiceId;
                    return (
                      <Card key={invoice.id} className={selected ? "border-primary" : undefined}>
                        <CardContent className="space-y-3 p-4">
                          <button
                            className="w-full text-left"
                            onClick={() => setSelectedInvoiceId(invoice.id)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">
                                  {invoice.card_name} · {dateLabel(invoice.period_start)}–
                                  {dateLabel(invoice.period_end)}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Vencimento {dateLabel(invoice.due_date)} · {invoice.item_count}{" "}
                                  compra(s) associada(s)
                                </p>
                              </div>
                              <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                                {statusLabels[status]}
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="text-muted-foreground">Total</p>
                                <p className="mt-1 font-medium">
                                  {money(invoice.total_amount, invoice.currency_code)}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Pago</p>
                                <p className="mt-1 font-medium">
                                  {money(invoice.paid_amount, invoice.currency_code)}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Em aberto</p>
                                <p className="mt-1 font-medium">
                                  {money(invoice.remaining_amount, invoice.currency_code)}
                                </p>
                              </div>
                            </div>
                          </button>
                          <div className="flex flex-wrap gap-2">
                            {!invoice.closed_at && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={closeMutation.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Fechar esta fatura? Depois disso, não será possível associar ou corrigir compras até reabri-la.",
                                    )
                                  )
                                    closeMutation.mutate(invoice.id);
                                }}
                              >
                                Fechar fatura
                              </Button>
                            )}
                            {invoice.closed_at && invoice.paid_amount === "0" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={reopenMutation.isPending}
                                onClick={() => reopenMutation.mutate(invoice.id)}
                              >
                                Reabrir para corrigir
                              </Button>
                            )}
                            {invoice.closed_at &&
                              remainingInvoiceCents(invoice.total_amount, invoice.paid_amount) >
                                0n && (
                                <Button size="sm" onClick={() => setPaymentInvoice(invoice)}>
                                  Registrar pagamento
                                </Button>
                              )}
                            {invoice.source === "imported" ? (
                              <span className="self-center text-xs text-muted-foreground">
                                Dados informados como importados
                              </span>
                            ) : (
                              <span className="self-center text-xs text-muted-foreground">
                                Cadastro manual
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold">Detalhes e compras associadas</h3>
                <p className="text-xs text-muted-foreground">
                  Selecione uma fatura para ver itens, pagamentos e associar compras importadas
                  existentes.
                </p>
              </div>
              {!selectedInvoice ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    <ReceiptText className="mx-auto mb-3 h-7 w-7" />
                    Selecione uma fatura para consultar os detalhes.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Compras desta fatura</CardTitle>
                      <CardDescription>
                        Originais do orçamento; associação não duplica nem altera valores.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedInvoiceQuery.isLoading ? (
                        <p className="text-sm text-muted-foreground">Carregando itens…</p>
                      ) : (selectedInvoiceQuery.data ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma compra associada.</p>
                      ) : (
                        (selectedInvoiceQuery.data as InvoiceRowItem[]).map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0"
                          >
                            <div>
                              <p className="text-sm font-medium">{item.descricao}</p>
                              <p className="text-xs text-muted-foreground">
                                {dateLabel(item.transaction_date)} ·{" "}
                                {item.invoice_source
                                  ? item.tipo === "entrada"
                                    ? "Crédito importado"
                                    : "Compra importada"
                                  : item.tipo === "entrada"
                                    ? "Entrada associada manualmente"
                                    : "Lançamento manual associado"}
                                {item.invoice_card ? ` · ${item.invoice_card}` : ""}
                                {item.invoice_installment_current && item.invoice_installment_total
                                  ? ` · Parcela ${item.invoice_installment_current}/${item.invoice_installment_total}`
                                  : ""}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Origem {item.invoice_source?.slice(0, 12) ?? "—"}
                                {item.invoice_responsibility
                                  ? ` · ${item.invoice_responsibility} · Pessoal ${money(item.invoice_personal_value ?? "0", selectedInvoice.currency_code)}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {item.tipo === "entrada" ? "−" : ""}
                                {money(item.valor, selectedInvoice.currency_code)}
                              </span>
                              {!selectedInvoice.closed_at && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={unlinkMutation.isPending}
                                  onClick={() =>
                                    unlinkMutation.mutate({
                                      invoice_id: selectedInvoice.id,
                                      row_id: item.id,
                                    })
                                  }
                                >
                                  Desassociar
                                </Button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {!selectedInvoice.closed_at && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Associar compra ou lançamento existente
                        </CardTitle>
                        <CardDescription>
                          Selecione manualmente uma linha do orçamento. As linhas importadas mostram
                          origem, parcela e responsabilidade; nenhuma associação é inferida.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="max-h-72 space-y-2 overflow-y-auto">
                        {unlinkedQuery.isLoading ? (
                          <p className="text-sm text-muted-foreground">
                            Carregando lançamentos disponíveis…
                          </p>
                        ) : unlinkedRows.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Nenhum lançamento disponível para associação.
                          </p>
                        ) : (
                          unlinkedRows.map((row) => (
                            <div
                              key={row.id}
                              className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{row.descricao}</p>
                                <p className="text-xs text-muted-foreground">
                                  {dateLabel(row.transaction_date)} ·{" "}
                                  {row.invoice_source
                                    ? `${row.invoice_card ?? "Cartão importado"} · importado · origem ${row.invoice_source.slice(0, 10)}`
                                    : "Registro manual do orçamento"}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={associateMutation.isPending}
                                onClick={() =>
                                  associateMutation.mutate({
                                    invoice_id: selectedInvoice.id,
                                    row_id: row.id,
                                  })
                                }
                              >
                                Associar
                              </Button>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Pagamentos registrados</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedPaymentsQuery.isLoading ? (
                        <p className="text-sm text-muted-foreground">Carregando pagamentos…</p>
                      ) : (selectedPaymentsQuery.data as PaymentRow[] | undefined)?.length ? (
                        (selectedPaymentsQuery.data as PaymentRow[]).map((payment) => (
                          <div
                            key={payment.id}
                            className="flex justify-between gap-3 border-b border-border py-2 last:border-0"
                          >
                            <span className="text-sm">
                              {dateLabel(payment.effective_date)} · {payment.account_name}
                            </span>
                            <span className="text-sm font-medium">
                              {money(payment.amount, selectedInvoice.currency_code)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nenhum pagamento registrado.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </section>
        </main>
      </div>
      <CardDialog
        key={editingCard?.id ?? "new-card"}
        open={cardDialog}
        card={editingCard}
        onOpenChange={(open) => {
          setCardDialog(open);
          if (!open) setEditingCard(null);
        }}
        accounts={activeAccounts}
        saving={cardMutation.isPending}
        onSave={(input) => cardMutation.mutate(input)}
      />
      <InvoiceDialog
        open={invoiceDialog}
        onOpenChange={setInvoiceDialog}
        cards={cards.filter((card) => card.is_active)}
        saving={invoiceMutation.isPending}
        onSave={(input) => invoiceMutation.mutate(input)}
      />
      {paymentInvoice && (
        <PaymentDialog
          invoice={paymentInvoice}
          defaultAccountId={
            cards.find((card) => card.id === paymentInvoice.card_id)?.payment_account_id ?? null
          }
          accounts={activeAccounts}
          saving={payMutation.isPending}
          onOpenChange={(open) => !open && setPaymentInvoice(null)}
          onSave={(input) => payMutation.mutate(input)}
        />
      )}
      <MobileNav />
    </div>
  );
}

function CardDialog({
  open,
  card,
  onOpenChange,
  accounts,
  saving,
  onSave,
}: {
  open: boolean;
  card: CardRow | null;
  onOpenChange: (open: boolean) => void;
  accounts: FinancialAccount[];
  saving: boolean;
  onSave: (input: CreditCardInput) => void;
}) {
  const [name, setName] = useState(card?.name ?? "");
  const [lastFour, setLastFour] = useState(card?.last_four ?? "");
  const [currency, setCurrency] = useState(card?.currency_code ?? "BRL");
  const [accountId, setAccountId] = useState(card?.payment_account_id ?? "");
  const [closingDay, setClosingDay] = useState(card?.closing_day ? String(card.closing_day) : "");
  const [dueDay, setDueDay] = useState(card?.due_day ? String(card.due_day) : "");
  const [error, setError] = useState<string | null>(null);
  const draft = {
    id: card?.id ?? null,
    name,
    last_four: lastFour || null,
    currency_code: currency,
    payment_account_id: accountId || null,
    closing_day: closingDay ? Number(closingDay) : null,
    due_day: dueDay ? Number(dueDay) : null,
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = creditCardInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    setError(null);
    onSave(parsed.data);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card ? "Editar cartão" : "Cadastrar cartão"}</DialogTitle>
          <DialogDescription>
            Não informe o número completo do cartão. Use apenas os quatro últimos dígitos, se
            desejar. Nesta versão, a moeda fica fixada após o cadastro para preservar os saldos das
            faturas.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <Label htmlFor="card-name">Nome</Label>
            <Input
              id="card-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Ex.: Cartão principal"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="card-last-four">Últimos 4 dígitos</Label>
              <Input
                id="card-last-four"
                inputMode="numeric"
                maxLength={4}
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <Label htmlFor="card-currency">Moeda</Label>
              <Input
                id="card-currency"
                maxLength={3}
                value={currency}
                disabled={!!card}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="card-account">Conta de pagamento (opcional)</Label>
            <select
              id="card-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Não definida</option>
              {accounts
                .filter(
                  (account) =>
                    account.currency_code === currency || account.id === card?.payment_account_id,
                )
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="card-close-day">Dia de fechamento</Label>
              <Input
                id="card-close-day"
                type="number"
                min={1}
                max={31}
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="card-due-day">Dia de vencimento</Label>
              <Input
                id="card-due-day"
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar cartão"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({
  open,
  onOpenChange,
  cards,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: CardRow[];
  saving: boolean;
  onSave: (input: InvoiceInput) => void;
}) {
  const [cardId, setCardId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [total, setTotal] = useState("");
  const [source, setSource] = useState<"manual" | "imported">("manual");
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = invoiceInputSchema.safeParse({
      card_id: cardId,
      period_start: periodStart,
      period_end: periodEnd,
      closing_date: closingDate || null,
      due_date: dueDate || null,
      total_amount: total,
      source,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    setError(null);
    onSave(parsed.data);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova fatura</DialogTitle>
          <DialogDescription>
            Informe os dados conhecidos da fatura. Compras e pagamentos não são inferidos.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <Label htmlFor="invoice-card">Cartão</Label>
            <select
              id="invoice-card"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} · {card.currency_code}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="invoice-period-start">Período inicial</Label>
              <Input
                id="invoice-period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invoice-period-end">Período final</Label>
              <Input
                id="invoice-period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="invoice-closing">Data de fechamento</Label>
              <Input
                id="invoice-closing"
                type="date"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invoice-due">Vencimento</Label>
              <Input
                id="invoice-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="invoice-total">Total da fatura</Label>
            <Input
              id="invoice-total"
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label htmlFor="invoice-origin">Origem dos dados</Label>
            <select
              id="invoice-origin"
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
              className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="manual">Informado manualmente</option>
              <option value="imported">Conferido a partir de fatura importada</option>
            </select>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || cards.length === 0}>
              {saving ? "Salvando…" : "Criar fatura aberta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  invoice,
  defaultAccountId,
  accounts,
  saving,
  onOpenChange,
  onSave,
}: {
  invoice: InvoiceRow;
  defaultAccountId: string | null;
  accounts: FinancialAccount[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: InvoicePaymentInput) => void;
}) {
  const idempotencyKey = useRef<string | null>(null);
  const [accountId, setAccountId] = useState(
    accounts.find(
      (account) =>
        account.id === defaultAccountId && account.currency_code === invoice.currency_code,
    )?.id ??
      accounts.find((account) => account.currency_code === invoice.currency_code)?.id ??
      "",
  );
  const [date, setDate] = useState(localDate());
  const [amount, setAmount] = useState(invoice.remaining_amount);
  const [error, setError] = useState<string | null>(null);
  const compatibleAccounts = accounts.filter(
    (account) => account.currency_code === invoice.currency_code,
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    idempotencyKey.current ??= crypto.randomUUID();
    const parsed = invoicePaymentSchema.safeParse({
      invoice_id: invoice.id,
      account_id: accountId,
      effective_date: date,
      amount,
      idempotency_key: idempotencyKey.current,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    const paymentCents = decimalAmountToCents(parsed.data.amount);
    if (
      paymentCents === null ||
      remainingInvoiceCents(invoice.total_amount, invoice.paid_amount) < paymentCents
    ) {
      setError("O pagamento excede o saldo em aberto.");
      return;
    }
    setError(null);
    onSave(parsed.data);
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>
            Pagamento da fatura {invoice.card_name}; será criada uma saída no livro-caixa, sem novo
            lançamento de consumo.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <Label htmlFor="payment-account">Conta de pagamento</Label>
            <select
              id="payment-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione</option>
              {compatibleAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency_code}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="payment-date">Data efetiva</Label>
              <Input
                id="payment-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="payment-amount">
                Valor (até {money(invoice.remaining_amount, invoice.currency_code)})
              </Label>
              <Input
                id="payment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || compatibleAccounts.length === 0}>
              {saving ? "Registrando…" : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
