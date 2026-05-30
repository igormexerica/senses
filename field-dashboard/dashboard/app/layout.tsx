import type { Metadata } from "next";
import "./globals.css";
import { NavLinks } from "@/components/nav";

export const metadata: Metadata = {
  title: "Field · Senses",
  description: "Painel de cobertura, inventário e gaps — CS Operations Senses.",
};

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        S
      </span>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-slate-900">Field</div>
        <div className="text-[11px] text-slate-500">Senses · CS Ops</div>
      </div>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full font-sans text-slate-900">
        <div className="flex min-h-screen">
          {/* Sidebar — desktop */}
          <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
            <div className="px-2">
              <Brand />
            </div>
            <div className="mt-7">
              <NavLinks variant="sidebar" />
            </div>
            <div className="mt-auto px-3 pt-6 text-[11px] text-slate-400">
              Dados sincronizados do Field Control a cada 30 min.
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Topbar — mobile */}
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <Brand />
              </div>
              <div className="mt-3">
                <NavLinks variant="top" />
              </div>
            </header>

            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
