"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, PageHeader, EmptyState, ErrorState } from "@/components/ui";
import { dataHora } from "@/lib/format";
import {
  PRESETS,
  periodosDoPreset,
  periodosParaQuery,
  rotuloPeriodo,
  validarPeriodo,
  type Periodo,
  type Preset,
} from "@/lib/periodos";
import type { Comparativo, Delta, Kpis, PeriodoData } from "@/lib/bi-types";

// =============================================================================
// Escala de cor por tempo: claro (P1, mais antigo) → escuro (P3, agora).
// =============================================================================
const CORES = [
  { bar: "#c7d2fe", text: "#4f46e5", soft: "#f5f7ff" }, // P1
  { bar: "#818cf8", text: "#4338ca", soft: "#eef2ff" }, // P2
  { bar: "#4338ca", text: "#312e81", soft: "#e0e7ff" }, // P3
];
const PLABEL = ["P1", "P2", "P3"];

// =============================================================================
// Formatação pt-BR + "sem dados" (NULL nunca vira zero)
// =============================================================================
const SemDados = () => <span className="text-slate-300 italic">sem dados</span>;

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
  switch (fmt) {
    case "brl":
      return reais(v);
    case "brl2":
      return reais(v, true);
    case "taxa":
      return taxa(v);
    default:
      return inteiro(v);
  }
}

function DeltaBadge({ d, kind }: { d: Delta | undefined; kind: "pct" | "pp" }) {
  const v = kind === "pct" ? d?.pct : d?.pp;
  if (v == null) return <span className="text-slate-300">—</span>;
  const flat = v === 0;
  const up = v > 0;
  const cls = flat
    ? "bg-slate-50 text-slate-400"
    : up
      ? "bg-emerald-50 text-emerald-700"
      : "bg-red-50 text-red-700";
  const arrow = flat ? "→" : up ? "▲" : "▼";
  const txt =
    kind === "pct"
      ? `${up ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
      : `${up ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}
    >
      <span aria-hidden>{arrow}</span> {txt}
    </span>
  );
}

const display = { fontFamily: "var(--font-display)" } as const;

// =============================================================================
// Seletor de períodos (presets + custom)
// =============================================================================
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

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => {
          const ativo = preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              disabled={loading}
              onClick={() => onPreset(p.key)}
              title={p.hint}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                ativo
                  ? "bg-brand-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={loading}
          onClick={() => onCustom(draft)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            aberto
              ? "bg-brand-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          Personalizado
        </button>
        {loading && <span className="ml-1 text-xs text-slate-400">atualizando…</span>}
      </div>

      {aberto && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            {draft.map((p, i) => (
              <div
                key={i}
                role="group"
                aria-label={`Período ${PLABEL[i]}`}
                className="rounded-lg"
                style={{ background: CORES[i].soft }}
              >
                <div
                  className="flex items-center gap-1.5 px-3 pt-2 text-xs font-semibold"
                  style={{ color: CORES[i].text }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: CORES[i].bar }} />
                  {PLABEL[i]}
                </div>
                <div className="flex items-center gap-1.5 px-3 pb-3 pt-1.5">
                  <input
                    type="date"
                    value={p.ini}
                    aria-label={`${PLABEL[i]} — início`}
                    onChange={(e) => setData(i, "ini", e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  <span className="text-slate-400" aria-hidden>
                    →
                  </span>
                  <input
                    type="date"
                    value={p.fim}
                    aria-label={`${PLABEL[i]} — fim`}
                    onChange={(e) => setData(i, "fim", e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            {erro ? (
              <span className="text-xs font-medium text-red-600">{erro}</span>
            ) : (
              <span className="text-xs text-slate-400">
                janelas livres — para comparação justa, use o mesmo nº de dias
              </span>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={aplicar}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Blocos visuais reutilizados
// =============================================================================
function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3 first:mt-0">
      <h2 className="text-lg font-semibold text-slate-800" style={display}>
        {children}
      </h2>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

function ColunaPeriodo({ i, pd, children }: { i: number; pd: PeriodoData; children: ReactNode }) {
  const c = CORES[i];
  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold"
        style={{ background: c.soft, color: c.text }}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: c.bar }} />
          {PLABEL[i]}
        </span>
        <span className="font-medium">{rotuloPeriodo(pd)}</span>
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

/** Barra horizontal com rótulo à direita; cor do período. */
function Barra({
  width,
  cor,
  children,
}: {
  width: number;
  cor: string;
  children: ReactNode;
}) {
  return (
    <div className="h-6 w-full overflow-hidden rounded bg-slate-100">
      <div
        className="flex h-full min-w-[2.5rem] items-center justify-end rounded px-1.5 text-[11px] font-semibold tabular-nums text-white"
        style={{ width: `${Math.max(6, Math.min(100, width))}%`, background: cor }}
      >
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// Seção 1 — Visão geral
// =============================================================================
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
  const c3 = CORES[2];
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 text-3xl font-semibold tabular-nums sm:text-4xl" style={{ ...display, color: c3.text }}>
        {render(periodos[2])}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className="h-2 w-2 rounded-full" style={{ background: c3.bar }} />
        {rotuloPeriodo(periodos[2])} · agora
      </div>
      <div className="mt-3 space-y-1 border-t border-slate-100 pt-2.5 text-xs">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: CORES[i].bar }} />
              {PLABEL[i]} · {rotuloPeriodo(periodos[i])}
            </span>
            <span className="font-medium tabular-nums" style={{ color: CORES[i].text }}>
              {render(periodos[i])}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
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
            // qtd de pedidos + R$ (ex.: "287 ped · R$ 76.916"). vendas null =
            // período sem nada carregado -> "sem dados" coerente (não "sem dados · R$ 0").
            pd.kpis.vendas == null ? (
              <SemDados />
            ) : (
              <span>
                {inteiro(pd.kpis.vendas)}
                <span className="whitespace-nowrap text-sm font-normal text-slate-400">
                  {" "}
                  ped · {reais(pd.kpis.receita)}
                </span>
              </span>
            )
          }
        />
        <ComparCard
          label="Ticket médio"
          periodos={ps}
          deltas={data.deltas}
          deltaKey="ticket_medio"
          kind="pct"
          render={(pd) => reais(pd.kpis.ticket_medio, true)}
        />
        <ComparCard
          label="Visitas"
          periodos={ps}
          deltas={data.deltas}
          deltaKey="visitas"
          kind="pct"
          render={(pd) => inteiro(pd.kpis.visitas)}
        />
        <ComparCard
          label="Taxa de conversão"
          periodos={ps}
          deltas={data.deltas}
          deltaKey="taxa_conversao"
          kind="pp"
          render={(pd) => taxa(pd.kpis.taxa_conversao)}
        />
      </div>

      {/* Tabela completa — todas as métricas e os 3 deltas (P2/P1, P3/P2, P3/P1) */}
      <Card className="mt-4 overflow-hidden">
        <div className="scroll-x">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">Métrica</th>
                {ps.map((pd, i) => (
                  <th key={i} className="px-3 py-2.5 text-right font-semibold" style={{ color: CORES[i].text }}>
                    <span className="inline-flex items-center gap-1.5">
                      {PLABEL[i]}
                      <span className="font-normal text-slate-400">{rotuloPeriodo(pd)}</span>
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
                <tr key={row.key} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 text-slate-600">{row.label}</td>
                  {ps.map((pd, i) => (
                    <td
                      key={i}
                      className="px-3 py-2.5 text-right tabular-nums"
                      style={{ color: i === 2 ? CORES[2].text : undefined, fontWeight: i === 2 ? 600 : 400 }}
                    >
                      {fmtKpi(pd.kpis[row.key], row.fmt)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <DeltaBadge d={data.deltas.p2_p1[row.key]} kind={row.kind} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DeltaBadge d={data.deltas.p3_p2[row.key]} kind={row.kind} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DeltaBadge d={data.deltas.p3_p1[row.key]} kind={row.kind} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// =============================================================================
// Seção 2 — Funil (Visitas → Carrinhos → Checkouts → Vendas)
// =============================================================================
const FUNIL: { key: keyof Kpis; label: string }[] = [
  { key: "visitas", label: "Visitas" },
  { key: "carrinhos", label: "Carrinhos" },
  { key: "checkouts", label: "Checkouts" },
  { key: "vendas", label: "Vendas" },
];

function Funil({ data }: { data: Comparativo }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {data.periodos.map((pd, i) => {
        const base = pd.kpis.visitas;
        return (
          <ColunaPeriodo key={i} i={i} pd={pd}>
            {base == null ? (
              <EmptyState>sem dados — sem GA4 neste período</EmptyState>
            ) : (
              <div className="space-y-2.5">
                {FUNIL.map((etapa) => {
                  const v = pd.kpis[etapa.key];
                  const width = v != null && base > 0 ? (v / base) * 100 : 0;
                  const pctBase = v != null && base > 0 ? (v / base) * 100 : null;
                  return (
                    <div key={etapa.key}>
                      <div className="mb-0.5 flex items-baseline justify-between text-xs">
                        <span className="text-slate-600">{etapa.label}</span>
                        <span className="text-slate-400">
                          {pctBase == null ? "" : `${pctBase.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% das visitas`}
                        </span>
                      </div>
                      <Barra width={width} cor={CORES[i].bar}>
                        {inteiro(v)}
                      </Barra>
                    </div>
                  );
                })}
              </div>
            )}
          </ColunaPeriodo>
        );
      })}
    </div>
  );
}

// =============================================================================
// Seção 3 — Comportamento no checkout (retenção por etapa)
// =============================================================================
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
                    <span className="text-slate-600">{ETAPA_LABEL[r.etapa] ?? r.etapa}</span>
                    <span className="text-slate-400">{taxa(r.pct_do_inicio)} do início</span>
                  </div>
                  <Barra width={r.pct_do_inicio ?? 0} cor={CORES[i].bar}>
                    {inteiro(r.eventos)}
                  </Barra>
                </div>
              ))}
            </div>
          )}
        </ColunaPeriodo>
      ))}
    </div>
  );
}

// =============================================================================
// Seção 4 — Comportamento dos visitantes (origem + dispositivo)
// =============================================================================
function ListaTrafego({
  titulo,
  rows,
  cor,
}: {
  titulo: string;
  rows: { valor: string; visitas: number | null; pct: number | null }[];
  cor: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-300 italic">sem dados</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.valor}>
              <div className="mb-0.5 flex items-baseline justify-between text-xs">
                <span className="truncate text-slate-600">{r.valor}</span>
                <span className="text-slate-400">
                  {taxa(r.pct)} · {inteiro(r.visitas)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(3, Math.min(100, r.pct ?? 0))}%`, background: cor }}
                />
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

// =============================================================================
// Componente principal
// =============================================================================
export function ComparativoPerformance({
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

  const ultima = data?.ultima_atualizacao ?? null;

  return (
    <>
      <PageHeader
        title="Comparativo de Performance"
        subtitle="E-commerce Senses · 3 períodos lado a lado"
        right={
          <span title={ultima ? `Último dado carregado em ${ultima}` : undefined}>
            atualizado: {ultima ? dataHora(ultima) : "—"}
          </span>
        }
      />

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
        <Card className="p-10 text-center text-sm text-slate-400">Carregando…</Card>
      ) : (
        <div className={loading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
          {error && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
              Não foi possível atualizar: {error}. Mostrando os últimos dados carregados.
            </div>
          )}

          <SectionTitle hint="financeiro Nuvemshop · funil GA4">Visão geral</SectionTitle>
          <VisaoGeral data={data} />

          <SectionTitle hint="% sobre as visitas do período">Funil</SectionTitle>
          <Funil data={data} />

          <SectionTitle hint="% sobre o início do checkout">Comportamento no checkout</SectionTitle>
          <Checkout data={data} />

          <SectionTitle hint="participação nas visitas">Comportamento dos visitantes</SectionTitle>
          <Visitantes data={data} />

          <footer className="mt-8 text-center text-xs text-slate-400">
            Receita/Vendas/Ticket vêm da Nuvemshop (financeiro). Visitas, funil e tráfego vêm do GA4
            — onde não havia GA4 no período, aparece “sem dados”, nunca zero.
          </footer>
        </div>
      )}
    </>
  );
}
