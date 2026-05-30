import Link from "next/link";
import {
  getCoberturaMes,
  getGaps,
  getAlertasPendentes,
  type CoberturaMensal,
} from "@/lib/field";
import { mesLabel, num, pct } from "@/lib/format";
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

export const dynamic = "force-dynamic";

const mesAtualISO = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

export default async function OverviewPage() {
  const mes = mesAtualISO();
  let cobertura: CoberturaMensal[];
  let gaps: Awaited<ReturnType<typeof getGaps>>;
  let alertas: Awaited<ReturnType<typeof getAlertasPendentes>>;
  try {
    [cobertura, gaps, alertas] = await Promise.all([
      getCoberturaMes(mes),
      getGaps(500),
      getAlertasPendentes(),
    ]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Visão geral" subtitle={mesLabel(mes)} />
        <ErrorState error={error} />
      </>
    );
  }

  const visita = cobertura.find((c) => c.tipo === "visita");
  const refil = cobertura.find((c) => c.tipo === "refil");
  const criticos = gaps.filter((g) => g.criticidade === "critico").length;
  const topGaps = gaps.slice(0, 8);

  const tone = (p: number | null | undefined) =>
    p === null || p === undefined ? "default" : p >= 90 ? "good" : p >= 70 ? "warn" : "bad";

  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle={`Cobertura, gaps e alertas de ${mesLabel(mes)}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Cobertura visita"
          value={pct(visita?.percentual_cobertura)}
          sub={visita ? `${num(visita.atendidas)} de ${num(visita.total_expectativas)}` : "sem dados"}
          tone={tone(visita?.percentual_cobertura)}
        />
        <Stat
          label="Cobertura refil"
          value={pct(refil?.percentual_cobertura)}
          sub={refil ? `${num(refil.atendidas)} de ${num(refil.total_expectativas)}` : "sem refil no mês"}
          tone={tone(refil?.percentual_cobertura)}
        />
        <Stat
          label="Gaps abertos"
          value={num(gaps.length)}
          sub={`${num(criticos)} crítico(s)`}
          tone={criticos > 0 ? "bad" : gaps.length > 0 ? "warn" : "good"}
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
            {[visita, refil].filter(Boolean).length === 0 && (
              <EmptyState>Nenhuma expectativa gerada para o mês.</EmptyState>
            )}
            {visita && <CoberturaRow titulo="Visitas" c={visita} />}
            {refil && <CoberturaRow titulo="Refis" c={refil} />}
          </div>
        </Card>

        <Card>
          <CardTitle hint={`${num(gaps.length)} no total`}>
            Gaps mais críticos
          </CardTitle>
          {topGaps.length === 0 ? (
            <EmptyState>Sem gaps abertos. 🎉</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {topGaps.map((g) => (
                <li
                  key={g.expectativa_id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {g.cliente_nome}
                    </div>
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
            <Link
              href="/gaps"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Ver todos os gaps →
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}

function CoberturaRow({ titulo, c }: { titulo: string; c: CoberturaMensal }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">{titulo}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {pct(c.percentual_cobertura)}
        </span>
      </div>
      <Bar
        value={c.atendidas}
        max={c.total_expectativas}
        className="bg-emerald-500"
      />
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          <strong className="text-emerald-600">{num(c.atendidas)}</strong> atendidas
        </span>
        <span>
          <strong className="text-amber-600">{num(c.em_execucao)}</strong> em execução
        </span>
        <span>
          <strong className="text-red-600">{num(c.pendentes)}</strong> pendentes
        </span>
        <span className="text-slate-400">de {num(c.total_expectativas)}</span>
      </div>
    </div>
  );
}
