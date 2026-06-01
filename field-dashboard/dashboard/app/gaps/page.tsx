import { getGapsMes, getMesesDisponiveis, type PlanoAcao } from "@/lib/field";
import { getPlanosAcao } from "@/lib/field-write";
import { mesAtualISO, mesLabel, resolverMes } from "@/lib/format";
import { PageHeader, ErrorState } from "@/components/ui";
import { GapsTable } from "@/components/gaps-table";
import { MonthPicker } from "@/components/month-picker";

export const dynamic = "force-dynamic";

export default async function GapsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const sp = await searchParams;

  let meses: string[];
  let gaps: Awaited<ReturnType<typeof getGapsMes>>;
  try {
    meses = await getMesesDisponiveis();
    const mes = resolverMes(sp.mes, meses, mesAtualISO());
    const [gapsRes, planosRes] = await Promise.all([getGapsMes(mes, 1000), getPlanosAcao()]);
    gaps = gapsRes;
    const planos: Record<string, PlanoAcao> = {};
    for (const p of planosRes) planos[p.expectativa_id] = p;
    return (
      <>
        <PageHeader
          title="Gaps do mês"
          subtitle={`Expectativas pendentes ou em execução — ${mesLabel(mes)}`}
          right={<MonthPicker months={meses} value={mes} label="Mês" />}
        />
        <GapsTable rows={gaps} planos={planos} />
      </>
    );
  } catch (error) {
    return (
      <>
        <PageHeader title="Gaps do mês" />
        <ErrorState error={error} />
      </>
    );
  }
}
