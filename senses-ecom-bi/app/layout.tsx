import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ultimaAtualizacao } from "@/lib/db";

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
  // Cloudflare Access injeta o e-mail do usuário autenticado neste header.
  const user = h.get("cf-access-authenticated-user-email");

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
