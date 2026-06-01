"use client";

import { useRef, useState } from "react";
import { registrarAcao } from "@/app/acoes/actions";
import type { PlanoAcao, StatusAcao } from "@/lib/field";

export const STATUS_META: Record<StatusAcao, { label: string; cls: string }> = {
  agendado: { label: "Agendado", cls: "bg-blue-100 text-blue-700 ring-blue-200" },
  em_contato: { label: "Em contato", cls: "bg-violet-100 text-violet-700 ring-violet-200" },
  aguardando_cliente: { label: "Aguardando cliente", cls: "bg-amber-100 text-amber-700 ring-amber-200" },
  resolvido: { label: "Resolvido", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
};

export function AcaoTag({ status }: { status: StatusAcao }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function AcaoControl({
  expectativaId,
  plano,
}: {
  expectativaId: string;
  plano?: PlanoAcao;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function onAction(fd: FormData) {
    setSaving(true);
    setErro(null);
    try {
      await registrarAcao(fd);
      ref.current?.close();
    } catch {
      setErro("Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  const fieldCls =
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-1 rounded-md transition hover:opacity-80"
        title={plano?.nota ?? "Registrar ação"}
      >
        {plano ? (
          <AcaoTag status={plano.status} />
        ) : (
          <span className="text-xs font-medium text-slate-400 hover:text-brand-600">+ ação</span>
        )}
      </button>

      <dialog
        ref={ref}
        className="m-auto w-[min(92vw,28rem)] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <form action={onAction} className="p-5">
          <h3 className="text-sm font-semibold text-slate-800">
            {plano ? "Editar ação" : "Registrar ação"}
          </h3>
          <input type="hidden" name="expectativa_id" value={expectativaId} />

          <label className="mt-3 block text-xs font-medium text-slate-500">
            Status
            <select name="status" defaultValue={plano?.status ?? "agendado"} className={fieldCls}>
              {Object.entries(STATUS_META).map(([v, m]) => (
                <option key={v} value={v}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-xs font-medium text-slate-500">
            Responsável
            <input
              name="responsavel"
              defaultValue={plano?.responsavel ?? ""}
              placeholder="quem do CS está tratando"
              className={fieldCls}
            />
          </label>

          <label className="mt-3 block text-xs font-medium text-slate-500">
            Nota
            <textarea
              name="nota"
              defaultValue={plano?.nota ?? ""}
              placeholder="o que foi combinado / próximo passo"
              rows={2}
              className={fieldCls}
            />
          </label>

          {erro && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            {plano ? (
              <button
                type="submit"
                name="_action"
                value="remover"
                formNoValidate
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                Remover ação
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => ref.current?.close()}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
