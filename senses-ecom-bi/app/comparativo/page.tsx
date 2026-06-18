import { hojeISO } from "@/lib/format";
import { parsePeriodos } from "@/lib/periodos";
import { buildComparativo } from "@/lib/db";
import type { Comparativo } from "@/lib/types";
import { ComparativoView } from "@/components/comparativo-view";

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

  let periodos, preset;
  try {
    ({ periodos, preset } = parsePeriodos(flat, hoje));
  } catch {
    ({ periodos, preset } = parsePeriodos({}, hoje));
  }

  let initial: Comparativo | null = null;
  let initialError: string | null = null;
  try {
    initial = await buildComparativo(periodos);
  } catch (e) {
    initialError = e instanceof Error ? e.message : "Falha ao carregar os dados.";
  }

  return (
    <ComparativoView
      hoje={hoje}
      initialPeriodos={periodos}
      initialPreset={preset}
      initial={initial}
      initialError={initialError}
    />
  );
}
