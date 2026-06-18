import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ultimaAtualizacao } from "@/lib/db";
import { usuarioBasic } from "@/lib/auth";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});
const ui = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BI · Senses E-commerce",
  description: "Dashboard de BI do e-commerce Senses — diretoria.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const h = await headers();
  // Usuário do Basic Auth (login por pessoa) — só o login, nunca a senha.
  const user = usuarioBasic(h.get("authorization"));

  // "Última atualização" no header do shell. Resiliente: sem DATABASE_URL ou banco
  // indisponível → null (app não quebra; a tela mostra o estado de erro).
  let atualizado: string | null = null;
  try {
    atualizado = await ultimaAtualizacao();
  } catch {
    atualizado = null;
  }

  return (
    <html lang="pt-BR" className={`${display.variable} ${ui.variable}`}>
      <body>
        <AppShell user={user} atualizado={atualizado}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
