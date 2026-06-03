import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Field · Senses",
  description: "Painel de cobertura, inventário e gaps — CS Operations Senses.",
};

/** Usuário logado (Basic Auth) — só o login, nunca a senha. */
function usuarioDoHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    return i > 0 ? decoded.slice(0, i) : null;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const collapsed = c.get("sidebar_collapsed")?.value === "1";
  const user = usuarioDoHeader(h.get("authorization"));

  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full font-sans text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar initialCollapsed={collapsed} user={user} />

          <div className="flex min-w-0 flex-1 flex-col">
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-6 pt-[4.25rem] sm:px-6 lg:px-8 lg:py-8 lg:pt-8 print:max-w-none print:p-0">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
