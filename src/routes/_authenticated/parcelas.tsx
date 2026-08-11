import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Plus, Trash2, AlertTriangle, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { InstallPWAButton } from "@/components/install-pwa-button";
import { PageTabs } from "@/components/page-tabs";
import { MobileNav } from "@/components/mobile-nav";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  addInstallment,
  deleteInstallment,
  getSettings,
  listInstallments,
  upsertLimit,
} from "@/lib/installments.functions";

export const Route = createFileRoute("/_authenticated/parcelas")({
  head: () => ({
    meta: [
      { title: "Parcelas — Month Check" },
      { name: "description", content: "Controle de gastos parcelados e limite mensal." },
    ],
  }),
  component: ParcelasPage,
});

type Installment = {
  id: string;
  name: string;
  first_date: string;
  installment_value: number;
  total_installments: number;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function parseDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}
function addMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
function monthLabel(d: Date) {
  return `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
}
function monthsBetween(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function computeStatus(it: Installment) {
  const start = parseDate(it.first_date);
  const today = new Date();
  const total = it.total_installments;
  const elapsed = monthsBetween(start, today);
  const paid = Math.max(0, Math.min(total, elapsed + 1));
  const remaining = Math.max(0, total - paid);
  const endDate = addMonths(start, total - 1);
  const isActive = remaining > 0;
  const totalPaid = Number(it.installment_value) * total;
  return { start, endDate, paid, remaining, isActive, totalPaid, total };
}

function ParcelasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchSettings = useServerFn(getSettings);
  const saveLimit = useServerFn(upsertLimit);
  const fetchList = useServerFn(listInstallments);
  const addFn = useServerFn(addInstallment);
  const deleteFn = useServerFn(deleteInstallment);

  const settingsKey = ["installment-settings"] as const;
  const listKey = ["installments"] as const;

  const { data: settings } = useQuery({
    queryKey: settingsKey,
    queryFn: () => fetchSettings() as Promise<{ monthly_limit: number }>,
  });
  const { data: installments = [] } = useQuery({
    queryKey: listKey,
    queryFn: () => fetchList() as Promise<Installment[]>,
  });

  // Limit input — debounced auto-save
  const [limitInput, setLimitInput] = useState<string>("");
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limitFocused = useRef(false);
  useEffect(() => {
    if (!settings) return;
    if (limitFocused.current) return;
    const localNum = parseFloat(limitInput.replace(",", ".")) || 0;
    const serverNum = Number(settings.monthly_limit) || 0;
    if (localNum !== serverNum) setLimitInput(String(serverNum));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.monthly_limit]);

  const limitMutation = useMutation({
    mutationFn: (monthly_limit: number) => saveLimit({ data: { monthly_limit } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKey }),
  });

  function onLimitChange(v: string) {
    setLimitInput(v);
    const n = Number(v.replace(",", ".")) || 0;
    if (limitTimer.current) clearTimeout(limitTimer.current);
    limitTimer.current = setTimeout(() => limitMutation.mutate(n), 1000);
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  // Split active / history
  const annotated = useMemo(
    () => installments.map((i) => ({ ...i, status: computeStatus(i) })),
    [installments],
  );
  const active = useMemo(
    () =>
      annotated
        .filter((i) => i.status.isActive)
        .sort((a, b) => a.status.endDate.getTime() - b.status.endDate.getTime()),
    [annotated],
  );
  const history = useMemo(
    () =>
      annotated
        .filter((i) => !i.status.isActive)
        .sort((a, b) => b.status.endDate.getTime() - a.status.endDate.getTime()),
    [annotated],
  );

  const limit = Number(settings?.monthly_limit ?? 0);
  const totalCommitted = useMemo(
    () => active.reduce((s, i) => s + Number(i.installment_value), 0),
    [active],
  );
  const pct = limit > 0 ? Math.min(100, (totalCommitted / limit) * 100) : 0;
  const available = Math.max(0, limit - totalCommitted);

  const endingSoon = useMemo(() => {
    const cutoff = addMonths(new Date(), 2);
    return active.filter((i) => i.status.endDate <= cutoff).length;
  }, [active]);

  const largest = useMemo(() => {
    if (active.length === 0) return null;
    return active.reduce((a, b) =>
      Number(a.installment_value) >= Number(b.installment_value) ? a : b,
    );
  }, [active]);

  const progressColor =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  // New purchase modal
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6 sm:px-8 sm:py-8 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo height={40} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-3xl">Month Check</h1>
              <p className="text-sm text-muted-foreground">Gastos parcelados</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <InstallPWAButton />
            <button
              onClick={signOut}
              className="neu-pressable inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <div className="mb-6">
          <PageTabs />
        </div>

        {/* Limite mensal */}
        <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Limite mensal para parcelas
              </Label>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={limitInput}
                  onFocus={() => { limitFocused.current = true; }}
                  onBlur={() => { limitFocused.current = false; }}
                  onChange={(e) => onLimitChange(e.target.value)}
                  className="neu-inset w-40 rounded-xl bg-transparent px-3 py-2 text-lg font-semibold tabular-nums outline-none"
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <div>
                <span className="font-semibold text-foreground">{brl.format(totalCommitted)}</span>{" "}
                de {brl.format(limit)} comprometidos
              </div>
              <div className="text-xs">Disponível: {brl.format(available)}</div>
            </div>
          </div>

          <div className="neu-inset h-3 w-full overflow-hidden rounded-full">
            <div
              className={`h-full transition-all ${progressColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 text-right text-xs text-muted-foreground">
            {pct.toFixed(0)}% do limite
          </div>
        </section>

        {/* Resumo */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <SummaryCard label="Total comprometido" value={brl.format(totalCommitted)} />
          <SummaryCard
            label="Próximas a vencer (2 meses)"
            value={String(endingSoon)}
            sub="compras finalizando em breve"
          />
          <SummaryCard
            label="Maior parcela"
            value={largest ? brl.format(Number(largest.installment_value)) : "—"}
            sub={largest?.name || "nenhuma ativa"}
          />
        </div>

        {/* Lista de ativas */}
        <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Parcelas ativas
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Ordenadas pelas que terminam primeiro.
              </div>
            </div>
            <button
              onClick={() => setOpen(true)}
              className="neu-pressable inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-primary"
            >
              <Plus className="h-4 w-4" /> Nova Compra
            </button>
          </div>

          {active.length === 0 ? (
            <div className="neu-inset rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma compra parcelada ativa. Clique em "Nova Compra" para começar.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {active.map((it) => {
                const s = it.status;
                const progressPct = (s.paid / s.total) * 100;
                return (
                  <div key={it.id} className="neu-inset rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold">{it.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {brl.format(Number(it.installment_value))} / mês
                        </div>
                      </div>
                      <button
                        onClick={() => deleteMutation.mutate(it.id)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-red-500"
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {s.paid}/{s.total} parcelas
                      </span>
                      <span>Termina em {monthLabel(s.endDate)}</span>
                    </div>
                    <div className="neu-inset mt-2 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Histórico */}
        <section className="neu-raised mb-8 rounded-2xl p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Histórico (quitadas)
            </div>
          </div>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Compras quitadas aparecem aqui automaticamente.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {history.map((it) => {
                const s = it.status;
                return (
                  <div key={it.id} className="neu-inset rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold">{it.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Total pago: {brl.format(s.totalPaid)}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteMutation.mutate(it.id)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-red-500"
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {monthLabel(s.start)} → {monthLabel(s.endDate)} · quitada em {monthLabel(s.endDate)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <NewPurchaseDialog
        open={open}
        onOpenChange={setOpen}
        totalCommitted={totalCommitted}
        limit={limit}
        onCreate={async (payload) => {
          await addFn({ data: payload });
          await queryClient.invalidateQueries({ queryKey: listKey });
          setOpen(false);
        }}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="neu-raised rounded-2xl p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-primary">{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function NewPurchaseDialog({
  open,
  onOpenChange,
  totalCommitted,
  limit,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  totalCommitted: number;
  limit: number;
  onCreate: (p: {
    name: string;
    first_date: string;
    installment_value: number;
    total_installments: number;
  }) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [firstDate, setFirstDate] = useState(today);
  const [count, setCount] = useState<number>(12);
  const [mode, setMode] = useState<"total" | "monthly">("total");
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setFirstDate(today);
      setCount(12);
      setMode("total");
      setAmount("");
    }
  }, [open]);

  const numAmount = Number(amount.replace(",", ".")) || 0;
  const total = mode === "total" ? numAmount : numAmount * count;
  const monthly = mode === "monthly" ? numAmount : count > 0 ? numAmount / count : 0;

  const wouldExceed = limit > 0 && totalCommitted + monthly > limit;
  const overflow = totalCommitted + monthly - limit;
  const available = Math.max(0, limit - totalCommitted);

  const canSubmit = name.trim().length > 0 && firstDate && count >= 1 && monthly > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        first_date: firstDate,
        installment_value: Number(monthly.toFixed(2)),
        total_installments: count,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova compra parcelada</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome da compra</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Notebook, TV"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data da 1ª parcela</Label>
              <Input
                type="date"
                value={firstDate}
                onChange={(e) => setFirstDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Nº de parcelas</Label>
              <Input
                type="number"
                min={1}
                max={360}
                value={count}
                onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Modo de registro</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "total" | "monthly")}
              className="mt-2 grid grid-cols-2 gap-2"
            >
              <label className="neu-inset flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm">
                <RadioGroupItem value="total" id="m-total" />
                <span>Valor total</span>
              </label>
              <label className="neu-inset flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm">
                <RadioGroupItem value="monthly" id="m-monthly" />
                <span>Valor mensal</span>
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label>{mode === "total" ? "Valor total (R$)" : "Valor da parcela (R$)"}</Label>
            <Input
              type="text"
              inputMode="decimal"
              pattern="[0-9.,]*"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="mt-1"
            />
          </div>

          {/* Preview */}
          <div className="neu-inset rounded-xl p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Valor total</span>
              <span className="font-semibold">{brl.format(total)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Valor mensal</span>
              <span className="font-semibold">{brl.format(monthly)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{count}x</span>
              <span>{count > 0 ? brl.format(monthly) : "—"} / mês</span>
            </div>
          </div>

          {wouldExceed && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Limite excedido</div>
                <div className="text-xs">
                  Excederia em {brl.format(overflow)}. Disponível: {brl.format(available)}.
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="neu-pressable rounded-xl px-4 py-2 text-sm text-muted-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="neu-pressable rounded-xl px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"
          >
            {submitting ? "Salvando..." : "Salvar compra"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
