import Link from "next/link";
import { getAtividadeDiaria, type AtividadeDia } from "@/lib/field";
import { hojeISO, diasAtras, inicioSemanaISO, diaCurto, num } from "@/lib/format";
import { PageHeader, Card, CardTitle, Stat, EmptyState, ErrorState } from "@/components/ui";
import { BarsChart, type BarDatum } from "@/components/bars-chart";

export const dynamic = "force-dynamic";

interface Periodo {
  key: string;
  label: string;
  concluidas: number;
  visitas: number;
  refis: number;
  avaliacoes: number;
  notaSum: number;
}

function agregar(dias: AtividadeDia[], gran: "dia" | "semana"): Periodo[] {
  const map = new Map<string, Periodo>();
  for (const d of dias) {
    const key = gran === "semana" ? inicioSemanaISO(d.dia) : d.dia;
    const p =
      map.get(key) ??
      { key, label: diaCurto(key), concluidas: 0, visitas: 0, refis: 0, avaliacoes: 0, notaSum: 0 };
    p.concluidas += d.concluidas;
    p.visitas += d.visitas;
    p.refis += d.refis;
    p.avaliacoes += d.avaliacoes;
    p.notaSum += (d.nota_media ?? 0) * d.avaliacoes;
    map.set(key, p);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

const notaFmt = (notaSum: number, n: number) =>
  n > 0 ? (notaSum / n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

export default async function AtividadePage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const sp = await searchParams;
  const gran: "dia" | "semana" = sp.g === "dia" ? "dia" : "semana";
  const hoje = hojeISO();
  const desde = gran === "dia" ? diasAtras(hoje, 44) : diasAtras(hoje, 112);

  let dias: AtividadeDia[];
  try {
    dias = await getAtividadeDiaria(desde);
  } catch (error) {
    return (
      <>
        <PageHeader title="Atividade" />
        <ErrorState error={error} />
      </>
    );
  }

  const periodos = agregar(dias, gran);
  const totConcluidas = periodos.reduce((s, p) => s + p.concluidas, 0);
  const totAval = periodos.reduce((s, p) => s + p.avaliacoes, 0);
  const totNotaSum = periodos.reduce((s, p) => s + p.notaSum, 0);
  const media = periodos.length ? Math.round(totConcluidas / periodos.length) : 0;

  const chart: BarDatum[] = periodos.map((p) => ({
    label: p.label,
    value: p.concluidas,
    title: `${gran === "semana" ? "semana de " : ""}${p.label}: ${p.concluidas} concluídas`,
  }));

  const chip = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <>
      <PageHeader
        title="Atividade"
        subtitle="Throughput da equipe — OS concluídas e avaliações"
        right={
          <div className="flex gap-1.5">
            <Link href="/atividade?g=dia" className={chip(gran === "dia")}>
              Diária
            </Link>
            <Link href="/atividade?g=semana" className={chip(gran === "semana")}>
              Semanal
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="OS concluídas" value={num(totConcluidas)} sub={gran === "dia" ? "últimos 45 dias" : "últimas 16 semanas"} />
        <Stat label={`Média / ${gran === "dia" ? "dia" : "semana"}`} value={num(media)} />
        <Stat label="Avaliações" value={num(totAval)} />
        <Stat label="Nota média" value={notaFmt(totNotaSum, totAval)} tone="good" />
      </div>

      <Card className="mt-4 lg:mt-6">
        <CardTitle hint={gran === "dia" ? "por dia" : "por semana"}>OS concluídas</CardTitle>
        <div className="p-4 sm:p-5">
          {chart.length === 0 ? <EmptyState>Sem atividade no período.</EmptyState> : <BarsChart data={chart} />}
        </div>
      </Card>

      <Card className="mt-4 lg:mt-6">
        <CardTitle hint={`${periodos.length} ${gran === "dia" ? "dias" : "semanas"}`}>Detalhe</CardTitle>
        <div className="scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium sm:px-5">{gran === "dia" ? "Dia" : "Semana de"}</th>
                <th className="px-3 py-2 text-right font-medium">Concluídas</th>
                <th className="px-3 py-2 text-right font-medium">Visita</th>
                <th className="px-3 py-2 text-right font-medium">Refil</th>
                <th className="px-3 py-2 text-right font-medium">Avaliações</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...periodos].reverse().map((p) => (
                <tr key={p.key} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-800 sm:px-5">{p.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{num(p.concluidas)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{num(p.visitas)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{num(p.refis)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{num(p.avaliacoes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500 sm:px-5">{notaFmt(p.notaSum, p.avaliacoes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
