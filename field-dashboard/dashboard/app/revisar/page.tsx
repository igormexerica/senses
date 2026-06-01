import Link from "next/link";
import { getRefisSemRastreio, getAuditJornada } from "@/lib/field";
import { mesLabel, dataCurta, num } from "@/lib/format";
import { PageHeader, Card, CardTitle, Stat, Tag, EmptyState, ErrorState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RevisarPage() {
  let refis: Awaited<ReturnType<typeof getRefisSemRastreio>>;
  let jornada: Awaited<ReturnType<typeof getAuditJornada>>;
  try {
    [refis, jornada] = await Promise.all([getRefisSemRastreio(), getAuditJornada()]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Revisar" />
        <ErrorState error={error} />
      </>
    );
  }

  const desalinhados = jornada.filter((j) => j.situacao === "desalinhado").length;
  const semTag = jornada.filter((j) => j.situacao === "sem_etiqueta").length;

  return (
    <>
      <PageHeader title="Revisar" subtitle="Pontos que pedem ação ou ajuste manual" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Refis sem rastreio" value={num(refis.length)} tone={refis.length ? "warn" : "good"} />
        <Stat label="Jornada desalinhada" value={num(desalinhados)} tone={desalinhados ? "warn" : "good"} />
        <Stat label="Sem etiqueta de jornada" value={num(semTag)} />
        <Stat label="Total a revisar" value={num(refis.length + jornada.length)} />
      </div>

      <Card className="mt-4 lg:mt-6">
        <CardTitle hint={`${num(refis.length)}`}>
          Refis sem código de rastreio
        </CardTitle>
        <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-400 sm:px-5">
          Refil enviado mas sem rastreio registrado — risco invisível. Cobrar o código.
        </div>
        {refis.length === 0 ? (
          <EmptyState>Tudo com rastreio. 🎉</EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium sm:px-5">Cliente</th>
                  <th className="px-3 py-2 font-medium">Mês</th>
                  <th className="px-3 py-2 font-medium">Concluída</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Dias s/ rastreio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {refis.slice(0, 200).map((r) => (
                  <tr key={r.expectativa_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-800 sm:px-5">{r.cliente_nome}</td>
                    <td className="px-3 py-2.5 text-slate-600">{mesLabel(r.mes_referencia)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{dataCurta(r.concluida_em)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium sm:px-5">
                      <span className={(r.dias_sem_rastreio ?? 0) >= 15 ? "text-red-600" : "text-amber-600"}>
                        {r.dias_sem_rastreio ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4 lg:mt-6">
        <CardTitle hint={`${num(jornada.length)}`}>Jornada a revisar</CardTitle>
        <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-400 sm:px-5">
          Etiqueta de jornada não bate com o tempo de casa. A gestora ajusta a tag no Field.
        </div>
        {jornada.length === 0 ? (
          <EmptyState>Tudo alinhado. 🎉</EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium sm:px-5">Cliente</th>
                  <th className="px-3 py-2 text-right font-medium">Meses</th>
                  <th className="px-3 py-2 font-medium">Atual</th>
                  <th className="px-3 py-2 font-medium">Esperada</th>
                  <th className="px-4 py-2 font-medium sm:px-5">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {jornada.slice(0, 200).map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium sm:px-5">
                      <Link href={`/cliente/${j.id}`} className="text-slate-800 hover:text-brand-600 hover:underline">
                        {j.nome}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{j.meses_de_casa ?? "—"}</td>
                    <td className="px-3 py-2.5">{j.jornada_atual ? <Tag>{j.jornada_atual}</Tag> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2.5">{j.jornada_esperada ? <Tag>{j.jornada_esperada}</Tag> : "—"}</td>
                    <td className="px-4 py-2.5 sm:px-5">
                      <span className={`text-xs font-medium ${j.situacao === "desalinhado" ? "text-red-600" : "text-amber-600"}`}>
                        {j.situacao === "desalinhado" ? "Desalinhado" : "Sem etiqueta"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
