import { getGaps } from "@/lib/field";
import { mesLabel } from "@/lib/format";
import { PageHeader, ErrorState } from "@/components/ui";
import { GapsTable } from "@/components/gaps-table";

export const dynamic = "force-dynamic";

const mesAtualISO = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

export default async function GapsPage() {
  let gaps: Awaited<ReturnType<typeof getGaps>>;
  try {
    gaps = await getGaps(1000);
  } catch (error) {
    return (
      <>
        <PageHeader title="Gaps do mês" />
        <ErrorState error={error} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Gaps do mês"
        subtitle={`Expectativas pendentes ou em execução — ${mesLabel(mesAtualISO())}`}
      />
      <GapsTable rows={gaps} />
    </>
  );
}
