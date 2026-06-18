import type { ReactNode } from "react";

/** Primitivos visuais compartilhados pelo shell e pelas telas (tema aubergine). */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface shadow-sm ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 mt-10 flex items-baseline justify-between gap-3 first:mt-0">
      <h2 className="font-display text-lg font-semibold text-aubergine-900">{children}</h2>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-muted/70">{children}</div>;
}

export function ErrorState({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Card className="border-red-200 bg-red-50 p-5">
      <div className="text-sm font-medium text-red-700">Não foi possível carregar os dados.</div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-red-600/80">
        {msg}
      </pre>
      <div className="mt-2 text-xs text-red-600/70">
        Confira <code>DATABASE_URL</code> (server-only) e se o schema <code>analytics</code> foi
        aplicado (ver <code>data/README.md</code>).
      </div>
    </Card>
  );
}
