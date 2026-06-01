import { getGapsMes, getMesesDisponiveis } from "@/lib/field";
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
    gaps = await getGapsMes(mes, 1000);
    return (
      <>
        <PageHeader
          title="Gaps do mês"
          subtitle={`Expectativas pendentes ou em execução — ${mesLabel(mes)}`}
          right={<MonthPicker months={meses} value={mes} label="Mês" />}
        />
        <GapsTable rows={gaps} />
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
