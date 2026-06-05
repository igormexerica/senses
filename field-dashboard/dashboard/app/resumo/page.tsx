import type { ReactNode } from "react";
import Link from "next/link";
import {
  getEvolucao,
  getAtivacoesMes,
  getApontamentosPorTagMes,
  getAvaliacaoMensal,
  type EvolucaoMensal,
} from "@/lib/field";
import {
  mesAtualISO,
  mesAnteriorISO,
  mesLabel,
  resolverMes,
  num,
  pct,
  hojeISO,
} from "@/lib/format";
import { PageHeader, Card, CardTitle, EmptyState, ErrorState } from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const TOP_TAGS = 12;

// Como cada métrica é calculada — usado no ⓘ de cada card (hover) e na legenda
// do rodapé (que imprime; o ⓘ não imprime nem aparece no mobile sem hover).
const CALC = {
  ativacoes: "Clientes distintos com instalação ou primeiro envio concluído no mês (sem dupla contagem).",
  visitas: "Visitas com OS criada ÷ visitas esperadas no mês (1 por cliente presencial).",
  refis: "Refis com OS criada ÷ refis esperados no mês (1 por cliente remoto, meses ímpares).",
  churn: "Avaliações com nota ≤ 3 registradas no mês.",
};
const LEGENDA: [string, string][] = [
  ["Ativações no mês", CALC.ativacoes],
  ["Cobertura de visitas", CALC.visitas],
  ["Cobertura de refis", CALC.refis],
  ["Risco de churn", CALC.churn],
];

/** Tags de período/lote ("02/2026", "maio/junho") não são apontamentos
 *  operacionais — todas contêm "/". Filtradas do resumo executivo. */
function isPeriodoTag(tag: string): boolean {
  return tag.includes("/");
}

type Tone = "default" | "good" | "warn" | "bad";

/** Hoje (fuso do negócio) -> "DD/MM/YYYY" sem round-trip por Date (evita shift de fuso). */
function hojeBR(): string {
  const [y, m, d] = hojeISO().split("-");
  return `${d}/${m}/${y}`;
}

export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; explicar?: string }>;
}) {
  const sp = await searchParams;
  // "como é calculado" só aparece com ?explicar=1 (mostrar pra gestora e ocultar
  // depois sem redeploy). Default = resumo limpo.
  const explicar = sp.explicar === "1";

  let evo: EvolucaoMensal[];
  try {
    evo = await getEvolucao();
  } catch (error) {
    return (
      <>
        <PageHeader title="Resumo Executivo — Operação de Campo" />
        <ErrorState error={error} />
      </>
    );
  }

  const meses = [...new Set(evo.map((r) => r.mes_referencia))].sort((a, b) =>
    b.localeCompare(a),
  );
  const atual = mesAtualISO();
  // default = mês anterior fechado (mais comum pro fechamento)
  const mes = resolverMes(sp.mes, meses, mesAnteriorISO(atual));
  const prev = mesAnteriorISO(mes);
  const emCurso = mes >= atual;

  let ativ: Awaited<ReturnType<typeof getAtivacoesMes>>;
  let ativPrev: Awaited<ReturnType<typeof getAtivacoesMes>>;
  let tags: Awaited<ReturnType<typeof getApontamentosPorTagMes>>;
  let avalMensal: Awaited<ReturnType<typeof getAvaliacaoMensal>>;
  try {
    [ativ, ativPrev, tags, avalMensal] = await Promise.all([
      getAtivacoesMes(mes),
      getAtivacoesMes(prev),
      getApontamentosPorTagMes(mes),
      getAvaliacaoMensal(),
    ]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Resumo Executivo — Operação de Campo" subtitle={mesLabel(mes)} />
        <ErrorState error={error} />
      </>
    );
  }

  const ativacoes = ativ[0]?.ativacoes ?? 0;
  const ativacoesPrev = ativPrev[0]?.ativacoes ?? 0;
  // Risco de churn = avaliações ≤3 no mês (month-scoped, de v_avaliacao_mensal).
  const criticas = avalMensal.find((a) => a.mes_referencia === mes)?.criticas ?? 0;

  const sel = (tipo: "visita" | "refil") =>
    evo.find((r) => r.mes_referencia === mes && r.tipo === tipo);
  const visita = sel("visita");
  const refil = sel("refil");

  const tagsFiltradas = tags.filter((t) => !isPeriodoTag(t.tag));
  const totalApont = tagsFiltradas.reduce((s, t) => s + t.qtd, 0);
  const topTags = tagsFiltradas.slice(0, TOP_TAGS);
  const maxTag = topTags[0]?.qtd ?? 1;

  const toneCob = (p: number | null | undefined): Tone =>
    emCurso || p == null ? "default" : p >= 90 ? "good" : p >= 70 ? "warn" : "bad";

  // Comparação só faz sentido com mês fechado e base anterior existente.
  const ativSub = emCurso
    ? "parcial — mês em curso"
    : ativPrev.length === 0
      ? "sem base de comparação"
      : `mês anterior: ${num(ativacoesPrev)}`;

  return (
    <>
      <PageHeader
        title="Resumo Executivo — Operação de Campo"
        subtitle={`${mesLabel(mes)} · ${emCurso ? "mês em curso (parcial)" : "mês fechado"}`}
        right={
          <div className="flex items-center gap-2 print:hidden">
            <MonthPicker months={meses} value={mes} label="Mês" />
            <PrintButton />
          </div>
        }
      />

      {/* Olhar de 5 segundos — 4 cards grandes */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BigStat
          label="Ativações no mês"
          value={num(ativacoes)}
          sub={ativSub}
          note="Clientes com instalação ou primeiro envio do mês, já concluídos — sem dupla contagem."
          calc={explicar ? CALC.ativacoes : undefined}
        />
        <BigStat
          label="Cobertura de visitas"
          value={visita ? pct(visita.realizado_pct) : "—"}
          sub={visita ? `${num(visita.realizado)} de ${num(visita.total)} realizadas` : "sem dados no mês"}
          tone={toneCob(visita?.realizado_pct)}
          calc={explicar ? CALC.visitas : undefined}
        />
        {refil && refil.total > 0 ? (
          <BigStat
            label="Cobertura de refis"
            value={pct(refil.realizado_pct)}
            sub={`${num(refil.realizado)} de ${num(refil.total)} realizados`}
            tone={toneCob(refil.realizado_pct)}
            calc={explicar ? CALC.refis : undefined}
          />
        ) : (
          <BigStat
            label="Cobertura de refis"
            value="—"
            sub="sem ciclo de refil neste mês"
            calc={explicar ? CALC.refis : undefined}
          />
        )}
        <BigStat
          label="Risco de churn"
          value={num(criticas)}
          sub="avaliações ≤3 no mês"
          tone={criticas > 0 ? "bad" : "good"}
          href={criticas > 0 ? `/avaliacoes?mes=${mes}` : undefined}
          calc={explicar ? CALC.churn : undefined}
        />
      </div>

      {/* Apontamentos por tag */}
      <Card className="mt-4 print:break-inside-avoid print:shadow-none lg:mt-6">
        <CardTitle hint={`${num(totalApont)} apontamentos · ${num(tagsFiltradas.length)} tipos`}>
          Apontamentos por tag
        </CardTitle>
        <div className="p-4 sm:p-5">
          {topTags.length === 0 ? (
            <EmptyState>Nenhuma OS com tag de apontamento neste mês.</EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {topTags.map((t) => (
                <li key={t.tag} className="flex items-center gap-3">
                  <Link
                    href={`/apontamentos?mes=${mes}&tag=${encodeURIComponent(t.tag)}`}
                    className="w-40 shrink-0 truncate text-sm text-slate-700 hover:text-brand-600 hover:underline print:text-slate-700 print:no-underline"
                    title={`Ver clientes — ${t.tag}`}
                  >
                    {t.tag}
                  </Link>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="flex h-full min-w-[1.5rem] items-center justify-end rounded bg-brand-500 px-1.5 text-[11px] font-semibold tabular-nums text-white"
                      style={{ width: `${Math.max(8, Math.round((t.qtd / maxTag) * 100))}%` }}
                    >
                      {num(t.qtd)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {tagsFiltradas.length > topTags.length && (
            <p className="mt-3 text-xs text-slate-400">
              + {num(tagsFiltradas.length - topTags.length)} outras tags
            </p>
          )}
        </div>
      </Card>

      {explicar && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-[11px] leading-snug text-slate-500 print:break-inside-avoid print:bg-white sm:p-5">
          <div className="mb-1.5 font-semibold uppercase tracking-wide text-slate-400">
            Como é calculado
          </div>
          <dl className="grid gap-1 sm:grid-cols-2">
            {LEGENDA.map(([l, t]) => (
              <div key={l}>
                <dt className="inline font-medium text-slate-600">{l}: </dt>
                <dd className="inline">{t}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <footer className="mt-6 text-center text-xs text-slate-400">
        Senses Olfacts · gerado em {hojeBR()} · dados do Field Control
      </footer>
    </>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone = "default",
  note,
  href,
  calc,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  note?: string;
  href?: string;
  calc?: string;
}) {
  const toneCls = {
    default: "text-slate-900",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  }[tone];
  const inner = (
    <>
      <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        {calc && (
          <span
            title={calc}
            aria-label={`Como é calculado: ${calc}`}
            className="cursor-help text-sm normal-case text-slate-300 print:hidden"
          >
            ⓘ
          </span>
        )}
      </div>
      <div className={`mt-2 text-4xl font-bold tabular-nums sm:text-5xl ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1.5 text-sm text-slate-500">{sub}</div>}
      {note && (
        <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-400">
          {note}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="group block h-full rounded-xl">
        <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-brand-300 group-hover:bg-brand-50/30 print:break-inside-avoid print:shadow-none">
          {inner}
          <span className="mt-2 text-xs font-medium text-brand-600 group-hover:underline print:hidden">
            ver clientes →
          </span>
        </Card>
      </Link>
    );
  }

  return (
    <Card className="flex h-full flex-col p-5 print:break-inside-avoid print:shadow-none">{inner}</Card>
  );
}
