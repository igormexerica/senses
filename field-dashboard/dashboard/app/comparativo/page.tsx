import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { hojeISO } from "@/lib/format";
import { parsePeriodos } from "@/lib/periodos";
import { buildComparativo } from "@/lib/bi";
import type { Comparativo } from "@/lib/bi-types";
import { ComparativoPerformance } from "@/components/comparativo-performance";

// Tipografia do protótipo, escopada nesta rota (não afeta o resto do painel):
// Fraunces = display (números/títulos), Hanken Grotesk = UI.
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-display",
  display: "swap",
});
const ui = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

export const dynamic = "force-dynamic"; // dados vêm do banco a cada request

export default async function ComparativoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) flat[k] = Array.isArray(v) ? v[0] : v;

  const hoje = hojeISO();

  // Custom inválido na URL não derruba a página: cai pro preset default.
  let periodos, preset;
  try {
    ({ periodos, preset } = parsePeriodos(flat, hoje));
  } catch {
    ({ periodos, preset } = parsePeriodos({}, hoje));
  }

  // Fetch inicial no server (primeira pintura já com dado real). Os refetches
  // de preset/custom acontecem no client via /api/comparativo.
  let initial: Comparativo | null = null;
  let initialError: string | null = null;
  try {
    initial = await buildComparativo(periodos);
  } catch (e) {
    initialError = e instanceof Error ? e.message : "Falha ao carregar os dados.";
  }

  return (
    <div className={`${display.variable} ${ui.variable}`} style={{ fontFamily: "var(--font-ui)" }}>
      <ComparativoPerformance
        hoje={hoje}
        initialPeriodos={periodos}
        initialPreset={preset}
        initial={initial}
        initialError={initialError}
      />
    </div>
  );
}
