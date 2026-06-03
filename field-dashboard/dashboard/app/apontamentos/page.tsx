import Link from "next/link";
import {
  getMesesDisponiveis,
  getApontamentosPorTagMes,
  getApontamentoDetalhe,
} from "@/lib/field";
import { mesAtualISO, mesAnteriorISO, mesLabel, resolverMes, num, dataCurta } from "@/lib/format";
import { PageHeader, Card, CardTitle, EmptyState, ErrorState, Tag } from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";
import { playbook } from "@/lib/apontamentos";

export const dynamic = "force-dynamic";

// tags de período (rótulos de lote) contêm "/" — fora da lista, igual ao /resumo.
const isPeriodoTag = (t: string) => t.includes("/");

export default async function ApontamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const tag = sp.tag;

  let meses: string[];
  try {
    meses = await getMesesDisponiveis();
  } catch (error) {
    return (
      <>
        <PageHeader title="Apontamentos" />
        <ErrorState error={error} />
      </>
    );
  }
  const mes = resolverMes(sp.mes, meses, mesAnteriorISO(mesAtualISO()));

  // ----- sem tag: lista as tags do mês como links -----
  if (!tag) {
    let tags: Awaited<ReturnType<typeof getApontamentosPorTagMes>>;
    try {
      tags = await getApontamentosPorTagMes(mes);
    } catch (error) {
      return (
        <>
          <PageHeader title="Apontamentos" subtitle={mesLabel(mes)} />
          <ErrorState error={error} />
        </>
      );
    }
    const lista = tags.filter((t) => !isPeriodoTag(t.tag));
    return (
      <>
        <PageHeader
          title="Apontamentos"
          subtitle={`Escolha uma tag — ${mesLabel(mes)}`}
          right={<MonthPicker months={meses} value={mes} label="Mês" />}
        />
        <Card>
          <CardTitle hint={`${num(lista.length)} tags`}>Tags do mês</CardTitle>
          {lista.length === 0 ? (
            <EmptyState>Nenhuma tag de apontamento neste mês.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lista.map((t) => (
                <li key={t.tag}>
                  <Link
                    href={`/apontamentos?mes=${mes}&tag=${encodeURIComponent(t.tag)}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 sm:px-5"
                  >
                    <span className="text-sm font-medium text-slate-800">{t.tag}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-500">
                      {num(t.qtd)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  }

  // ----- com tag: playbook + relação de clientes -----
  const pb = playbook(tag);
  let rows: Awaited<ReturnType<typeof getApontamentoDetalhe>>;
  try {
    rows = await getApontamentoDetalhe(mes, tag);
  } catch (error) {
    return (
      <>
        <PageHeader title={`Apontamentos · ${tag}`} subtitle={mesLabel(mes)} />
        <ErrorState error={error} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Apontamentos · ${tag}`}
        subtitle={mesLabel(mes)}
        right={<MonthPicker months={meses} value={mes} label="Mês" />}
      />

      <div className="mb-4">
        <Link href={`/resumo?mes=${mes}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Voltar ao resumo
        </Link>
      </div>

      <Card className="mb-4 border-brand-200 bg-brand-50/40">
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">O que significa</div>
            <p className="mt-1 text-sm text-slate-700">{pb.significado}</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ação padrão</div>
            <p className="mt-1 text-sm text-slate-700">{pb.acao}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle hint={`${num(rows.length)} ${rows.length === 1 ? "cliente" : "clientes"}`}>
          Clientes com “{tag}” em {mesLabel(mes)}
        </CardTitle>
        {rows.length === 0 ? (
          <EmptyState>Nenhum cliente com essa tag neste mês.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={`${r.os_codigo}-${r.cliente_id}`} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/cliente/${r.cliente_id}`}
                    className="min-w-0 break-words text-sm font-medium text-slate-800 hover:text-brand-600 hover:underline"
                  >
                    {r.cliente_nome}
                  </Link>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    {r.os_tipo && <Tag>{r.os_tipo}</Tag>}
                    {r.os_status && <span>{r.os_status}</span>}
                    {r.concluida_em && <span>{dataCurta(r.concluida_em)}</span>}
                  </span>
                </div>

                {r.comentario?.trim() && (
                  <p className="mt-1 text-xs italic text-slate-500">“{r.comentario.trim()}”</p>
                )}

                {(r.sumario?.trim() || r.acao_sugerida?.trim()) && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                    <span className="font-semibold">Sugestão (IA): </span>
                    {r.sumario?.trim() && <span>{r.sumario.trim()}</span>}
                    {r.acao_sugerida?.trim() && (
                      <span className="mt-0.5 block">→ {r.acao_sugerida.trim()}</span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
