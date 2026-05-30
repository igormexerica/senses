import type { ReactNode } from "react";
import type { Criticidade } from "@/lib/field";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="text-sm text-slate-500">{right}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
      <h2 className="text-sm font-semibold text-slate-800">{children}</h2>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneCls = {
    default: "text-slate-900",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  }[tone];
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums sm:text-3xl ${toneCls}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
}

const CRIT_STYLE: Record<Criticidade, string> = {
  critico: "bg-red-100 text-red-700 ring-red-200",
  alto: "bg-amber-100 text-amber-700 ring-amber-200",
  medio: "bg-yellow-100 text-yellow-700 ring-yellow-200",
  estavel: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};
const CRIT_LABEL: Record<Criticidade, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Médio",
  estavel: "Estável",
};

export function CriticidadeBadge({ value }: { value: Criticidade | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CRIT_STYLE[value]}`}
    >
      {CRIT_LABEL[value]}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
      {children}
    </span>
  );
}

/** Barra horizontal proporcional (sem lib de chart). */
export function Bar({
  value,
  max,
  className = "bg-brand-500",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-slate-400">{children}</div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Card className="border-red-200 bg-red-50 p-5">
      <div className="text-sm font-medium text-red-700">
        Não foi possível carregar os dados.
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-red-600/80">
        {msg}
      </pre>
      <div className="mt-2 text-xs text-red-600/70">
        Confira se o Supabase (Kong) está acessível em <code>SUPABASE_URL</code> e
        se a <code>SUPABASE_ANON_KEY</code> está setada.
      </div>
    </Card>
  );
}
