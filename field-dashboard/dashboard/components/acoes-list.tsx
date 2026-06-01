"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PlanoAcaoView, StatusAcao } from "@/lib/field";
import { mesLabel, dataHora, num } from "@/lib/format";
import { Tag, EmptyState } from "@/components/ui";
import { AcaoControl, STATUS_META } from "@/components/acao-control";

const ORDER: StatusAcao[] = ["agendado", "em_contato", "aguardando_cliente", "resolvido"];

export function AcoesList({ rows }: { rows: PlanoAcaoView[] }) {
  const [f, setF] = useState<StatusAcao | "all">("all");
  const filtered = useMemo(() => (f === "all" ? rows : rows.filter((r) => r.status === f)), [rows, f]);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-3 sm:px-5">
        <button onClick={() => setF("all")} className={chip(f === "all")}>
          Todas
        </button>
        {ORDER.map((s) => (
          <button key={s} onClick={() => setF(s)} className={chip(f === s)}>
            {STATUS_META[s].label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          {num(filtered.length)} de {num(rows.length)}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>Nenhuma ação registrada ainda. Registre a partir dos Gaps.</EmptyState>
      ) : (
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium sm:px-5">Cliente</th>
                <th className="px-3 py-2 font-medium">Gap</th>
                <th className="px-3 py-2 font-medium">Responsável</th>
                <th className="px-3 py-2 font-medium">Nota</th>
                <th className="px-3 py-2 font-medium">Atualizado</th>
                <th className="px-4 py-2 font-medium sm:px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((r) => (
                <tr key={r.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium sm:px-5">
                    <Link href={`/cliente/${r.cliente_id}`} className="text-slate-800 hover:text-brand-600 hover:underline">
                      {r.cliente_nome}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {r.tier && <Tag>{r.tier}</Tag>}
                      {r.jornada_atual && <Tag>{r.jornada_atual}</Tag>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 capitalize text-slate-600">
                    {r.tipo} · {mesLabel(r.mes_referencia)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{r.responsavel ?? "—"}</td>
                  <td className="max-w-xs px-3 py-2.5 text-slate-500">{r.nota ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{dataHora(r.updated_at)}</td>
                  <td className="px-4 py-2.5 sm:px-5">
                    <AcaoControl
                      expectativaId={r.expectativa_id}
                      plano={{
                        id: r.id,
                        expectativa_id: r.expectativa_id,
                        status: r.status,
                        responsavel: r.responsavel,
                        nota: r.nota,
                        updated_at: r.updated_at,
                      }}
                    />
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
