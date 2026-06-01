"use client";

import { useMemo, useState } from "react";
import type { Gap, Criticidade, TipoExpectativa, PlanoAcao } from "@/lib/field";
import { num } from "@/lib/format";
import { CriticidadeBadge, Tag, EmptyState } from "@/components/ui";
import { AcaoControl } from "@/components/acao-control";

const CRITS: Criticidade[] = ["critico", "alto", "medio", "estavel"];
const CRIT_LABEL: Record<Criticidade, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Médio",
  estavel: "Estável",
};
const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_execucao: "Em execução",
};

export function GapsTable({
  rows,
  planos = {},
}: {
  rows: Gap[];
  planos?: Record<string, PlanoAcao>;
}) {
  const [crit, setCrit] = useState<Criticidade | "all">("all");
  const [tipo, setTipo] = useState<TipoExpectativa | "all">("all");
  const [acao, setAcao] = useState<"all" | "sem" | "com">("all");

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const temAcao = !!planos[r.expectativa_id];
        return (
          (crit === "all" || r.criticidade === crit) &&
          (tipo === "all" || r.tipo === tipo) &&
          (acao === "all" || (acao === "com" ? temAcao : !temAcao))
        );
      }),
    [rows, crit, tipo, acao, planos],
  );

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setCrit("all")} className={chip(crit === "all")}>
            Todas
          </button>
          {CRITS.map((c) => (
            <button key={c} onClick={() => setCrit(c)} className={chip(crit === c)}>
              {CRIT_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {(["all", "visita", "refil"] as const).map((t) => (
            <button key={t} onClick={() => setTipo(t)} className={chip(tipo === t)}>
              {t === "all" ? "Todos" : t === "visita" ? "Visita" : "Refil"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {(["all", "sem", "com"] as const).map((aF) => (
            <button key={aF} onClick={() => setAcao(aF)} className={chip(acao === aF)}>
              {aF === "all" ? "Tudo" : aF === "sem" ? "Sem ação" : "Com ação"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {num(filtered.length)} de {num(rows.length)}
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
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Segmento</th>
                <th className="px-3 py-2 text-right font-medium">Criticidade</th>
                <th className="px-4 py-2 font-medium sm:px-5">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((g) => (
                <tr key={g.expectativa_id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-800 sm:px-5">
                    {g.cliente_nome}
                  </td>
                  <td className="px-3 py-2.5 capitalize text-slate-600">{g.tipo}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {STATUS_LABEL[g.status] ?? g.status}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {g.tier && <Tag>{g.tier}</Tag>}
                      {g.jornada_atual && <Tag>{g.jornada_atual}</Tag>}
                      {g.modalidade && <Tag>{g.modalidade}</Tag>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <CriticidadeBadge value={g.criticidade} />
                  </td>
                  <td className="px-4 py-2.5 sm:px-5">
                    <AcaoControl expectativaId={g.expectativa_id} plano={planos[g.expectativa_id]} />
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
