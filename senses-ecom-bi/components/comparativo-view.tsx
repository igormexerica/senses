"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, SectionTitle, EmptyState, ErrorState } from "@/components/ui";
import {
  PRESETS,
  periodosDoPreset,
  periodosParaQuery,
  rotuloPeriodo,
  validarPeriodo,
  type Periodo,
  type Preset,
} from "@/lib/periodos";
import type { Comparativo, Delta, Kpis, PeriodoData } from "@/lib/types";

// Escala de cor por tempo: claro (P1, antigo) → escuro (P3, agora). Paleta aubergine.
const CORES = [
  { bar: "#d3a9da", text: "#823a8c", soft: "#faf5fb" }, // P1
  { bar: "#9d4ea8", text: "#6a2e72", soft: "#f3e6f5" }, // P2
  { bar: "#46153f", text: "#321031", soft: "#e6cdea" }, // P3
];
const PLABEL = ["P1", "P2", "P3"];

// ---------- formatação pt-BR + "sem dados" (NULL nunca vira zero) ----------
const SemDados = () => <span className="italic text-muted/60">sem dados</span>;

function brl(n: number, cents = false): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}
function inteiro(n: number | null): ReactNode {
  return n == null ? <SemDados /> : <>{n.toLocaleString("pt-BR")}</>;
}
function reais(n: number | null, cents = false): ReactNode {
  return n == null ? <SemDados /> : <>{brl(n, cents)}</>;
}
function taxa(n: number | null): ReactNode {
  return n == null ? <SemDados /> : <>{n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</>;
}

type Fmt = "int" | "brl" | "brl2" | "taxa";
function fmtKpi(v: number | null, fmt: Fmt): ReactNode {
  if (fmt === "brl") return reais(v);
  if (fmt === "brl2") return reais(v, true);
  if (fmt === "taxa") return taxa(v);
  return inteiro(v);
}

function DeltaBadge({ d, kind }: { d: Delta | undefined; kind: "pct" | "pp" }) {
  const v = kind === "pct" ? d?.pct : d?.pp;
  if (v == null) return <span className="text-muted/40">—</span>;
  const flat = v === 0;
  const up = v > 0;
  const cls = flat
    ? "bg-aubergine-50 text-muted"
    : up
      ? "bg-emerald-50 text-emerald-700"
      : "bg-red-50 text-red-700";
  const Icon = flat ? ArrowRight : up ? ArrowUp : ArrowDown;
  const txt =
    kind === "pct"
      ? `${up ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
      : `${up ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}
    >
      <Icon className="h-3 w-3" /> {txt}
    </span>
  );
}

// ---------- seletor de períodos ----------
function Seletor({
  preset,
  periodos,
  loading,
  onPreset,
  onCustom,
}: {
  preset: Preset;
  periodos: Periodo[];
  loading: boolean;
  onPreset: (p: Exclude<Preset, "custom">) => void;
  onCustom: (ps: Periodo[]) => void;
}) {
  const [draft, setDraft] = useState<Periodo[]>(periodos);
  const [erro, setErro] = useState<string | null>(null);
  const aberto = preset === "custom";

  function setData(i: number, campo: "ini" | "fim", v: string) {
    setDraft((d) => d.map((p, k) => (k === i ? { ...p, [campo]: v } : p)));
  }
  function aplicar() {
    try {
      draft.forEach((p, i) => validarPeriodo(p, `P${i + 1}`));
      setErro(null);
      onCustom(draft);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Datas inválidas.");
    }
  }

  const btn = (ativo: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
      ativo
        ? "bg-aubergine-800 text-white shadow-sm"
        : "border border-line bg-surface text-ink/70 hover:bg-aubergine-50 hover:text-aubergine-900"
    }`;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" disabled={loading} onClick={() => onPreset(p.key)} title={p.hint} className={btn(preset === p.key)}>
            {p.label}
          </button>
        ))}
        <button type="button" disabled={loading} onClick={() => onCustom(draft)} className={btn(aberto)}>
          Personalizado
        </button>
        {loading && (
          <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> atualizando…
          </span>
        )}
      </div>

      {aberto && (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            {draft.map((p, i) => (
              <div key={i} role="group" aria-label={`Período ${PLABEL[i]}`} className="rounded-xl" style={{ background: CORES[i].soft }}>
                <div className="flex items-center gap-1.5 px-3 pt-2 text-xs font-semibold" style={{ color: CORES[i].text }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: CORES[i].bar }} />
                  {PLABEL[i]}
                </div>
                <div className="flex items-center gap-1.5 px-3 pb-3 pt-1.5">
                  <input type="date" value={p.ini} aria-label={`${PLABEL[i]} — início`} onChange={(e) => setData(i, "ini", e.target.value)} className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-aubergine-500" />
                  <span className="text-muted" aria-hidden>→</span>
                  <input type="date" value={p.fim} aria-label={`${PLABEL[i]} — fim`} onChange={(e) => setData(i, "fim", e.target.value)} className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-aubergine-500" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            {erro ? (
              <span className="text-xs font-medium text-red-600">{erro}</span>
            ) : (
              <span className="text-xs text-muted">janelas livres — pra comparação justa, use o mesmo nº de dias</span>
            )}
            <button type="button" disabled={loading} onClick={aplicar} className="rounded-lg bg-aubergine-800 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-aubergine-900 disabled:opacity-50">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- legenda de períodos ----------
function PeriodLegend({ periodos }: { periodos: PeriodoData[] }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {periodos.map((pd, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CORES[i].bar }} />
          <span className="font-semibold" style={{ color: CORES[i].text }}>{PLABEL[i]}</span>
          <span className="text-muted">{rotuloPeriodo(pd)}</span>
          {i === 2 && <span className="text-muted/70">· agora</span>}
        </span>
      ))}
    </div>
  );
}

// ---------- Seção 1: Visão geral ----------
function ComparCard({
  label,
  periodos,
  deltas,
  render,
  deltaKey,
  kind,
}: {
  label: string;
  periodos: PeriodoData[];
  deltas: Comparativo["deltas"];
  render: (pd: PeriodoData) => ReactNode;
  deltaKey: keyof Kpis;
  kind: "pct" | "pp";
}) {
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1.5 font-display text-3xl font-semibold tabular-nums sm:text-4xl" style={{ color: CORES[2].text }}>
        {render(periodos[2])}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
        <span className="h-2 w-2 rounded-full" style={{ background: CORES[2].bar }} />
        {rotuloPeriodo(periodos[2])} · agora
      </div>
      <div className="mt-3 space-y-1 border-t border-line pt-2.5 text-xs">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: CORES[i].bar }} />
              {PLABEL[i]} · {rotuloPeriodo(periodos[i])}
            </span>
            <span className="font-medium tabular-nums" style={{ color: CORES[i].text }}>{render(periodos[i])}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>P3 vs P1</span>
        <DeltaBadge d={deltas.p3_p1[deltaKey]} kind={kind} />
      </div>
    </Card>
  );
}

const TABELA: { label: string; key: keyof Kpis; fmt: Fmt; kind: "pct" | "pp" }[] = [
  { label: "Visitas", key: "visitas", fmt: "int", kind: "pct" },
  { label: "Carrinhos", key: "carrinhos", fmt: "int", kind: "pct" },
  { label: "Checkouts iniciados", key: "checkouts", fmt: "int", kind: "pct" },
  { label: "Vendas (pedidos)", key: "vendas", fmt: "int", kind: "pct" },
  { label: "Receita", key: "receita", fmt: "brl", kind: "pct" },
  { label: "Ticket médio", key: "ticket_medio", fmt: "brl2", kind: "pct" },
  { label: "Taxa de conversão", key: "taxa_conversao", fmt: "taxa", kind: "pp" },
  { label: "Carrinho / visita", key: "taxa_carrinho", fmt: "taxa", kind: "pp" },
  { label: "Checkout / visita", key: "taxa_inicio_checkout", fmt: "taxa", kind: "pp" },
  { label: "Conclusão (vendas / checkout)", key: "taxa_conclusao", fmt: "taxa", kind: "pp" },
];

function VisaoGeral({ data }: { data: Comparativo }) {
  const ps = data.periodos;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ComparCard
          label="Vendas"
          periodos={ps}
          deltas={data.deltas}
          deltaKey="vendas"
          kind="pct"
          render={(pd) =>
            pd.kpis.vendas == null ? (
              <SemDados />
            ) : (
              <span>
                {inteiro(pd.kpis.vendas)}
                <span className="whitespace-nowrap text-sm font-normal text-muted"> ped · {reais(pd.kpis.receita)}</span>
              </span>
            )
          }
        />
        <ComparCard label="Ticket médio" periodos={ps} deltas={data.deltas} deltaKey="ticket_medio" kind="pct" render={(pd) => reais(pd.kpis.ticket_medio, true)} />
        <ComparCard label="Visitas" periodos={ps} deltas={data.deltas} deltaKey="visitas" kind="pct" render={(pd) => inteiro(pd.kpis.visitas)} />
        <ComparCard label="Taxa de conversão" periodos={ps} deltas={data.deltas} deltaKey="taxa_conversao" kind="pp" render={(pd) => taxa(pd.kpis.taxa_conversao)} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="scroll-x">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-4 py-2.5 text-left font-medium">Métrica</th>
                {ps.map((pd, i) => (
                  <th key={i} className="px-3 py-2.5 text-right font-semibold" style={{ color: CORES[i].text }}>
                    <span className="inline-flex items-center gap-1.5">
                      {PLABEL[i]}
                      <span className="font-normal text-muted">{rotuloPeriodo(pd)}</span>
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium">Δ P2/P1</th>
                <th className="px-3 py-2.5 text-right font-medium">Δ P3/P2</th>
                <th className="px-3 py-2.5 text-right font-medium">Δ P3/P1</th>
              </tr>
            </thead>
            <tbody>
              {TABELA.map((row) => (
                <tr key={row.key} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 text-ink/80">{row.label}</td>
                  {ps.map((pd, i) => (
                    <td key={i} className="px-3 py-2.5 text-right tabular-nums" style={{ color: i === 2 ? CORES[2].text : undefined, fontWeight: i === 2 ? 600 : 400 }}>
                      {fmtKpi(pd.kpis[row.key], row.fmt)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right"><DeltaBadge d={data.deltas.p2_p1[row.key]} kind={row.kind} /></td>
                  <td className="px-3 py-2.5 text-right"><DeltaBadge d={data.deltas.p3_p2[row.key]} kind={row.kind} /></td>
                  <td className="px-3 py-2.5 text-right"><DeltaBadge d={data.deltas.p3_p1[row.key]} kind={row.kind} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ---------- Seção 2: Funil (recharts) ----------
const FUNIL: { key: keyof Kpis; label: string }[] = [
  { key: "visitas", label: "Visitas" },
  { key: "carrinhos", label: "Carrinhos" },
  { key: "checkouts", label: "Checkouts" },
  { key: "vendas", label: "Vendas" },
];

function Funil({ data }: { data: Comparativo }) {
  const ps = data.periodos;
  const chartData = FUNIL.map((etapa) => {
    const row: Record<string, number | string | null> = { etapa: etapa.label };
    ps.forEach((pd, i) => {
      row[PLABEL[i]] = pd.kpis[etapa.key];
    });
    return row;
  });
  const semGa4 = ps.map((pd, i) => (pd.kpis.visitas == null ? PLABEL[i] : null)).filter(Boolean);

  return (
    <Card className="p-4 sm:p-5">
      <PeriodLegend periodos={ps} />
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="#ece4ee" />
            <XAxis dataKey="etapa" tick={{ fontSize: 12, fill: "#7c6b80" }} axisLine={{ stroke: "#ece4ee" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#7c6b80" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} />
            <Tooltip
              formatter={(v, name) => [
                v == null ? "sem dados" : Number(v).toLocaleString("pt-BR"),
                String(name),
              ]}
              contentStyle={{ borderRadius: 12, border: "1px solid #ece4ee", fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {ps.map((_, i) => (
              <Bar key={i} dataKey={PLABEL[i]} fill={CORES[i].bar} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted/80">
        Visitas, Carrinhos e Checkouts vêm do GA4; Vendas vêm da Nuvemshop — por serem fontes
        distintas, a última barra pode não seguir a queda do funil.
      </p>
      {semGa4.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          {semGa4.join(", ")}: sem dados de funil (sem GA4 no período) — só o financeiro (Vendas) aparece.
        </p>
      )}
    </Card>
  );
}

// ---------- barra horizontal (checkout/tráfego) ----------
function Barra({ width, cor, txt, children }: { width: number; cor: string; txt: string; children: ReactNode }) {
  return (
    <div className="h-6 w-full overflow-hidden rounded bg-aubergine-50">
      <div className="flex h-full min-w-[2.5rem] items-center justify-end rounded px-1.5 text-[11px] font-semibold tabular-nums" style={{ width: `${Math.max(6, Math.min(100, width))}%`, background: cor, color: txt }}>
        {children}
      </div>
    </div>
  );
}

function ColunaPeriodo({ i, pd, children }: { i: number; pd: PeriodoData; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold" style={{ background: CORES[i].soft, color: CORES[i].text }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: CORES[i].bar }} />
          {PLABEL[i]}
        </span>
        <span className="font-medium">{rotuloPeriodo(pd)}</span>
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

// ---------- Seção 3: Checkout ----------
const ETAPA_LABEL: Record<string, string> = {
  begin_checkout: "Início do checkout",
  add_shipping_info: "Dados de entrega",
  add_payment_info: "Dados de pagamento",
  purchase: "Compra",
};

function Checkout({ data }: { data: Comparativo }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {data.periodos.map((pd, i) => (
        <ColunaPeriodo key={i} i={i} pd={pd}>
          {pd.retencao.length === 0 ? (
            <EmptyState>sem dados — sem GA4 neste período</EmptyState>
          ) : (
            <div className="space-y-2.5">
              {pd.retencao.map((r) => (
                <div key={r.etapa}>
                  <div className="mb-0.5 flex items-baseline justify-between text-xs">
                    <span className="text-ink/70">{ETAPA_LABEL[r.etapa] ?? r.etapa}</span>
                    <span className="text-muted">{taxa(r.pct_do_inicio)} do início</span>
                  </div>
                  <Barra width={r.pct_do_inicio ?? 0} cor={CORES[i].bar} txt={i === 0 ? CORES[2].text : "#ffffff"}>{inteiro(r.eventos)}</Barra>
                </div>
              ))}
            </div>
          )}
        </ColunaPeriodo>
      ))}
    </div>
  );
}

// ---------- Seção 4: Visitantes ----------
function ListaTrafego({ titulo, rows, cor }: { titulo: string; rows: { valor: string; visitas: number | null; pct: number | null }[]; cor: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{titulo}</div>
      {rows.length === 0 ? (
        <p className="text-xs italic text-muted/60">sem dados</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.valor}>
              <div className="mb-0.5 flex items-baseline justify-between text-xs">
                <span className="truncate text-ink/70">{r.valor}</span>
                <span className="text-muted">{taxa(r.pct)} · {inteiro(r.visitas)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-aubergine-50">
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, r.pct ?? 0))}%`, background: cor }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Visitantes({ data }: { data: Comparativo }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {data.periodos.map((pd, i) => {
        const vazio = pd.trafego.origem.length === 0 && pd.trafego.dispositivo.length === 0;
        return (
          <ColunaPeriodo key={i} i={i} pd={pd}>
            {vazio ? (
              <EmptyState>sem dados — sem GA4 neste período</EmptyState>
            ) : (
              <div className="space-y-4">
                <ListaTrafego titulo="Origem" rows={pd.trafego.origem} cor={CORES[i].bar} />
                <ListaTrafego titulo="Dispositivo" rows={pd.trafego.dispositivo} cor={CORES[i].bar} />
              </div>
            )}
          </ColunaPeriodo>
        );
      })}
    </div>
  );
}

// ---------- componente principal ----------
export function ComparativoView({
  hoje,
  initialPeriodos,
  initialPreset,
  initial,
  initialError,
}: {
  hoje: string;
  initialPeriodos: Periodo[];
  initialPreset: Preset;
  initial: Comparativo | null;
  initialError: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [periodos, setPeriodos] = useState<Periodo[]>(initialPeriodos);
  const [data, setData] = useState<Comparativo | null>(initial);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function carregar(novosPeriodos: Periodo[], novoPreset: Preset) {
    const qs = periodosParaQuery(novosPeriodos, novoPreset);
    setLoading(true);
    setError(null);
    setPreset(novoPreset);
    setPeriodos(novosPeriodos);
    router.replace(`${pathname}?${qs}`, { scroll: false });
    try {
      const res = await fetch(`/api/comparativo?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`);
      setData(json as Comparativo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-aubergine-900 sm:text-3xl">Comparativo de Performance</h1>
        <p className="mt-1 text-sm text-muted">E-commerce Senses · 3 períodos lado a lado</p>
      </div>

      <Seletor
        preset={preset}
        periodos={periodos}
        loading={loading}
        onPreset={(p) => carregar(periodosDoPreset(p, hoje), p)}
        onCustom={(ps) => carregar(ps, "custom")}
      />

      {error && !data ? (
        <ErrorState error={error} />
      ) : !data ? (
        <Card className="p-10 text-center text-sm text-muted">Carregando…</Card>
      ) : (
        <div className={loading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
          {error && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
              Não foi possível atualizar: {error}. Mostrando os últimos dados carregados.
            </div>
          )}

          <SectionTitle hint="financeiro Nuvemshop · funil GA4">Visão geral</SectionTitle>
          <VisaoGeral data={data} />

          <SectionTitle hint="contagem por etapa (GA4)">Funil</SectionTitle>
          <Funil data={data} />

          <SectionTitle hint="% sobre o início do checkout">Comportamento no checkout</SectionTitle>
          <Checkout data={data} />

          <SectionTitle hint="participação nas visitas">Comportamento dos visitantes</SectionTitle>
          <Visitantes data={data} />

          <footer className="mt-10 text-center text-xs text-muted/70">
            Receita/Vendas/Ticket vêm da Nuvemshop. Visitas, funil e tráfego vêm do GA4 — onde não
            havia GA4 no período, aparece “sem dados”, nunca zero.
          </footer>
        </div>
      )}
    </>
  );
}
