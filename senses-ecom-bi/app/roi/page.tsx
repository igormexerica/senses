import { roiEvolucao, listarInvestimentos } from "@/lib/roi";
import type { RoiPayload, Investimento } from "@/lib/types";
import { RoiView } from "@/components/roi-view";
import { ErrorState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RoiPage() {
  let payload: RoiPayload | null = null;
  let investimentos: Investimento[] = [];
  let erro: string | null = null;
  try {
    [payload, investimentos] = await Promise.all([roiEvolucao(), listarInvestimentos()]);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao carregar os dados.";
  }

  if (erro || !payload) {
    return (
      <>
        <h1 className="mb-4 font-display text-2xl font-semibold text-aubergine-900">ROI</h1>
        <ErrorState error={erro} />
      </>
    );
  }

  return <RoiView payload={payload} investimentos={investimentos} />;
}
