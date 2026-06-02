"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GapMensal, TipoExpectativa, PlanoAcao } from "@/lib/field";
import { num, estadoGap } from "@/lib/format";
import { PrioridadeBadge, EstadoTag, Tag, EmptyState } from "@/components/ui";
import { AcaoControl } from "@/components/acao-control";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_execucao: "Em execução",
};

export function GapsTable({
  rows,
  planos = {},
  mesAtual,
  dia,
}: {
  rows: GapMensal[];
  planos?: Record<string, PlanoAcao>;
  mesAtual: string;
  dia: number;
}) {
  const [tipo, setTipo] = useState<TipoExpectativa | "all">("all");
  const [estado, setEstado] = useState<"all" | "atrasado" | "sem_agendamento" | "agendado">("all");

  const comEstado = useMemo(
    () => rows.map((r) => ({ r, e: estadoGap(r.agendado_field, r.mes_referencia, mesAtual, dia) })),
    [rows, mesAtual, dia],
  );
  const filtered = comEstado.filter(
    ({ r, e }) => (tipo === "all" || r.tipo === tipo) && (estado === "all" || e === estado),
  );
  const atrasados = comEstado.filter((x) => x.e === "atrasado").length;
  const semAg = comEstado.filter((x) => x.e === "sem_agendamento").length;

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-1.5">
          {(["all", "atrasado", "sem_agendamento", "agendado"] as const).map((e) => (
            <button key={e} onClick={() => setEstado(e)} className={chip(estado === e)}>
              {e === "all" ? "Todos" : e === "atrasado" ? "Atrasado" : e === "sem_agendamento" ? "Sem agendamento" : "Agendado"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {(["all", "visita", "refil"] as const).map((t) => (
            <button key={t} onClick={() => setTipo(t)} className={chip(tipo === t)}>
              {t === "all" ? "Tipos" : t === "visita" ? "Visita" : "Refil"}
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-2 text-xs">
          {atrasados > 0 && <span className="font-medium text-red-600">{num(atrasados)} atrasados</span>}
          <span className="font-medium text-slate-500">{num(semAg)} sem agendamento</span>
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>Nenhum gap com esses filtros.</EmptyState>
      ) : (
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium sm:px-5">Cliente</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Segmento</th>
                <th className="px-3 py-2 font-medium" title="ordem de atendimento (tier × jornada)">Prioridade</th>
                <th className="px-4 py-2 font-medium sm:px-5">Estado / ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(({ r: g, e }) => (
                <tr key={g.expectativa_id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium sm:px-5">
                    <Link href={`/cliente/${g.cliente_id}`} className="text-slate-800 hover:text-brand-600 hover:underline">
                      {g.cliente_nome}
                    </Link>
                    <span className="ml-2 text-[11px] font-normal text-slate-400">{STATUS_LABEL[g.status] ?? g.status}</span>
                  </td>
                  <td className="px-3 py-2.5 capitalize text-slate-600">{g.tipo}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {g.tier && <Tag>{g.tier}</Tag>}
                      {g.jornada_atual && <Tag>{g.jornada_atual}</Tag>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><PrioridadeBadge value={g.criticidade} /></td>
                  <td className="px-4 py-2.5 sm:px-5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {planos[g.expectativa_id] ? null : <EstadoTag value={e} />}
                      <AcaoControl expectativaId={g.expectativa_id} plano={planos[g.expectativa_id]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
