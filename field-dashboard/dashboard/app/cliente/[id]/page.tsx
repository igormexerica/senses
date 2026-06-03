import Link from "next/link";
import {
  getClienteDetalhe,
  getEquipamentosCliente,
  getOSCliente,
  getAvaliacoesCliente,
  getGapsCliente,
} from "@/lib/field";
import { getPlanosAcaoCliente } from "@/lib/field-write";
import { dataCurta, mesLabel, num } from "@/lib/format";
import {
  PageHeader,
  Card,
  CardTitle,
  Stat,
  Tag,
  PrioridadeBadge,
  EmptyState,
  ErrorState,
} from "@/components/ui";

export const dynamic = "force-dynamic";

function Stars({ n }: { n: number | null }) {
  const v = n ?? 0;
  return (
    <span className="text-sm" title={`${v}/5`}>
      <span className="text-amber-500">{"★".repeat(v)}</span>
      <span className="text-slate-200">{"★".repeat(Math.max(0, 5 - v))}</span>
    </span>
  );
}

export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detalhe, equip, os, avals, gaps, planos;
  try {
    [detalhe, equip, os, avals, gaps, planos] = await Promise.all([
      getClienteDetalhe(id),
      getEquipamentosCliente(id),
      getOSCliente(id, 15),
      getAvaliacoesCliente(id),
      getGapsCliente(id),
      getPlanosAcaoCliente(id),
    ]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Cliente" />
        <ErrorState error={error} />
      </>
    );
  }

  const c = detalhe[0];
  if (!c) {
    return (
      <>
        <PageHeader title="Cliente" />
        <EmptyState>Cliente não encontrado.</EmptyState>
      </>
    );
  }

  const maquinasAtivas = equip.filter((e) => !e.archived);
  const comNota = avals.filter((a) => a.nota !== null);
  const media =
    comNota.length > 0
      ? (comNota.reduce((s, a) => s + (a.nota ?? 0), 0) / comNota.length).toFixed(2)
      : "—";
  const planoPorExp = new Map(planos.map((p) => [p.expectativa_id, p]));
  const desalinhado =
    c.jornada_atual && c.jornada_esperada && c.jornada_atual !== c.jornada_esperada;

  return (
    <>
      <div className="mb-4">
        <Link href="/gaps" className="text-sm text-brand-600 hover:text-brand-700">
          ← Voltar
        </Link>
      </div>

      <PageHeader
        title={c.nome}
        subtitle={`${c.ativo ? "Ativo" : "Inativo"}${
          c.meses_de_casa != null ? ` · ${c.meses_de_casa} meses de casa` : ""
        }`}
        right={
          <div className="flex flex-wrap justify-end gap-1">
            {c.tier && <Tag>{c.tier}</Tag>}
            {c.modalidade && <Tag>{c.modalidade}</Tag>}
            {c.jornada_atual && <Tag>{c.jornada_atual}</Tag>}
          </div>
        }
      />

      {desalinhado && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Jornada possivelmente desalinhada: etiqueta <strong>{c.jornada_atual}</strong>, mas
          pelo tempo de casa esperaria <strong>{c.jornada_esperada}</strong>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Máquinas" value={num(maquinasAtivas.length)} sub={equip.length > maquinasAtivas.length ? `+${num(equip.length - maquinasAtivas.length)} arquivadas` : undefined} />
        <Stat label="OS (recentes)" value={num(os.length)} />
        <Stat label="Avaliação média" value={media} sub={`${num(comNota.length)} avaliação(ões)`} tone={comNota.length && Number(media) <= 3 ? "bad" : "good"} />
        <Stat label="Gaps abertos" value={num(gaps.length)} tone={gaps.length ? "warn" : "good"} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-6 lg:grid-cols-2">
        <Card>
          <CardTitle hint={`${num(maquinasAtivas.length)} em uso`}>Máquinas</CardTitle>
          {equip.length === 0 ? (
            <EmptyState>Sem máquinas cadastradas.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-50">
              {equip.map((e) => (
                <li key={e.id} className={`flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5 ${e.archived ? "opacity-50" : ""}`}>
                  <span className="min-w-0 truncate text-sm text-slate-700">
                    {e.modelo ?? <span className="italic text-slate-400">{e.nome || "sem nome"}</span>}
                    {e.cor && <span className="ml-1 text-slate-400">· {e.cor.toLowerCase()}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {e.numero ? `#${e.numero}` : ""}{e.archived ? " · arquivada" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle hint={`${num(gaps.length)}`}>Gaps & ações</CardTitle>
          {gaps.length === 0 ? (
            <EmptyState>Sem gaps abertos. 🎉</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-50">
              {gaps.map((g) => {
                const p = planoPorExp.get(g.expectativa_id);
                return (
                  <li key={g.expectativa_id} className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                    <span className="min-w-0 truncate text-sm capitalize text-slate-700">
                      {g.tipo} · {mesLabel(g.mes_referencia)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <PrioridadeBadge value={g.criticidade} />
                      {p ? (
                        <Tag>{p.status.replace(/_/g, " ")}</Tag>
                      ) : g.agendado_field ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Agendado</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle hint={`${num(os.length)}`}>Últimas OS</CardTitle>
          {os.length === 0 ? (
            <EmptyState>Sem OS.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-50">
              {os.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0 truncate text-sm text-slate-700">{o.tipo ?? "—"}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                    <span className="capitalize">{o.status ?? "—"}</span>
                    <span>{dataCurta(o.concluida_em ?? o.criada_em)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle hint={`${num(avals.length)}`}>Avaliações</CardTitle>
          {avals.length === 0 ? (
            <EmptyState>Sem avaliações.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-50">
              {avals.map((a) => (
                <li key={a.id} className="px-4 py-2.5 sm:px-5">
                  <div className="flex items-center justify-between">
                    <Stars n={a.nota} />
                    <span className="text-xs text-slate-400">{dataCurta(a.data_avaliacao)}</span>
                  </div>
                  {a.comentario?.trim() && (
                    <p className="mt-1 text-sm text-slate-600">“{a.comentario.trim()}”</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
