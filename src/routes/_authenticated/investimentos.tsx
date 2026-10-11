import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LogOut, Plus, Trash2, TrendingUp, Wallet, Coins } from "lucide-react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { InstallPWAButton } from "@/components/install-pwa-button";
import { PageTabs } from "@/components/page-tabs";
import { MobileNav } from "@/components/mobile-nav";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { listFinancialAccounts } from "@/lib/financial-accounts.functions";
import { toast } from "sonner";
import { listInvestmentValuations, listInvestmentOperationReversals, reverseInvestmentCashOperation } from "@/lib/financial-reconciliation.functions";
import {
  listAtivos,
  createAtivo,
  deleteAtivo,
  listAportes,
  createAporte,
  deleteAporte,
  listProventos,
  createProvento,
  deleteProvento,
  updateAtivoCurrentValue,
  createCashLinkedContribution,
  createInvestmentRedemption,
  recordInvestmentDividendReceipt,
  listInvestmentCashOperations,
} from "@/lib/investments-portfolio.functions";

export const Route = createFileRoute("/_authenticated/investimentos")({
  head: () => ({
    meta: [
      { title: "Investimentos — Month Check" },
      { name: "description", content: "Gestão de ativos, aportes e proventos." },
      { property: "og:title", content: "Investimentos — Month Check" },
      { property: "og:description", content: "Gestão de ativos, aportes e proventos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvestimentosPage,
});

type AssetType = "acao" | "fii" | "renda_fixa" | "cripto";
type ProvType = "dividendo" | "jcp" | "rendimento" | "cupom";
type ProvStatus = "a_reinvestir" | "reinvestido";

type Ativo = {
  id: string;
  tipo: AssetType;
  nome: string;
  corretora: string | null;
  saldo_atual: number;
  currency_code: string;
  current_value_known: boolean;
  current_value_date: string | null;
};
type Aporte = {
  id: string;
  ativo_id: string;
  data: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  taxas: number;
  is_retroativo: boolean;
};
type Provento = {
  id: string;
  ativo_id: string;
  tipo: ProvType;
  data_recebimento: string;
  valor: number;
  status: ProvStatus;
  aporte_reinvestimento_id: string | null;
};

type InvestmentCashOperation = {
  id: string;
  asset_id: string;
  operation_type: string;
  effective_date: string;
  amount: number;
  currency_code: string;
  description: string;
  aporte_id: string | null;
  provento_id: string | null;
};

function currency(value: number, currencyCode = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currencyCode }).format(value);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function groupedCurrencyValue(rows: { assetId: string; value: number }[], assets: Ativo[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const code = assets.find((asset) => asset.id === row.assetId)?.currency_code;
    if (code) totals.set(code, (totals.get(code) ?? 0) + row.value);
  }
  return [...totals.entries()].map(([code, value]) => currency(value, code)).join(" · ") || currency(0, "BRL");
}
const MES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const TIPO_LABEL: Record<AssetType, string> = {
  acao: "Ações",
  fii: "FIIs",
  renda_fixa: "Renda Fixa",
  cripto: "Cripto",
};
const PROV_LABEL: Record<ProvType, string> = {
  dividendo: "Dividendo",
  jcp: "JCP",
  rendimento: "Rendimento",
  cupom: "Cupom",
};

function ymKey(d: string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}
function ymLabel(k: string) {
  const [y, m] = k.split("-").map(Number);
  return `${MES_ABBR[(m ?? 1) - 1]}/${String(y).slice(-2)}`;
}
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function InvestimentosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchAtivos = useServerFn(listAtivos);
  const fetchAportes = useServerFn(listAportes);
  const fetchProventos = useServerFn(listProventos);
  const fetchAccounts = useServerFn(listFinancialAccounts);
  const fetchCashOperations = useServerFn(listInvestmentCashOperations);
  const addAtivo = useServerFn(createAtivo);
  const rmAtivo = useServerFn(deleteAtivo);
  const addAporte = useServerFn(createAporte);
  const rmAporte = useServerFn(deleteAporte);
  const addProvento = useServerFn(createProvento);
  const rmProvento = useServerFn(deleteProvento);
  const saveCurrentValue = useServerFn(updateAtivoCurrentValue);
  const addLinkedContribution = useServerFn(createCashLinkedContribution);
  const addRedemption = useServerFn(createInvestmentRedemption);
  const receiveDividend = useServerFn(recordInvestmentDividendReceipt);
  const fetchValuations = useServerFn(listInvestmentValuations);
  const fetchReversals = useServerFn(listInvestmentOperationReversals);
  const reverseOperation = useServerFn(reverseInvestmentCashOperation);

  const { data: ativos = [] } = useQuery({
    queryKey: ["ativos"],
    queryFn: () => fetchAtivos() as Promise<Ativo[]>,
  });
  const { data: aportes = [] } = useQuery({
    queryKey: ["aportes"],
    queryFn: () => fetchAportes() as Promise<Aporte[]>,
  });
  const { data: proventos = [] } = useQuery({
    queryKey: ["proventos"],
    queryFn: () => fetchProventos() as Promise<Provento[]>,
  });
  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: () => fetchAccounts(),
  });
  const { data: cashOperations = [] } = useQuery({
    queryKey: ["investment-cash-operations"],
    queryFn: () => fetchCashOperations() as Promise<InvestmentCashOperation[]>,
  });
  const { data: valuations = [] } = useQuery({
    queryKey: ["investment-valuations"],
    queryFn: () => fetchValuations({ data: { asset_id: null } }),
  });
  const { data: reversals = [] } = useQuery({
    queryKey: ["investment-operation-reversals"],
    queryFn: () => fetchReversals(),
  });
  const reversedOperationIds = new Set(reversals.map((row) => row.source_operation_id));
  const reversedAporteIds = new Set(cashOperations.filter((operation) => reversedOperationIds.has(operation.id) && operation.aporte_id).map((operation) => operation.aporte_id as string));
  const reversedProventoIds = new Set(cashOperations.filter((operation) => reversedOperationIds.has(operation.id) && operation.provento_id).map((operation) => operation.provento_id as string));
  const activeAportes = aportes.filter((aporte) => !reversedAporteIds.has(aporte.id));
  const activeProventos = proventos.filter((provento) => !reversedProventoIds.has(provento.id));

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["ativos"] });
    qc.invalidateQueries({ queryKey: ["aportes"] });
    qc.invalidateQueries({ queryKey: ["proventos"] });
    qc.invalidateQueries({ queryKey: ["financial-accounts"] });
    qc.invalidateQueries({ queryKey: ["investment-cash-operations"] });
    qc.invalidateQueries({ queryKey: ["investment-valuations"] });
    qc.invalidateQueries({ queryKey: ["investment-operation-reversals"] });
    qc.invalidateQueries({ queryKey: ["known-net-worth"] });
    qc.invalidateQueries({ queryKey: ["patrimony-accumulated"] });
  };

  // --- Métricas por ativo (custo médio, patrimônio a custo, proventos totais) ---
  const porAtivo = useMemo(() => {
    const map = new Map<
      string,
      { qtd: number; investido: number; proventos: number }
    >();
    for (const a of ativos) map.set(a.id, { qtd: 0, investido: 0, proventos: 0 });
    for (const ap of activeAportes) {
      const cur = map.get(ap.ativo_id);
      if (!cur) continue;
      cur.qtd += Number(ap.quantidade);
      cur.investido += Number(ap.valor_total);
    }
    for (const pv of activeProventos) {
      const cur = map.get(pv.ativo_id);
      if (!cur) continue;
      cur.proventos += Number(pv.valor);
    }
    return map;
  }, [ativos, activeAportes, activeProventos]);

  const totalInvestidoLabel = groupedCurrencyValue(activeAportes.map((item) => ({ assetId: item.ativo_id, value: Number(item.valor_total) })), ativos);
  const totalProventosLabel = groupedCurrencyValue(activeProventos.map((item) => ({ assetId: item.ativo_id, value: Number(item.valor) })), ativos);
  const proventosReinvestidosLabel = groupedCurrencyValue(activeProventos.filter((item) => item.status === "reinvestido").map((item) => ({ assetId: item.ativo_id, value: Number(item.valor) })), ativos);
  const proventosPendentesLabel = groupedCurrencyValue(activeProventos.filter((item) => item.status !== "reinvestido").map((item) => ({ assetId: item.ativo_id, value: Number(item.valor) })), ativos);
  // A ausência de saldo informado não pode ser confundida com valor de mercado zero.
  const knownCurrentAssets = ativos.filter((ativo) => ativo.current_value_known);
  const currentValueByCurrency = knownCurrentAssets.reduce<Record<string, number>>((totals, ativo) => {
    totals[ativo.currency_code] = (totals[ativo.currency_code] ?? 0) + Number(ativo.saldo_atual);
    return totals;
  }, {});
  const currentValueLabel = Object.entries(currentValueByCurrency).length
    ? Object.entries(currentValueByCurrency).map(([code, value]) => currency(value, code)).join(" · ")
    : "Não informado";

  // --- Filtro do gráfico ---
  const [filtroTipo, setFiltroTipo] = useState<AssetType | "todos">("todos");
  const [filtroMoeda, setFiltroMoeda] = useState("");
  const availableCurrencies = [...new Set(ativos.map((asset) => asset.currency_code))].sort();
  const selectedCurrency = filtroMoeda || (availableCurrencies.includes("BRL") ? "BRL" : availableCurrencies[0] ?? "BRL");
  const ativosFiltro = useMemo(() => {
    return new Set(ativos.filter((a) => (filtroTipo === "todos" || a.tipo === filtroTipo) && a.currency_code === selectedCurrency).map((a) => a.id));
  }, [ativos, filtroTipo, selectedCurrency]);

  const chartData = useMemo(() => {
    // acumula por mês somando aportes (patrimônio a custo) por tipo
    const buckets = new Map<
      string,
      { acao: number; fii: number; renda_fixa: number; cripto: number; total: number }
    >();
    const sorted = [...aportes]
      .filter((a) => ativosFiltro.has(a.ativo_id))
      .sort((a, b) => a.data.localeCompare(b.data));
    if (sorted.length === 0) return [];
    // agrupa mensalmente
    const monthly = new Map<string, { acao: number; fii: number; renda_fixa: number; cripto: number }>();
    for (const ap of sorted) {
      const tipo = ativos.find((a) => a.id === ap.ativo_id)?.tipo;
      if (!tipo) continue;
      const k = ymKey(ap.data);
      let m = monthly.get(k);
      if (!m) {
        m = { acao: 0, fii: 0, renda_fixa: 0, cripto: 0 };
        monthly.set(k, m);
      }
      m[tipo] += Number(ap.valor_total);
    }
    // preenche meses faltantes entre primeiro e último
    const keys = Array.from(monthly.keys()).sort();
    if (keys.length === 0) return [];
    const [fy, fm] = keys[0].split("-").map(Number);
    const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
    const cursor = new Date(fy, fm - 1, 1);
    const end = new Date(ly, lm - 1, 1);
    const acc = { acao: 0, fii: 0, renda_fixa: 0, cripto: 0 };
    while (cursor <= end) {
      const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const m = monthly.get(k);
      if (m) {
        acc.acao += m.acao;
        acc.fii += m.fii;
        acc.renda_fixa += m.renda_fixa;
        acc.cripto += m.cripto;
      }
      buckets.set(k, {
        ...acc,
        total: acc.acao + acc.fii + acc.renda_fixa + acc.cripto,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return Array.from(buckets.entries()).map(([k, v]) => ({ mes: ymLabel(k), ...v }));
  }, [aportes, ativos, ativosFiltro]);

  // --- Agrupamento visual da lista de ativos por tipo ---
  const grupos = useMemo(() => {
    const g = new Map<AssetType, Ativo[]>();
    for (const a of ativos) {
      const arr = g.get(a.tipo) ?? [];
      arr.push(a);
      g.set(a.tipo, arr);
    }
    return g;
  }, [ativos]);

  const [openAtivo, setOpenAtivo] = useState(false);
  const [openAporte, setOpenAporte] = useState(false);
  const [openProvento, setOpenProvento] = useState(false);
  const [openCashOperation, setOpenCashOperation] = useState(false);
  const [cashOperationMode, setCashOperationMode] = useState<"contribution" | "redemption" | "dividend_received">("contribution");
  const [currentValueInputs, setCurrentValueInputs] = useState<Record<string, string>>({});
  const [currentValueDates, setCurrentValueDates] = useState<Record<string, string>>({});
  const [currentValueNotes, setCurrentValueNotes] = useState<Record<string, string>>({});

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="finance-app min-h-screen px-4 pb-24 pt-4 sm:px-8 sm:py-6 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo height={40} />
            <div className="min-w-0">
              <h1 className="finance-app-title truncate text-xl sm:text-3xl">Month Check</h1>
              <p className="text-sm text-muted-foreground">Investimentos</p>
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

        {/* Resumo */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <SummaryCard
            icon={<Wallet className="h-4 w-4" />}
            label="Aportes registrados"
            value={totalInvestidoLabel}
            sub="Inclui aportes com proventos reinvestidos"
          />
          <SummaryCard
            icon={<Coins className="h-4 w-4" />}
            label="Proventos registrados"
            value={totalProventosLabel}
            sub={`${proventos.length} registros; recebimento em conta só conta quando vinculado`}
          />
          <SummaryCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Reinvestidos"
            value={proventosReinvestidosLabel}
            sub={`${proventosPendentesLabel} não reinvestidos`}
          />
          <SummaryCard
            icon={<Wallet className="h-4 w-4" />}
            label="Valor atual informado"
            value={currentValueLabel}
            sub={`${knownCurrentAssets.length} de ${ativos.length} ativos com valor confirmado; somas separadas por moeda`}
          />
        </div>
        <p className="mb-6 text-xs text-muted-foreground">
          {ativos.length} {ativos.length === 1 ? "ativo" : "ativos"} · {aportes.length} {aportes.length === 1 ? "aporte" : "aportes"}. Aportes registrados não representam o valor atual dos ativos.
        </p>

        {/* Ações rápidas */}
        <div className="mb-6 flex flex-wrap gap-2">
          <ActionButton onClick={() => setOpenAtivo(true)}>
            <Plus className="h-4 w-4" /> Novo Ativo
          </ActionButton>
          <ActionButton onClick={() => setOpenAporte(true)} disabled={ativos.length === 0}>
            <Plus className="h-4 w-4" /> Novo Aporte
          </ActionButton>
          <ActionButton onClick={() => setOpenProvento(true)} disabled={ativos.length === 0}>
            <Plus className="h-4 w-4" /> Novo Provento
          </ActionButton>
          <ActionButton onClick={() => { setCashOperationMode("contribution"); setOpenCashOperation(true); }} disabled={ativos.length === 0 || financialAccounts.filter((a) => a.is_active && a.account_type !== "benefit_wallet").length === 0}>
            <Plus className="h-4 w-4" /> Aporte ou resgate pelo caixa
          </ActionButton>
          <ActionButton onClick={() => { setCashOperationMode("dividend_received"); setOpenCashOperation(true); }} disabled={ativos.length === 0 || proventos.length === 0 || financialAccounts.filter((a) => a.is_active && a.account_type !== "benefit_wallet").length === 0}>
            <Coins className="h-4 w-4" /> Registrar provento recebido em conta
          </ActionButton>
        </div>

        {/* Gráfico */}
        <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Evolução dos aportes
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Soma acumulada dos aportes registrados em {selectedCurrency} (não é valor atual de mercado).
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={selectedCurrency} onValueChange={setFiltroMoeda}>
                <SelectTrigger className="neu-inset w-28 border-0"><SelectValue /></SelectTrigger>
                <SelectContent>{availableCurrencies.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as AssetType | "todos")}>
                <SelectTrigger className="neu-inset w-40 border-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="acao">Ações</SelectItem>
                  <SelectItem value="fii">FIIs</SelectItem>
                  <SelectItem value="renda_fixa">Renda Fixa</SelectItem>
                  <SelectItem value="cripto">Cripto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="neu-inset rounded-xl px-4 py-12 text-center text-sm text-muted-foreground">
              Registre aportes para ver sua evolução.
            </div>
          ) : (
            <div className="h-52 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAcao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gFii" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gRf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gCr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-5)" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="var(--color-chart-5)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => currency(Number(v), selectedCurrency).replace(selectedCurrency, "").trim()}
                  />
                  <Tooltip
                    formatter={(v: number, name) => [currency(Number(v), selectedCurrency), TIPO_LABEL[name as AssetType] || name]}
                  />
                  <Legend formatter={(v) => TIPO_LABEL[v as AssetType] || v} />
                  <Area type="monotone" dataKey="acao" stackId="1" stroke="var(--color-chart-1)" fill="url(#gAcao)" />
                  <Area type="monotone" dataKey="fii" stackId="1" stroke="var(--color-chart-2)" fill="url(#gFii)" />
                  <Area type="monotone" dataKey="renda_fixa" stackId="1" stroke="var(--color-chart-3)" fill="url(#gRf)" />
                  <Area type="monotone" dataKey="cripto" stackId="1" stroke="var(--color-chart-5)" fill="url(#gCr)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Ativos agrupados */}
        <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Meus ativos
          </div>
          {ativos.length === 0 ? (
            <div className="neu-inset rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
              Cadastre seu primeiro ativo para começar.
            </div>
          ) : (
            <div className="space-y-6">
              {(["acao", "fii", "renda_fixa", "cripto"] as AssetType[])
                .filter((t) => grupos.get(t)?.length)
                .map((tipo) => (
                  <div key={tipo}>
                    <div className="mb-2 text-sm font-semibold text-primary">{TIPO_LABEL[tipo]}</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {grupos.get(tipo)!.map((a) => {
                        const m = porAtivo.get(a.id) ?? { qtd: 0, investido: 0, proventos: 0 };
                        const custoMedio = m.qtd > 0 ? m.investido / m.qtd : 0;
                        return (
                          <div key={a.id} className="finance-line py-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-base font-semibold">{a.nome}</div>
                                <div className="text-xs text-muted-foreground">
                                  {a.corretora || "sem corretora"}
                                </div>
                              </div>
                              <button
                                onClick={() => rmAtivo({ data: { id: a.id } }).then(invalidateAll)}
                                className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
                                aria-label="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              <Metric label="Qtd" value={m.qtd.toLocaleString("pt-BR")} />
                              <Metric label="Aportes" value={currency(m.investido, a.currency_code)} />
                              <Metric label="Custo médio" value={currency(custoMedio, a.currency_code)} />
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Proventos: <span className="font-semibold text-foreground">{currency(m.proventos, a.currency_code)}</span>
                            </div>
                            <div className="mt-3 border-t border-border/60 pt-3">
                              <div className="mb-1 text-xs text-muted-foreground">
                                Valor atual de mercado: {a.current_value_known ? `${currency(Number(a.saldo_atual), a.currency_code)} em ${a.current_value_date ?? "data não informada"}` : "desconhecido"} · {a.currency_code}
                              </div>
                              <div className="mb-2 text-[11px] text-muted-foreground">
                                Histórico: {valuations.filter((valuation) => valuation.asset_id === a.id).slice(0, 3).map((valuation) => `${valuation.reference_date} · ${currency(Number(valuation.market_value), a.currency_code)}`).join(" | ") || "nenhuma avaliação registrada nesta etapa"}
                              </div>
                              <div className="flex gap-2">
                                <Input
                                  aria-label={`Valor atual de ${a.nome}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Informe o valor atual"
                                  value={currentValueInputs[a.id] ?? (a.current_value_known ? String(a.saldo_atual) : "")}
                                  onChange={(event) => setCurrentValueInputs((current) => ({ ...current, [a.id]: event.target.value }))}
                                  className="h-9"
                                />
                                <Input
                                  aria-label={`Data do valor de mercado de ${a.nome}`}
                                  type="date"
                                  value={currentValueDates[a.id] ?? a.current_value_date ?? ""}
                                  onChange={(event) => setCurrentValueDates((current) => ({ ...current, [a.id]: event.target.value }))}
                                  className="h-9 w-36"
                                />
                                <button
                                  className="neu-pressable shrink-0 rounded-lg px-3 text-xs font-semibold"
                                  onClick={async () => {
                                    const value = currentValueInputs[a.id];
                                    const valueDate = currentValueDates[a.id] ?? a.current_value_date;
                                    if (value == null || value.trim() === "" || Number(value) < 0 || !valueDate) return;
                                    try {
                                      await saveCurrentValue({ data: { id: a.id, current_value: value, current_value_date: valueDate, note: currentValueNotes[a.id] } });
                                      invalidateAll();
                                      toast.success("Valor de mercado atualizado.");
                                    } catch (error) {
                                      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o valor.");
                                    }
                                  }}
                                >
                                  Confirmar
                                </button>
                              </div>
                              <Input
                                aria-label={`Observação da avaliação de ${a.nome}`}
                                maxLength={500}
                                placeholder="Observação da avaliação (opcional)"
                                value={currentValueNotes[a.id] ?? ""}
                                onChange={(event) => setCurrentValueNotes((current) => ({ ...current, [a.id]: event.target.value }))}
                                className="mt-2 h-9"
                              />
                              <p className="mt-1 text-[11px] text-muted-foreground">A avaliação só será atual se sua data cobrir a operação de investimento mais recente. O histórico informado não é apagado.</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Movimentos de investimento vinculados ao caixa</div>
          <p className="mb-3 text-xs text-muted-foreground">Aportes vinculados geram uma saída da conta e um aporte; resgates geram uma entrada. Esses movimentos não alteram o orçamento pessoal.</p>
          {cashOperations.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum movimento de investimento vinculado ao caixa.</div>
          ) : (
            <div className="space-y-2">
              {cashOperations.slice(0, 20).map((operation) => (
                <div key={operation.id} className="finance-line flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <span>{operation.effective_date} · {ativos.find((item) => item.id === operation.asset_id)?.nome ?? "Ativo"} · {operation.description}{reversals.find((item) => item.source_operation_id === operation.id) ? ` · Revertida: ${reversals.find((item) => item.source_operation_id === operation.id)?.reason}` : ""}</span>
                  <span className="flex items-center gap-2"><span className="shrink-0 font-semibold">{currency(Number(operation.amount), operation.currency_code)}</span>{!reversals.some((item) => item.source_operation_id === operation.id) && <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={async () => { const reason = window.prompt("Motivo da reversão (será registrado no histórico):"); if (!reason?.trim()) return; try { await reverseOperation({ data: { operation_id: operation.id, effective_date: localDate(), reason: reason.trim() } }); invalidateAll(); toast.success("Reversão registrada como movimento compensatório."); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível reverter a operação."); } }}>Reverter</button>}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Aportes */}
        <section className="neu-raised mb-6 rounded-2xl p-4 sm:p-6">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Aportes recentes
          </div>
          {aportes.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum aporte registrado.</div>
          ) : (
            <div className="space-y-2">
              {aportes.slice(0, 20).map((ap) => {
                const a = ativos.find((x) => x.id === ap.ativo_id);
                return (
                  <div key={ap.id} className="finance-line flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {a?.nome ?? "?"}{" "}
                        {reversedAporteIds.has(ap.id) && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-800 dark:bg-amber-950 dark:text-amber-200">revertido</span>}
                        {ap.is_retroativo && (
                          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            retroativo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(ap.data).toLocaleDateString("pt-BR")} · {Number(ap.quantidade).toLocaleString("pt-BR")} × {currency(Number(ap.valor_unitario), a?.currency_code ?? "BRL")}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-primary">{currency(Number(ap.valor_total), a?.currency_code ?? "BRL")}</div>
                      {!reversedAporteIds.has(ap.id) && <button
                        onClick={() => rmAporte({ data: { id: ap.id } }).then(invalidateAll)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Proventos */}
        <section className="neu-raised mb-8 rounded-2xl p-4 sm:p-6">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Proventos
          </div>
          {proventos.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum provento registrado.</div>
          ) : (
            <div className="space-y-2">
              {proventos.map((pv) => {
                const a = ativos.find((x) => x.id === pv.ativo_id);
                const receivedInCash = cashOperations.some((operation) => operation.provento_id === pv.id && operation.operation_type === "dividend_received");
                const statusLabel = pv.status === "reinvestido"
                  ? receivedInCash ? "Recebido e reinvestido" : "Reinvestido"
                  : receivedInCash ? "Recebido em conta" : "A reinvestir";
                return (
                  <div key={pv.id} className="finance-line flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {a?.nome ?? "?"}{" "}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          · {PROV_LABEL[pv.tipo]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(pv.data_recebimento).toLocaleDateString("pt-BR")} ·{" "}
                        <span
                          className={
                            pv.status === "reinvestido"
                              ? "font-semibold text-primary"
                              : "font-semibold text-amber-600 dark:text-amber-300"
                          }
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-primary">{currency(Number(pv.valor), a?.currency_code ?? "BRL")}</div>
                      <button
                        onClick={() => rmProvento({ data: { id: pv.id } }).then(invalidateAll)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <NovoAtivoDialog
        open={openAtivo}
        onOpenChange={setOpenAtivo}
        onCreate={async (payload) => {
          await addAtivo({ data: payload });
          invalidateAll();
          setOpenAtivo(false);
        }}
      />
      <NovoAporteDialog
        open={openAporte}
        onOpenChange={setOpenAporte}
        ativos={ativos}
        proventos={proventos.filter((p) => p.status === "a_reinvestir" && !cashOperations.some((operation) => operation.provento_id === p.id))}
        onCreate={async (payload) => {
          await addAporte({ data: payload });
          invalidateAll();
          setOpenAporte(false);
        }}
      />
      <NovoProventoDialog
        open={openProvento}
        onOpenChange={setOpenProvento}
        ativos={ativos}
        onCreate={async (payload) => {
          await addProvento({ data: payload });
          invalidateAll();
          setOpenProvento(false);
        }}
      />
      <CashOperationDialog
        open={openCashOperation}
        mode={cashOperationMode}
        onModeChange={setCashOperationMode}
        onOpenChange={setOpenCashOperation}
        assets={ativos}
        accounts={financialAccounts.filter((account) => account.is_active && account.account_type !== "benefit_wallet")}
        availableDividends={proventos.filter((item) => item.status === "a_reinvestir" && cashOperations.some((operation) => operation.provento_id === item.id && operation.operation_type === "dividend_received"))}
        pendingReceipts={proventos.filter((item) => item.status === "a_reinvestir" && !cashOperations.some((operation) => operation.provento_id === item.id))}
        onSubmit={async (payload) => {
          if (payload.mode === "contribution") {
            await addLinkedContribution({ data: {
              ativo_id: payload.ativo_id, account_id: payload.account_id, effective_date: payload.effective_date,
              description: payload.description, idempotency_key: payload.idempotency_key,
              quantity: payload.quantity, unit_price: payload.unit_price, fees: payload.fees,
              provento_id: payload.provento_id,
            } });
          } else if (payload.mode === "redemption") {
            await addRedemption({ data: {
              ativo_id: payload.ativo_id, account_id: payload.account_id, effective_date: payload.effective_date,
              description: payload.description, idempotency_key: payload.idempotency_key, amount: payload.amount,
            } });
          } else {
            await receiveDividend({ data: { ativo_id: payload.ativo_id, account_id: payload.account_id, provento_id: payload.provento_id!, idempotency_key: payload.idempotency_key } });
          }
          invalidateAll();
          setOpenCashOperation(false);
        }}
      />
      <MobileNav />
    </div>
  );
}

type CashOperationPayload =
  | { mode: "contribution"; ativo_id: string; account_id: string; effective_date: string; description: string; idempotency_key: string; quantity: string; unit_price: string; fees: string; provento_id?: string }
  | { mode: "redemption"; ativo_id: string; account_id: string; effective_date: string; description: string; idempotency_key: string; amount: string }
  | { mode: "dividend_received"; ativo_id: string; account_id: string; provento_id: string; idempotency_key: string };

function CashOperationDialog({
  open, mode, onModeChange, onOpenChange, assets, accounts, availableDividends, pendingReceipts, onSubmit,
}: {
  open: boolean;
  mode: "contribution" | "redemption" | "dividend_received";
  onModeChange: (mode: "contribution" | "redemption" | "dividend_received") => void;
  onOpenChange: (open: boolean) => void;
  assets: Ativo[];
  accounts: { id: string; name: string; currency_code: string }[];
  availableDividends: Provento[];
  pendingReceipts: Provento[];
  onSubmit: (payload: CashOperationPayload) => Promise<void>;
}) {
  const today = new Date();
  const civilToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [assetId, setAssetId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(civilToday);
  const [description, setDescription] = useState("Movimento de investimento");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fees, setFees] = useState("0");
  const [amount, setAmount] = useState("");
  const [dividendId, setDividendId] = useState("");
  const [saving, setSaving] = useState(false);
  const compatibleAccounts = accounts.filter((account) => account.currency_code === assets.find((asset) => asset.id === assetId)?.currency_code);
  const compatibleDividends = availableDividends.filter((item) => item.ativo_id === assetId);
  const compatibleReceipts = pendingReceipts.filter((item) => item.ativo_id === assetId);

  return (
    <Dialog open={open} onOpenChange={(next) => {
      onOpenChange(next);
      if (next) {
        setAssetId(assets[0]?.id ?? "");
        setAccountId("");
        setDate(civilToday);
        setDescription("Movimento de investimento");
        setQuantity(""); setUnitPrice(""); setFees("0"); setAmount(""); setDividendId("");
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Movimento de investimento e caixa</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Operação</Label>
            <Select value={mode} onValueChange={(value) => onModeChange(value as typeof mode)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contribution">Aporte (saída da conta)</SelectItem>
                <SelectItem value="redemption">Resgate (entrada na conta)</SelectItem>
                <SelectItem value="dividend_received">Provento recebido em conta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ativo</Label>
            <Select value={assetId} onValueChange={(value) => { setAssetId(value); setAccountId(""); setDividendId(""); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.nome} · {asset.currency_code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {mode === "dividend_received" && (
            <div>
              <Label>Provento registrado</Label>
              <Select value={dividendId} onValueChange={setDividendId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {compatibleReceipts.map((item) => <SelectItem key={item.id} value={item.id}>{item.data_recebimento} · {currency(Number(item.valor), assets.find((asset) => asset.id === assetId)?.currency_code ?? "BRL")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Conta de caixa na mesma moeda</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{compatibleAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name} · {account.currency_code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {mode !== "dividend_received" && <>
            <div>
              <Label>Data efetiva</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1" />
            </div>
            {mode === "contribution" ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>Quantidade</Label><Input type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1" /></div>
                  <div><Label>Preço unitário</Label><Input type="number" min="0" step="any" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} className="mt-1" /></div>
                  <div><Label>Taxas</Label><Input type="number" min="0" step="0.01" value={fees} onChange={(event) => setFees(event.target.value)} className="mt-1" /></div>
                </div>
                {compatibleDividends.length > 0 && <div>
                  <Label>Reinvestir provento (opcional)</Label>
                  <Select value={dividendId || "none"} onValueChange={(value) => setDividendId(value === "none" ? "" : value)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não vincular</SelectItem>
                      {compatibleDividends.map((item) => <SelectItem key={item.id} value={item.id}>{item.data_recebimento} · {currency(Number(item.valor), assets.find((asset) => asset.id === assetId)?.currency_code ?? "BRL")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>}
              </>
            ) : (
              <div><Label>Valor do resgate</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1" /></div>
            )}
            <div><Label>Descrição</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={160} className="mt-1" /></div>
          </>}
          <p className="text-xs text-muted-foreground">Aporte/resgate movimenta o caixa e o investimento, sem gerar consumo ou renda de trabalho no orçamento. O valor de mercado do ativo ficará desconhecido até você informar uma nova avaliação.</p>
          <button
            disabled={saving || !assetId || !accountId || (mode === "contribution" && (!quantity || Number(quantity) <= 0 || !unitPrice || Number(unitPrice) <= 0)) || (mode === "redemption" && (!amount || Number(amount) <= 0)) || (mode === "dividend_received" && !dividendId)}
            onClick={async () => {
              setSaving(true);
              try {
                const key = crypto.randomUUID();
                if (mode === "contribution") await onSubmit({ mode, ativo_id: assetId, account_id: accountId, effective_date: date, description: description.trim(), idempotency_key: key, quantity, unit_price: unitPrice, fees, provento_id: dividendId || undefined });
                else if (mode === "redemption") await onSubmit({ mode, ativo_id: assetId, account_id: accountId, effective_date: date, description: description.trim(), idempotency_key: key, amount });
                else await onSubmit({ mode, ativo_id: assetId, account_id: accountId, provento_id: dividendId, idempotency_key: key });
                toast.success("Movimento registrado.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Não foi possível registrar o movimento.");
              } finally { setSaving(false); }
            }}
            className="neu-pressable w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >Registrar operação</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="finance-metric">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="finance-value mt-2 break-words text-2xl font-semibold text-primary">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="neu-pressable inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function NovoAtivoDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (p: { tipo: AssetType; nome: string; corretora?: string | null; currency_code: string }) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<AssetType>("acao");
  const [nome, setNome] = useState("");
  const [corretora, setCorretora] = useState("");
  const [currencyCode, setCurrencyCode] = useState("BRL");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          setTipo("acao");
          setNome("");
          setCorretora("");
          setCurrencyCode("BRL");
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo ativo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as AssetType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="acao">Ação</SelectItem>
                <SelectItem value="fii">FII</SelectItem>
                <SelectItem value="renda_fixa">Renda Fixa</SelectItem>
                <SelectItem value="cripto">Cripto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome / Ticker</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: ITSA4, HGLG11, Tesouro IPCA 2035" className="mt-1" />
          </div>
          <div>
            <Label>Corretora (opcional)</Label>
            <Input value={corretora} onChange={(e) => setCorretora(e.target.value)} placeholder="Ex: Rico, XP" className="mt-1" />
          </div>
          <div>
            <Label>Moeda do ativo</Label>
            <Select value={currencyCode} onValueChange={setCurrencyCode}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">BRL · Real</SelectItem>
                <SelectItem value="USD">USD · Dólar</SelectItem>
                <SelectItem value="EUR">EUR · Euro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <button
            disabled={saving || !nome.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onCreate({ tipo, nome: nome.trim(), corretora: corretora.trim() || null, currency_code: currencyCode });
              } finally {
                setSaving(false);
              }
            }}
            className="neu-pressable w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NovoAporteDialog({
  open,
  onOpenChange,
  ativos,
  proventos,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ativos: Ativo[];
  proventos: Provento[];
  onCreate: (p: {
    ativo_id: string;
    data: string;
    quantidade: number;
    valor_unitario: number;
    taxas?: number;
    is_retroativo?: boolean;
    provento_id?: string;
  }) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [ativoId, setAtivoId] = useState<string>("");
  const [data, setData] = useState(today);
  const [qtd, setQtd] = useState("");
  const [vu, setVu] = useState("");
  const [taxas, setTaxas] = useState("");
  const [retro, setRetro] = useState(false);
  const [proventoId, setProventoId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const nQtd = Number(qtd.replace(",", ".")) || 0;
  const nVu = Number(vu.replace(",", ".")) || 0;
  const nTx = Number(taxas.replace(",", ".")) || 0;
  const total = nQtd * nVu + nTx;

  const proventosDoAtivo = proventos.filter((p) => p.ativo_id === ativoId);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          setAtivoId(ativos[0]?.id ?? "");
          setData(today);
          setQtd("");
          setVu("");
          setTaxas("");
          setRetro(false);
          setProventoId("");
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo aporte</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Aporte é dinheiro destinado à compra do ativo. Se vinculado a um provento, é um reinvestimento — não um novo rendimento.</p>
        <div className="space-y-4">
          <div>
            <Label>Ativo</Label>
            <Select value={ativoId} onValueChange={setAtivoId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {ativos.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome} <span className="text-xs text-muted-foreground">({TIPO_LABEL[a.tipo]})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input type="text" inputMode="decimal" pattern="[0-9.,]*" value={qtd} onChange={(e) => setQtd(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Valor unitário</Label>
              <Input type="text" inputMode="decimal" pattern="[0-9.,]*" value={vu} onChange={(e) => setVu(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Taxas</Label>
              <Input type="text" inputMode="decimal" pattern="[0-9.,]*" value={taxas} onChange={(e) => setTaxas(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="neu-inset rounded-xl px-4 py-3 text-sm">
            Total: <span className="font-semibold text-primary">{brl.format(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="retro" checked={retro} onCheckedChange={(v) => setRetro(v === true)} />
            <Label htmlFor="retro" className="cursor-pointer text-sm font-normal">
              Aporte retroativo (histórico)
            </Label>
          </div>
          {proventosDoAtivo.length > 0 && (
            <div>
              <Label>Vincular a provento (opcional)</Label>
              <Select value={proventoId || "none"} onValueChange={(v) => setProventoId(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não vincular</SelectItem>
                  {proventosDoAtivo.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {new Date(p.data_recebimento).toLocaleDateString("pt-BR")} · {brl.format(Number(p.valor))} · {PROV_LABEL[p.tipo]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-1 text-xs text-muted-foreground">
                Marca o provento como reinvestido.
              </div>
            </div>
          )}
          <button
            disabled={saving || !ativoId || nQtd <= 0 || nVu <= 0}
            onClick={async () => {
              setSaving(true);
              try {
                await onCreate({
                  ativo_id: ativoId,
                  data,
                  quantidade: nQtd,
                  valor_unitario: nVu,
                  taxas: nTx,
                  is_retroativo: retro,
                  provento_id: proventoId || undefined,
                });
              } finally {
                setSaving(false);
              }
            }}
            className="neu-pressable w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Salvar aporte
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NovoProventoDialog({
  open,
  onOpenChange,
  ativos,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ativos: Ativo[];
  onCreate: (p: { ativo_id: string; tipo: ProvType; data_recebimento: string; valor: number }) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [ativoId, setAtivoId] = useState("");
  const [tipo, setTipo] = useState<ProvType>("dividendo");
  const [data, setData] = useState(today);
  const [valor, setValor] = useState("");
  const [saving, setSaving] = useState(false);

  const nVal = Number(valor.replace(",", ".")) || 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          setAtivoId(ativos[0]?.id ?? "");
          setTipo("dividendo");
          setData(today);
          setValor("");
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo provento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Provento é o rendimento distribuído pelo ativo, registrado separadamente dos aportes.</p>
        <div className="space-y-4">
          <div>
            <Label>Ativo</Label>
            <Select value={ativoId} onValueChange={setAtivoId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {ativos.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as ProvType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dividendo">Dividendo</SelectItem>
                  <SelectItem value="jcp">JCP</SelectItem>
                  <SelectItem value="rendimento">Rendimento</SelectItem>
                  <SelectItem value="cupom">Cupom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Valor</Label>
            <Input type="text" inputMode="decimal" pattern="[0-9.,]*" value={valor} onChange={(e) => setValor(e.target.value)} className="mt-1" />
          </div>
          <button
            disabled={saving || !ativoId || nVal <= 0}
            onClick={async () => {
              setSaving(true);
              try {
                await onCreate({ ativo_id: ativoId, tipo, data_recebimento: data, valor: nVal });
              } finally {
                setSaving(false);
              }
            }}
            className="neu-pressable w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Salvar provento
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
