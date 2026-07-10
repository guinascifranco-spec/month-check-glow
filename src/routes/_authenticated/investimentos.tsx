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
} from "@/lib/investments-portfolio.functions";

export const Route = createFileRoute("/_authenticated/investimentos")({
  head: () => ({
    meta: [
      { title: "Investimentos — Month Check" },
      { name: "description", content: "Gestão de ativos, aportes e proventos." },
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

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
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

function InvestimentosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchAtivos = useServerFn(listAtivos);
  const fetchAportes = useServerFn(listAportes);
  const fetchProventos = useServerFn(listProventos);
  const addAtivo = useServerFn(createAtivo);
  const rmAtivo = useServerFn(deleteAtivo);
  const addAporte = useServerFn(createAporte);
  const rmAporte = useServerFn(deleteAporte);
  const addProvento = useServerFn(createProvento);
  const rmProvento = useServerFn(deleteProvento);

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

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["ativos"] });
    qc.invalidateQueries({ queryKey: ["aportes"] });
    qc.invalidateQueries({ queryKey: ["proventos"] });
  };

  // --- Métricas por ativo (custo médio, patrimônio a custo, proventos totais) ---
  const porAtivo = useMemo(() => {
    const map = new Map<
      string,
      { qtd: number; investido: number; proventos: number }
    >();
    for (const a of ativos) map.set(a.id, { qtd: 0, investido: 0, proventos: 0 });
    for (const ap of aportes) {
      const cur = map.get(ap.ativo_id);
      if (!cur) continue;
      cur.qtd += Number(ap.quantidade);
      cur.investido += Number(ap.valor_total);
    }
    for (const pv of proventos) {
      const cur = map.get(pv.ativo_id);
      if (!cur) continue;
      cur.proventos += Number(pv.valor);
    }
    return map;
  }, [ativos, aportes, proventos]);

  const totalInvestido = useMemo(
    () => aportes.reduce((s, a) => s + Number(a.valor_total), 0),
    [aportes],
  );
  const totalProventos = useMemo(
    () => proventos.reduce((s, p) => s + Number(p.valor), 0),
    [proventos],
  );
  const proventosReinvestidos = useMemo(
    () => proventos.filter((p) => p.status === "reinvestido").reduce((s, p) => s + Number(p.valor), 0),
    [proventos],
  );
  const proventosPendentes = totalProventos - proventosReinvestidos;

  // --- Filtro do gráfico ---
  const [filtroTipo, setFiltroTipo] = useState<AssetType | "todos">("todos");
  const ativosFiltro = useMemo(() => {
    if (filtroTipo === "todos") return new Set(ativos.map((a) => a.id));
    return new Set(ativos.filter((a) => a.tipo === filtroTipo).map((a) => a.id));
  }, [ativos, filtroTipo]);

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

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo height={40} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Month Check</h1>
              <p className="text-sm text-muted-foreground">Investimentos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <InstallPWAButton />
            <button
              onClick={signOut}
              className="neu-pressable inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </header>

        <div className="mb-6">
          <PageTabs />
        </div>

        {/* Resumo */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            icon={<Wallet className="h-4 w-4" />}
            label="Patrimônio investido"
            value={brl.format(totalInvestido)}
            sub="Somatório de aportes"
          />
          <SummaryCard
            icon={<Coins className="h-4 w-4" />}
            label="Proventos totais"
            value={brl.format(totalProventos)}
            sub={`${proventos.length} recebimentos`}
          />
          <SummaryCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Reinvestidos"
            value={brl.format(proventosReinvestidos)}
            sub={`${brl.format(proventosPendentes)} pendentes`}
          />
          <SummaryCard
            icon={<Wallet className="h-4 w-4" />}
            label="Ativos"
            value={String(ativos.length)}
            sub={`${aportes.length} aportes`}
          />
        </div>

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
        </div>

        {/* Gráfico */}
        <section className="neu-raised mb-6 rounded-2xl p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Evolução patrimonial
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Patrimônio acumulado a custo, por classe.
              </div>
            </div>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as AssetType | "todos")}>
              <SelectTrigger className="neu-inset w-40 border-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="acao">Ações</SelectItem>
                <SelectItem value="fii">FIIs</SelectItem>
                <SelectItem value="renda_fixa">Renda Fixa</SelectItem>
                <SelectItem value="cripto">Cripto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {chartData.length === 0 ? (
            <div className="neu-inset rounded-xl px-4 py-12 text-center text-sm text-muted-foreground">
              Registre aportes para ver a evolução do patrimônio.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAcao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gFii" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#06B6D4" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gRf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gCr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => brl.format(Number(v)).replace("R$", "").trim()}
                  />
                  <Tooltip
                    formatter={(v: number, name) => [brl.format(Number(v)), TIPO_LABEL[name as AssetType] || name]}
                  />
                  <Legend formatter={(v) => TIPO_LABEL[v as AssetType] || v} />
                  <Area type="monotone" dataKey="acao" stackId="1" stroke="#10B981" fill="url(#gAcao)" />
                  <Area type="monotone" dataKey="fii" stackId="1" stroke="#06B6D4" fill="url(#gFii)" />
                  <Area type="monotone" dataKey="renda_fixa" stackId="1" stroke="#0EA5E9" fill="url(#gRf)" />
                  <Area type="monotone" dataKey="cripto" stackId="1" stroke="#8B5CF6" fill="url(#gCr)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Ativos agrupados */}
        <section className="neu-raised mb-6 rounded-2xl p-6">
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
                          <div key={a.id} className="neu-inset rounded-xl p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-base font-semibold">{a.nome}</div>
                                <div className="text-xs text-muted-foreground">
                                  {a.corretora || "sem corretora"}
                                </div>
                              </div>
                              <button
                                onClick={() => rmAtivo({ data: { id: a.id } }).then(invalidateAll)}
                                className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500"
                                aria-label="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              <Metric label="Qtd" value={m.qtd.toLocaleString("pt-BR")} />
                              <Metric label="Investido" value={brl.format(m.investido)} />
                              <Metric label="Custo médio" value={brl.format(custoMedio)} />
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Proventos: <span className="font-semibold text-foreground">{brl.format(m.proventos)}</span>
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

        {/* Aportes */}
        <section className="neu-raised mb-6 rounded-2xl p-6">
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
                  <div key={ap.id} className="neu-inset flex items-center justify-between rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {a?.nome ?? "?"}{" "}
                        {ap.is_retroativo && (
                          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            retroativo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(ap.data).toLocaleDateString("pt-BR")} · {Number(ap.quantidade).toLocaleString("pt-BR")} × {brl.format(Number(ap.valor_unitario))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-primary">{brl.format(Number(ap.valor_total))}</div>
                      <button
                        onClick={() => rmAporte({ data: { id: ap.id } }).then(invalidateAll)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500"
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

        {/* Proventos */}
        <section className="neu-raised mb-8 rounded-2xl p-6">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Proventos
          </div>
          {proventos.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum provento registrado.</div>
          ) : (
            <div className="space-y-2">
              {proventos.map((pv) => {
                const a = ativos.find((x) => x.id === pv.ativo_id);
                return (
                  <div key={pv.id} className="neu-inset flex items-center justify-between rounded-xl px-4 py-3">
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
                              : "font-semibold text-amber-600"
                          }
                        >
                          {pv.status === "reinvestido" ? "Reinvestido" : "A reinvestir"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-primary">{brl.format(Number(pv.valor))}</div>
                      <button
                        onClick={() => rmProvento({ data: { id: pv.id } }).then(invalidateAll)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500"
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
        proventos={proventos.filter((p) => p.status === "a_reinvestir")}
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
    </div>
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
    <div className="neu-raised rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-primary">{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>}
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
  onCreate: (p: { tipo: AssetType; nome: string; corretora?: string | null }) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<AssetType>("acao");
  const [nome, setNome] = useState("");
  const [corretora, setCorretora] = useState("");
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
          <button
            disabled={saving || !nome.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onCreate({ tipo, nome: nome.trim(), corretora: corretora.trim() || null });
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
