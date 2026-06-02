import Link from "next/link";
import {
  getEvolucao,
  getGapsMes,
  getAvaliacoesCriticas,
  type EvolucaoMensal,
} from "@/lib/field";
import {
  mesAtualISO,
  mesLabel,
  mesAnteriorISO,
  resolverMes,
  diaDoMes,
  estadoGap,
  dataCurta,
  num,
  pct,
  deltaPp,
  ppLabel,
} from "@/lib/format";
import {
  PageHeader,
  Card,
  CardTitle,
  Stat,
  Bar,
  PrioridadeBadge,
  EstadoTag,
  Tag,
  EmptyState,
  ErrorState,
} from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";

export const dynamic = "force-dynamic";

const ORD = { atrasado: 0, sem_agendamento: 1, agendado: 2 };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const sp = await searchParams;
  const atual = mesAtualISO();
  const dia = diaDoMes();

  let evo: EvolucaoMensal[];
  let avaliacoes: Awaited<ReturnType<typeof getAvaliacoesCriticas>>;
  try {
    [evo, avaliacoes] = await Promise.all([getEvolucao(), getAvaliacoesCriticas(40)]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Visão geral" />
        <ErrorState error={error} />
      </>
    );
  }

  const meses = [...new Set(evo.map((r) => r.mes_referencia))].sort((a, b) => b.localeCompare(a));
  const mes = resolverMes(sp.mes, meses, atual);
  const prev = mesAnteriorISO(mes);
  const emCurso = mes >= atual;

  let gaps: Awaited<ReturnType<typeof getGapsMes>>;
  try {
    gaps = await getGapsMes(mes, 500);
  } catch (error) {
    return (
      <>
        <PageHeader title="Visão geral" subtitle={mesLabel(mes)} />
        <ErrorState error={error} />
      </>
    );
  }

  const sel = (tipo: "visita" | "refil", m: string) =>
    evo.find((r) => r.mes_referencia === m && r.tipo === tipo);
  const visita = sel("visita", mes);
  const refil = sel("refil", mes);
  const dVisita = deltaPp(visita?.realizado_pct, sel("visita", prev)?.realizado_pct);
  const dRefil = deltaPp(refil?.realizado_pct, sel("refil", prev)?.realizado_pct);

  // estado de cobertura (sem "crítico"): agendado / atrasado (após dia 20) / sem agendamento
  const comEstado = gaps.map((g) => ({ g, e: estadoGap(g.agendado_field, g.mes_referencia, atual, dia) }));
  const atrasados = comEstado.filter((x) => x.e === "atrasado").length;
  const semAg = comEstado.filter((x) => x.e === "sem_agendamento").length;
  const aAgir = comEstado
    .filter((x) => x.e !== "agendado")
    .sort((a, b) => ORD[a.e] - ORD[b.e])
    .slice(0, 8);

  // RISCO DE CHURN = o "crítico" de verdade (avaliação <=3 + reclamação)
  const churn = avaliacoes.slice(0, 8);

  const tone = (p: number | null | undefined) =>
    emCurso ? "default" : p == null ? "default" : p >= 90 ? "good" : p >= 70 ? "warn" : "bad";
  const deltaSub = (d: number | null) =>
    emCurso ? "parcial — mês em curso" : d === null ? `vs ${mesLabel(prev)}` : `${d > 0 ? "▲" : d < 0 ? "▼" : "■"} ${ppLabel(d)} vs ${mesLabel(prev)}`;

  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle={emCurso ? "Mês em curso" : "Mês fechado"}
        right={<MonthPicker months={meses} value={mes} label="Mês" />}
      />

      {/* RISCO DE CHURN — ação imediata (o que realmente importa) */}
      <Card className="mb-4 border-red-200">
        <CardTitle hint={`${num(avaliacoes.length)} no total`}>
          🔴 Risco de churn — ação imediata
        </CardTitle>
        {churn.length === 0 ? (
          <EmptyState>Sem avaliações críticas. 🎉</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {churn.map((a) => (
              <li key={a.avaliacao_id} className="px-4 py-2.5 sm:px-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{a.cliente_nome ?? "—"}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                    <span className="font-semibold text-red-600">nota {a.nota ?? "—"}</span>
                    {a.tier && <Tag>{a.tier}</Tag>}
                    <span>{dataCurta(a.data_avaliacao)}</span>
                  </span>
                </div>
                {a.comentario?.trim() && (
                  <p className="mt-0.5 truncate text-xs text-slate-500">“{a.comentario.trim()}”</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-slate-100 px-4 py-2 text-right sm:px-5">
          <Link href="/avaliacoes" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Ver todas →
          </Link>
        </div>
      </Card>

      {emCurso && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {mesLabel(mes)} em andamento — cobertura é <strong>parcial</strong>. Gaps sem
          agendamento têm o mês todo; viram <strong>atrasados</strong> após o dia {20}.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Cobertura visita" value={pct(visita?.realizado_pct)} sub={deltaSub(dVisita)} tone={tone(visita?.realizado_pct)} />
        <Stat label="Cobertura refil" value={refil ? pct(refil.realizado_pct) : "—"} sub={refil ? deltaSub(dRefil) : "sem refil no mês"} tone={refil ? tone(refil.realizado_pct) : "default"} />
        <Stat label="Atrasados" value={num(atrasados)} sub={`${num(semAg)} sem agendamento (no prazo)`} tone={atrasados > 0 ? "bad" : "good"} />
        <Stat label="Risco de churn" value={num(avaliacoes.length)} sub="avaliações ≤ 3" tone={avaliacoes.length > 0 ? "bad" : "good"} />
      </div>

      <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-2">
        <Card>
          <CardTitle hint={mesLabel(mes)}>Cobertura do mês</CardTitle>
          <div className="space-y-5 p-4 sm:p-5">
            {!visita && !refil && <EmptyState>Nenhuma expectativa gerada para o mês.</EmptyState>}
            {visita && <CoberturaRow titulo="Visitas" e={visita} />}
            {refil && <CoberturaRow titulo="Refis" e={refil} />}
            <p className="text-xs text-slate-400">Cobertura = serviço entregue (OS criada).</p>
          </div>
        </Card>

        <Card>
          <CardTitle hint={atrasados > 0 ? `${num(atrasados)} atrasados` : `${num(semAg)} sem agendamento`}>
            A agir
          </CardTitle>
          {aAgir.length === 0 ? (
            <EmptyState>Tudo agendado. 🎉</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {aAgir.map(({ g, e }) => (
                <li key={g.expectativa_id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <Link href={`/cliente/${g.cliente_id}`} className="truncate text-sm font-medium text-slate-800 hover:text-brand-600 hover:underline">
                      {g.cliente_nome}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <Tag>{g.tipo}</Tag>
                      {g.tier && <Tag>{g.tier}</Tag>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PrioridadeBadge value={g.criticidade} />
                    <EstadoTag value={e} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-4 py-2.5 text-right sm:px-5">
            <Link href={`/gaps?mes=${mes}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Ver todos os gaps →
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}

function CoberturaRow({ titulo, e }: { titulo: string; e: EvolucaoMensal }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">{titulo}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">{pct(e.realizado_pct)}</span>
      </div>
      <Bar value={e.realizado} max={e.total} className="bg-emerald-500" />
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span><strong className="text-emerald-600">{num(e.atendida)}</strong> concluídas</span>
        {e.em_execucao > 0 && <span><strong className="text-amber-600">{num(e.em_execucao)}</strong> em execução</span>}
        <span><strong className="text-red-600">{num(e.pendente)}</strong> pendentes</span>
        <span className="text-slate-400">de {num(e.total)}</span>
      </div>
    </div>
  );
}
