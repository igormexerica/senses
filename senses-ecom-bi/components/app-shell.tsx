"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Lock } from "lucide-react";
import { NAV, isActive } from "@/components/nav";
import { dataHora } from "@/lib/format";

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-aubergine-800 text-base font-semibold text-white">
        S
      </span>
      {!compact && (
        <div className="leading-tight">
          <div className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-aubergine-900">
            Senses
          </div>
          <div className="text-[11px] tracking-wide text-muted">BI · E-commerce</div>
        </div>
      )}
    </div>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        if (item.soon) {
          return (
            <div
              key={item.href}
              title="Em breve"
              className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted/70"
            >
              <Icon className="h-4 w-4 shrink-0 opacity-60" strokeWidth={2} />
              <span className="truncate">{item.label}</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-aubergine-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-aubergine-600">
                <Lock className="h-2.5 w-2.5" /> em breve
              </span>
            </div>
          );
        }
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-aubergine-800 text-white shadow-sm"
                : "text-ink/80 hover:bg-aubergine-50 hover:text-aubergine-900"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  user,
  atualizado,
  children,
}: {
  user: string | null;
  atualizado: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="px-1">
          <Wordmark />
        </div>
        <div className="mt-7 flex flex-1 flex-col">
          <NavList pathname={pathname} />
          <div className="mt-auto border-t border-line px-3 pt-4 text-[11px] leading-tight text-muted">
            {user && (
              <div className="truncate font-medium text-ink/70" title={user}>
                {user}
              </div>
            )}
            <div className="mt-0.5">Dashboard da diretoria · Senses</div>
          </div>
        </div>
      </aside>

      {/* ---------- Conteúdo ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar mobile */}
        <header className="flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="rounded-md p-1 text-ink/70 hover:bg-aubergine-50"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Wordmark />
          <span className="ml-auto text-[11px] text-muted">atualizado {dataHora(atualizado)}</span>
        </header>

        {/* top bar desktop (indicadores) */}
        <div className="hidden items-center justify-end gap-4 border-b border-line bg-surface/60 px-6 py-2.5 text-xs text-muted lg:flex">
          <span title={atualizado ? `Último dado em ${atualizado}` : undefined}>
            Última atualização: <span className="font-medium text-ink/70">{dataHora(atualizado)}</span>
          </span>
          {user && <span className="text-ink/50">·</span>}
          {user && <span className="text-ink/60">{user}</span>}
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      {/* ---------- Drawer mobile ---------- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-aubergine-900/30" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-line bg-surface px-3 py-5">
            <div className="flex items-center justify-between px-1">
              <Wordmark />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="rounded-md p-1 text-ink/60 hover:bg-aubergine-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-7">
              <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
