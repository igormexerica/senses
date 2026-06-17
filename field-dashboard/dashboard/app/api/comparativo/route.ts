/**
 * GET /api/comparativo
 *
 * Devolve o comparativo de 3 períodos em JSON (KPIs + tráfego + retenção +
 * deltas + última atualização). Toda a credencial de banco fica no server
 * (lib/bi.ts importa "server-only") — nada disso chega ao bundle do client.
 *
 * Query:
 *   ?preset=mtd|30d|14d|7d            → presets de janelas do mesmo tamanho
 *   ?p1ini&p1fim&p2ini&p2fim&p3ini&p3fim  → custom (6 datas YYYY-MM-DD)
 *
 * Custom inválido (data inexistente, fim < ini) → 400. Erro de banco → 500.
 */
import { type NextRequest } from "next/server";
import { buildComparativo } from "@/lib/bi";
import { parsePeriodos } from "@/lib/periodos";
import { hojeISO } from "@/lib/format";

export const runtime = "nodejs"; // pg precisa de Node, não Edge
export const dynamic = "force-dynamic"; // sempre dados frescos do banco

const PARAMS = ["preset", "p1ini", "p1fim", "p2ini", "p2fim", "p3ini", "p3fim"] as const;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const params: Record<string, string | undefined> = {};
  for (const k of PARAMS) {
    const v = sp.get(k);
    if (v != null) params[k] = v;
  }

  let periodos;
  try {
    ({ periodos } = parsePeriodos(params, hojeISO()));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Parâmetros inválidos." },
      { status: 400 },
    );
  }

  try {
    const data = await buildComparativo(periodos);
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao consultar o banco." },
      { status: 500 },
    );
  }
}
