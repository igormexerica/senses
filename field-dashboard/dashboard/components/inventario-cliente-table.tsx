"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InventarioCliente } from "@/lib/field";
import { num } from "@/lib/format";
import { EmptyState, Tag } from "@/components/ui";

export function InventarioClienteTable({ rows }: { rows: InventarioCliente[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) =>
        r.cliente_nome.toLowerCase().includes(t) ||
        Object.keys(r.por_modelo ?? {}).some((m) => m.toLowerCase().includes(t)),
    );
  }, [q, rows]);

  return (
    <div>
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por cliente ou modelo…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
        />
        {q && (
          <div className="mt-2 text-xs text-slate-400">
            {num(filtered.length)} de {num(rows.length)} clientes
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <EmptyState>Nenhum cliente encontrado.</EmptyState>
      ) : (
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium sm:px-5">Cliente</th>
                <th className="px-3 py-2 text-right font-medium">Máquinas</th>
                <th className="px-4 py-2 font-medium sm:px-5">Modelos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((r) => (
                <tr key={r.cliente_id} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium sm:px-5">
                    <Link href={`/cliente/${r.cliente_id}`} className="text-slate-800 hover:text-brand-600 hover:underline">
                      {r.cliente_nome}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                    {num(r.total_equipamentos)}
                  </td>
                  <td className="px-4 py-2.5 sm:px-5">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(r.por_modelo ?? {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([modelo, qtd]) => (
                          <Tag key={modelo}>
                            {modelo === "NÃO IDENTIFICADO" ? "n/ident." : modelo}
                            <span className="ml-1 text-slate-400">×{qtd}</span>
                          </Tag>
                        ))}
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
