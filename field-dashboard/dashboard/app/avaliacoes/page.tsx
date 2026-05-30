import { getAvaliacoesCriticas } from "@/lib/field";
import { dataCurta, num } from "@/lib/format";
import {
  PageHeader,
  Card,
  CardTitle,
  Stat,
  CriticidadeBadge,
  Tag,
  EmptyState,
  ErrorState,
} from "@/components/ui";

export const dynamic = "force-dynamic";

function Stars({ n }: { n: number | null }) {
  const v = n ?? 0;
  return (
    <span className="tabular-nums text-sm" title={`${v}/5`}>
      <span className="text-amber-500">{"★".repeat(v)}</span>
      <span className="text-slate-200">{"★".repeat(Math.max(0, 5 - v))}</span>
    </span>
  );
}

export default async function AvaliacoesPage() {
  let avaliacoes: Awaited<ReturnType<typeof getAvaliacoesCriticas>>;
  try {
    avaliacoes = await getAvaliacoesCriticas(200);
  } catch (error) {
    return (
      <>
        <PageHeader title="Avaliações" />
        <ErrorState error={error} />
      </>
    );
  }

  const comComentario = avaliacoes.filter((a) => a.comentario?.trim()).length;
  const naoAnalisadas = avaliacoes.filter((a) => !a.classificacao_agente).length;

  return (
    <>
      <PageHeader
        title="Avaliações críticas"
        subtitle="Notas ≤ 3, mais recentes primeiro"
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Avaliações ≤ 3" value={num(avaliacoes.length)} tone={avaliacoes.length ? "bad" : "good"} />
        <Stat label="Com comentário" value={num(comComentario)} />
        <Stat label="Sem análise" value={num(naoAnalisadas)} tone={naoAnalisadas ? "warn" : "good"} />
      </div>

      <Card className="mt-4 lg:mt-6">
        <CardTitle hint={`${num(avaliacoes.length)} avaliações`}>Detalhe</CardTitle>
        {avaliacoes.length === 0 ? (
          <EmptyState>Nenhuma avaliação crítica. 🎉</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {avaliacoes.map((a) => (
              <li key={a.avaliacao_id} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars n={a.nota} />
                    <span className="text-sm font-medium text-slate-800">
                      {a.cliente_nome ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {a.classificacao_agente && (
                      <CriticidadeBadge value={a.classificacao_agente} />
                    )}
                    <span>{dataCurta(a.data_avaliacao)}</span>
                  </div>
                </div>

                {a.comentario?.trim() && (
                  <p className="mt-1.5 text-sm text-slate-600">
                    “{a.comentario.trim()}”
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {a.tier && <Tag>{a.tier}</Tag>}
                  {a.jornada_atual && <Tag>{a.jornada_atual}</Tag>}
                  {a.modalidade && <Tag>{a.modalidade}</Tag>}
                </div>

                {a.sumario && (
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Agente:</span>{" "}
                    {a.sumario}
                    {a.acao_sugerida && (
                      <span className="mt-1 block text-slate-500">
                        → {a.acao_sugerida}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
