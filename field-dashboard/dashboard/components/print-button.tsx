"use client";

/** Botão que dispara o print do navegador (Ctrl+P / salvar PDF). Escondido no print. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
    >
      <span aria-hidden>🖨️</span> Imprimir / PDF
    </button>
  );
}
