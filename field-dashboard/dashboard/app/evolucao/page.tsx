import {
  getEvolucao,
  getMesesDisponiveis,
  getAvaliacaoMensal,
  type EvolucaoMensal,
  type AvaliacaoMensal,
} from "@/lib/field";
import { mesAtualISO, mesLabel, num, pct, deltaPp, ppLabel } from "@/lib/format";
import {
  PageHeader,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
} from "@/components/ui";
import { TrendChart, type TrendPoint } from "@/components/trend-chart";
import { MonthPicker } from "@/components/month-picker";

export const dynamic = "force-dynamic";

interface MesAgg {
  mes: string;
  visita?: EvolucaoMensal;
  refil?: EvolucaoMensal;
  gaps: number;
  total: number;
}

function agregar(rows: EvolucaoMensal[]): MesAgg[] {
  const map = new Map<string, MesAgg>();
  for (const r of rows) {
    const a = map.get(r.mes_referencia) ?? { mes: r.mes_referencia, gaps: 0, total: 0 };
    a[r.tipo] = r;
    a.gaps += r.pendente + r.em_execucao;
    a.total += r.total;
    map.set(r.mes_referencia, a);
  }
  return [...map.values()].sort((x, y) => x.mes.localeCompare(y.mes));
}

export default async function EvolucaoPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  let rows: EvolucaoMensal[];
  let meses: string[];
  let avals: AvaliacaoMensal[];
  try {
    [rows, meses, avals] = await Promise.all([
      getEvolucao(),
      getMesesDisponiveis(),
      getAvaliacaoMensal(),
    ]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Evolução" />
        <ErrorState error={error} />
      </>
    );
  }

  const agg = agregar(rows);
  const avalMap = new Map(avals.map((a) => [a.mes_referencia, a]));
  const atual = mesAtualISO();
  const completos = agg.filter((m) => m.mes < atual); // mês corrente está em curso

  const sp = await searchParams;
  // comparador só entre meses FECHADOS (o mês em curso daria delta enganoso)
  const mesesFechados = meses.filter((m) => m < atual);
  const defA = mesesFechados[0] ?? meses[0];
  const defB = mesesFechados[1] ?? defA;
  const a = mesesFechados.includes(sp.a ?? "") ? sp.a! : defA;
  const b = mesesFechados.includes(sp.b ?? "") ? sp.b! : defB;
  const aggA = agg.find((m) => m.mes === a);
  const aggB = agg.find((m) => m.mes === b);

  const chartData: TrendPoint[] = completos.map((m) => ({
    mes: m.mes,
    visita: m.visita?.realizado_pct ?? null,
    refil: m.refil?.realizado_pct ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Evolução"
        subtitle="Cobertura mês a mês — realizado (entregue) por tipo de serviço"
      />

      <Card>
        <CardTitle hint={`${completos.length} meses concluídos`}>
          Cobertura realizada (%)
        </CardTitle>
        <div className="p-4 sm:p-5">
          {chartData.length === 0 ? (
            <EmptyState>Sem meses concluídos ainda.</EmptyState>
          ) : (
            <TrendChart data={chartData} />
          )}
          <p className="mt-3 text-xs text-slate-400">
            “Realizado” = serviço entregue (OS criada). Para refil, o registro do
            código de rastreio só ficou consistente a partir de nov/2025 — por isso
            a coluna “com rastreio” da tabela é menor que o realizado nos meses
            antigos. O mês corrente fica fora do gráfico (em curso).
          </p>
        </div>
      </Card>

      {/* Comparador A × B */}
      <Card className="mt-4 lg:mt-6">
        <CardTitle>Comparar dois meses</CardTitle>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <MonthPicker months={mesesFechados} value={a} param="a" label="Mês A" />
          <span className="text-slate-300">×</span>
          <MonthPicker months={mesesFechados} value={b} param="b" label="Mês B" />
        </div>
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium sm:px-5">Métrica</th>
                <th className="px-3 py-2 text-right font-medium">{mesLabel(a)}</th>
                <th className="px-3 py-2 text-right font-medium">{mesLabel(b)}</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Δ (A−B)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <CompRow
                label="Visita — realizado"
                av={aggA?.visita?.realizado_pct}
                bv={aggB?.visita?.realizado_pct}
                fmt={pct}
                pp
              />
              <CompRow
                label="Refil — realizado"
                av={aggA?.refil?.realizado_pct}
                bv={aggB?.refil?.realizado_pct}
                fmt={pct}
                pp
              />
              <CompRow
                label="Refil — com rastreio"
                av={aggA?.refil?.cobertura_pct}
                bv={aggB?.refil?.cobertura_pct}
                fmt={pct}
                pp
              />
              <CompRow
                label="Avaliação média (1–5)"
                av={avalMap.get(a)?.media}
                bv={avalMap.get(b)?.media}
                fmt={nota}
              />
              <CompRow
                label="Gaps abertos"
                av={aggA?.gaps}
                bv={aggB?.gaps}
                fmt={num}
                invert
              />
              <CompRow
                label="Expectativas (meta)"
                av={aggA?.total}
                bv={aggB?.total}
                fmt={num}
              />
            </tbody>
          </table>
        </div>
      </Card>

      {/* Tabela mês a mês */}
      <Card className="mt-4 lg:mt-6">
        <CardTitle hint={`${agg.length} meses`}>Mês a mês</CardTitle>
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium sm:px-5">Mês</th>
                <th className="px-3 py-2 text-right font-medium">Visita</th>
                <th className="px-3 py-2 text-right font-medium">Refil</th>
                <th className="px-3 py-2 text-right font-medium" title="refil concluído com código de rastreio">
                  Refil c/ rastreio
                </th>
                <th className="px-3 py-2 text-right font-medium">Gaps</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5" title="nota média 1–5 (amostra do mês)">
                  Avaliação
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...agg].reverse().map((m) => {
                const emCurso = m.mes >= atual;
                return (
                  <tr key={m.mes} className={emCurso ? "bg-amber-50/40" : "hover:bg-slate-50/60"}>
                    <td className="px-4 py-2.5 font-medium text-slate-800 sm:px-5">
                      {mesLabel(m.mes)}
                      {emCurso && (
                        <span className="ml-2 text-[11px] font-normal text-amber-600">em curso</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {pct(m.visita?.realizado_pct)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {m.refil ? pct(m.refil.realizado_pct) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                      {!m.refil ? (
                        "—"
                      ) : m.refil.com_rastreio === 0 && m.refil.realizado > 0 ? (
                        <span title="código de rastreio não registrado nesse mês">n/d</span>
                      ) : (
                        pct(m.refil.cobertura_pct)
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-800">
                      {num(m.gaps)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums sm:px-5">
                      {(() => {
                        const av = avalMap.get(m.mes);
                        if (!av || av.media === null) return <span className="text-slate-300">—</span>;
                        return (
                          <span
                            className={av.criticas > 0 ? "text-amber-700" : "text-slate-700"}
                            title={`${av.qtd} avaliação(ões)${av.criticas ? `, ${av.criticas} crítica(s)` : ""}`}
                          >
                            <span className="text-amber-500">★</span> {nota(av.media)}
                            <span className="ml-1 text-[11px] text-slate-400">({av.qtd})</span>
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function nota(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CompRow({
  label,
  av,
  bv,
  fmt,
  pp = false,
  invert = false,
}: {
  label: string;
  av: number | null | undefined;
  bv: number | null | undefined;
  fmt: (n: number | null | undefined) => string;
  pp?: boolean;
  invert?: boolean;
}) {
  const d =
    av === null || av === undefined || bv === null || bv === undefined
      ? null
      : pp
        ? deltaPp(av, bv)
        : Math.round((av - bv) * 10) / 10;
  // invert: pra "gaps", menos é melhor → cor verde quando Δ negativo
  const good = d === null ? false : invert ? d < 0 : d > 0;
  const bad = d === null ? false : invert ? d > 0 : d < 0;
  const tone = good ? "text-emerald-600" : bad ? "text-red-600" : "text-slate-400";
  const dLabel = d === null ? "—" : pp ? ppLabel(d) : `${d > 0 ? "+" : ""}${num(d)}`;
  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-4 py-2.5 text-slate-700 sm:px-5">{label}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">{fmt(av)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(bv)}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-medium sm:px-5 ${tone}`}>{dLabel}</td>
    </tr>
  );
}
