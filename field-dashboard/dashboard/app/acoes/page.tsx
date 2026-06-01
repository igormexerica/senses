import { getVPlanosAcao } from "@/lib/field";
import { num } from "@/lib/format";
import { PageHeader, Stat, ErrorState } from "@/components/ui";
import { AcoesList } from "@/components/acoes-list";

export const dynamic = "force-dynamic";

export default async function AcoesPage() {
  let rows: Awaited<ReturnType<typeof getVPlanosAcao>>;
  try {
    rows = await getVPlanosAcao();
  } catch (error) {
    return (
      <>
        <PageHeader title="Planos de ação" />
        <ErrorState error={error} />
      </>
    );
  }

  const by = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader
        title="Planos de ação"
        subtitle="Ações do CS sobre os gaps — registradas a partir da aba Gaps"
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Agendado" value={num(by("agendado"))} />
        <Stat label="Em contato" value={num(by("em_contato"))} />
        <Stat label="Aguardando cliente" value={num(by("aguardando_cliente"))} tone="warn" />
        <Stat label="Resolvido" value={num(by("resolvido"))} tone="good" />
      </div>

      <div className="mt-4 lg:mt-6">
        <AcoesList rows={rows} />
      </div>
    </>
  );
}
