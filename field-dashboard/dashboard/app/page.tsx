import Link from "next/link";
import {
  getEvolucao,
  getGapsMes,
  getAlertasPendentes,
  type EvolucaoMensal,
} from "@/lib/field";
import {
  mesAtualISO,
  mesLabel,
  mesAnteriorISO,
  resolverMes,
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
  CriticidadeBadge,
  Tag,
  EmptyState,
  ErrorState,
} from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const sp = await searchParams;
  const atual = mesAtualISO();

  let evo: EvolucaoMensal[];
  let alertas: Awaited<ReturnType<typeof getAlertasPendentes>>;
  try {
    [evo, alertas] = await Promise.all([getEvolucao(), getAlertasPendentes()]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Visão geral" />
        <ErrorState error={error} />
      </>
    );
  }

  const meses = [...new Set(evo.map((r) => r.mes_referencia))].sort((a, b) => b.localeCompare(a));
  // mês corrente é o default; valida contra o que existe
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

  // gaps acionáveis = sem agendamento no Field (os com OS agendada já estão a caminho)
  const semAgend = gaps.filter((g) => !g.agendado_field);
  const criticos = semAgend.filter((g) => g.criticidade === "critico").length;
  const topGaps = semAgend.slice(0, 8);

  // mês em curso: números parciais -> não alarmar (tom neutro, sem delta)
  const tone = (p: number | null | undefined) =>
    emCurso ? "default" : p === null || p === undefined ? "default" : p >= 90 ? "good" : p >= 70 ? "warn" : "bad";
  const deltaSub = (d: number | null) =>
    emCurso
      ? "parcial — mês em curso"
      : d === null
        ? `vs ${mesLabel(prev)}`
        : `${d > 0 ? "▲" : d < 0 ? "▼" : "■"} ${ppLabel(d)} vs ${mesLabel(prev)}`;

  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle={emCurso ? "Mês em curso" : "Mês fechado"}
        right={<MonthPicker months={meses} value={mes} label="Mês" />}
      />

      {emCurso && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {mesLabel(mes)} ainda está em andamento — cobertura e gaps são{" "}
          <strong>parciais</strong> e se completam ao longo do mês. Selecione um mês
          fechado para comparar.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Cobertura visita"
          value={pct(visita?.realizado_pct)}
          sub={deltaSub(dVisita)}
          tone={tone(visita?.realizado_pct)}
        />
        <Stat
          label="Cobertura refil"
          value={refil ? pct(refil.realizado_pct) : "—"}
          sub={refil ? deltaSub(dRefil) : "sem refil no mês"}
          tone={refil ? tone(refil.realizado_pct) : "default"}
        />
        <Stat
          label="Sem agendamento"
          value={num(semAgend.length)}
          sub={`${num(criticos)} crítico(s) · ${num(gaps.length)} gaps no total`}
          tone={criticos > 0 ? "bad" : semAgend.length > 0 ? "warn" : "good"}
        />
        <Stat
          label="Alertas pendentes"
          value={num(alertas.length)}
          sub="ainda não disparados"
          tone={alertas.length > 0 ? "bad" : "good"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-2">
        <Card>
          <CardTitle hint={mesLabel(mes)}>Cobertura do mês</CardTitle>
          <div className="space-y-5 p-4 sm:p-5">
            {!visita && !refil && (
              <EmptyState>Nenhuma expectativa gerada para o mês.</EmptyState>
            )}
            {visita && <CoberturaRow titulo="Visitas" e={visita} />}
            {refil && <CoberturaRow titulo="Refis" e={refil} />}
            <p className="text-xs text-slate-400">
              Cobertura = serviço entregue (OS criada). Para refil, “concluídas”
              inclui os enviados sem código de rastreio registrado.
            </p>
          </div>
        </Card>

        <Card>
          <CardTitle hint={`${num(semAgend.length)} sem agendamento`}>A agir (sem agendamento)</CardTitle>
          {topGaps.length === 0 ? (
            <EmptyState>Tudo agendado. 🎉</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {topGaps.map((g) => (
                <li key={g.expectativa_id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{g.cliente_nome}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <Tag>{g.tipo}</Tag>
                      {g.tier && <Tag>{g.tier}</Tag>}
                      {g.jornada_atual && <Tag>{g.jornada_atual}</Tag>}
                    </div>
                  </div>
                  <CriticidadeBadge value={g.criticidade} />
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
        <span>
          <strong className="text-emerald-600">{num(e.atendida)}</strong> concluídas
        </span>
        {e.em_execucao > 0 && (
          <span>
            <strong className="text-amber-600">{num(e.em_execucao)}</strong> em execução
          </span>
        )}
        <span>
          <strong className="text-red-600">{num(e.pendente)}</strong> pendentes
        </span>
        <span className="text-slate-400">de {num(e.total)}</span>
      </div>
    </div>
  );
}
