"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GROUPS, FOOTER_ITEMS, isActive, type NavItem } from "@/components/nav";

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        S
      </span>
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-900">Field</div>
          <div className="text-[11px] text-slate-500">Senses · CS Ops</div>
        </div>
      )}
    </div>
  );
}

function NavLink({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      } ${collapsed ? "justify-center" : ""}`}
    >
      <span className="w-4 shrink-0 text-center text-xs opacity-80">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function NavList({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-4">
      {GROUPS.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {g.label &&
            (collapsed ? (
              gi > 0 && <div className="mx-3 mb-1 border-t border-slate-100" />
            ) : (
              <div className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {g.label}
              </div>
            ))}
          {g.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function Footer({
  user,
  collapsed,
  pathname,
  onNavigate,
}: {
  user: string | null;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="mt-auto flex flex-col gap-1 pt-4">
      {FOOTER_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
      {!collapsed && (
        <div className="mt-2 border-t border-slate-100 px-3 pt-3 text-[11px] leading-tight text-slate-400">
          {user && <div className="truncate font-medium text-slate-500" title={user}>{user}</div>}
          <div className="mt-0.5">Sincroniza do Field a cada 30 min.</div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  initialCollapsed,
  user,
}: {
  initialCollapsed: boolean;
  user: string | null;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sidebar_collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <>
      {/* ---------- Desktop (colapsável) ---------- */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 transition-[width] duration-200 lg:flex print:hidden ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} px-1`}>
          <Brand collapsed={collapsed} />
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Recolher menu"
              aria-label="Recolher menu"
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              «
            </button>
          )}
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Expandir menu"
            aria-label="Expandir menu"
            className="mx-auto mt-2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            »
          </button>
        )}
        <div className="mt-6 flex flex-1 flex-col">
          <NavList pathname={pathname} collapsed={collapsed} />
          <Footer user={user} collapsed={collapsed} pathname={pathname} />
        </div>
      </aside>

      {/* ---------- Mobile (top bar fixa + drawer) ---------- */}
      <header className="fixed inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
        >
          ☰
        </button>
        <Brand />
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 lg:hidden print:hidden">
          <div
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 py-5">
            <div className="flex items-center justify-between px-1">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="mt-6 flex flex-1 flex-col">
              <NavList pathname={pathname} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              <Footer
                user={user}
                collapsed={false}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
