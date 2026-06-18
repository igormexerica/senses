"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, SectionTitle, EmptyState } from "@/components/ui";
import type { Investimento, RoiPayload } from "@/lib/types";
import { criarInvestimentoAction, removerInvestimentoAction, setMargemAction } from "@/app/roi/actions";

const C = { receita: "#823a8c", investimento: "#d99a4e", roi: "#46153f" };
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function brl(n: number, cents = false): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}
function mesLabel(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MES[Number(m) - 1]}/${y.slice(2)}`;
}
function pct(n: number | null): string {
  return n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
function periodoLabel(i: Investimento): string {
  if (i.tipo === "pontual") return mesLabel(i.vigencia_ini);
  return `${mesLabel(i.vigencia_ini)} → ${i.vigencia_fim ? mesLabel(i.vigencia_fim) : "em aberto"}`;
}

function StatCard({ label, value, sub, tone = "default" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "good" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-aubergine-900";
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1.5 font-display text-2xl font-semibold tabular-nums sm:text-3xl ${cls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

/** Acumulado de um fornecedor sobre os meses exibidos (mesma régua da v_roi_mensal). */
function acumFornecedor(i: Investimento, meses: string[]): number {
  const ini = i.vigencia_ini.slice(0, 7);
  const fim = i.vigencia_fim ? i.vigencia_fim.slice(0, 7) : null;
  if (i.tipo === "pontual") return meses.some((m) => m.slice(0, 7) === ini) ? i.valor : 0;
  return i.valor * meses.filter((m) => { const ym = m.slice(0, 7); return ym >= ini && (!fim || ym <= fim); }).length;
}

function Linha({ label, hint, valor, pct, forte, sub, tone }: { label: string; hint?: string; valor: number; pct: string; forte?: boolean; sub?: boolean; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : sub ? "text-muted" : forte ? "text-aubergine-900" : "text-ink/80";
  return (
    <tr className="border-b border-line/50 last:border-0">
      <td className={`px-4 py-2 ${sub ? "pl-8 text-sm text-muted" : forte ? "font-semibold text-aubergine-900" : "text-ink/80"}`}>
        {label}
        {hint && <span className="ml-1.5 text-xs text-muted">· {hint}</span>}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${cls} ${forte ? "font-semibold" : ""}`}>{brl(valor)}</td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-muted">{pct}</td>
    </tr>
  );
}

function Composicao({ payload, investimentos }: { payload: RoiPayload; investimentos: Investimento[] }) {
  const receita = payload.resumo.receita_acum;
  const margem = payload.margem_pct;
  const meses = payload.meses.map((m) => m.mes);
  const pr = (v: number) => (receita > 0 ? `${((Math.abs(v) / receita) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
  const forn = investimentos
    .map((i) => ({ nome: i.fornecedor, valor: acumFornecedor(i, meses) }))
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const totalForn = payload.resumo.investimento_acum;
  const margemContrib = payload.resumo.lucro_acum; // receita × margem%
  const custoProduto = margem != null && margemContrib != null ? receita - margemContrib : null;
  const resultado = margem != null && margemContrib != null ? margemContrib - totalForn : receita - totalForn;

  return (
    <Card className="overflow-hidden">
      <div className="scroll-x">
        <table className="w-full min-w-[440px] text-sm">
          <tbody>
            <Linha label="Receita" valor={receita} pct="100%" forte />
            {custoProduto != null && (
              <Linha label="(−) Custo dos produtos" hint={`margem ${margem}%`} valor={-custoProduto} pct={pr(custoProduto)} />
            )}
            {margemContrib != null && (
              <Linha label="(=) Margem de contribuição" valor={margemContrib} pct={pr(margemContrib)} forte />
            )}
            <Linha label="(−) Fornecedores fixos" valor={-totalForn} pct={pr(totalForn)} />
            {forn.map((f) => (
              <Linha key={f.nome} label={f.nome} valor={-f.valor} pct={pr(f.valor)} sub />
            ))}
            <Linha
              label={margemContrib != null ? "(=) Resultado" : "(=) Sobra após fornecedores"}
              hint={margemContrib != null ? undefined : "defina a margem p/ ver o lucro real"}
              valor={resultado}
              pct={pr(resultado)}
              forte
              tone={resultado >= 0 ? "good" : "bad"}
            />
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function RoiView({ payload, investimentos }: { payload: RoiPayload; investimentos: Investimento[] }) {
  const [tipo, setTipo] = useState<"recorrente" | "pontual">("recorrente");
  const r = payload.resumo;
  const temMargem = payload.margem_pct != null;
  const roiTone = (v: number | null) => (v == null ? "default" : v >= 0 ? "good" : "bad");

  const chartData = payload.meses.map((m) => ({
    mes: m.mes,
    receita: m.receita,
    investimento: m.investimento,
    roi: m.roi_receita_acum_pct,
  }));

  const inputCls =
    "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-aubergine-500";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-aubergine-900 sm:text-3xl">ROI</h1>
          <p className="mt-1 text-sm text-muted">Retorno sobre o investimento · evolução acumulada</p>
        </div>
        {/* margem de contribuição (opcional) */}
        <form action={setMargemAction} className="flex items-end gap-2">
          <label className="text-xs text-muted">
            Margem de contribuição %
            <input
              name="margem"
              defaultValue={payload.margem_pct ?? ""}
              inputMode="decimal"
              placeholder="ex.: 40"
              className={`mt-1 block w-28 ${inputCls}`}
            />
          </label>
          <button type="submit" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-aubergine-700 hover:bg-aubergine-50">
            Salvar
          </button>
        </form>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Investimento acumulado" value={brl(r.investimento_acum)} sub="recorrente + pontual" />
        <StatCard label="Receita acumulada" value={brl(r.receita_acum)} sub={temMargem ? `lucro estim.: ${r.lucro_acum != null ? brl(r.lucro_acum) : "—"}` : "bruta (Nuvemshop)"} />
        <StatCard
          label="ROI acumulado"
          value={pct(r.roi_receita_acum_pct)}
          tone={roiTone(r.roi_receita_acum_pct)}
          sub={temMargem ? `s/ lucro (${payload.margem_pct}%): ${pct(r.roi_lucro_acum_pct)}` : "sobre a receita"}
        />
        <StatCard
          label="Payback"
          value={r.payback_mes ? mesLabel(r.payback_mes) : "—"}
          sub={r.payback_mes ? "receita cobriu o investido" : "ainda não atingido"}
        />
      </div>

      {/* Evolução */}
      <SectionTitle hint="receita × investimento por mês + ROI acumulado">Evolução</SectionTitle>
      <Card className="p-4 sm:p-5">
        {chartData.length === 0 ? (
          <EmptyState>sem meses com dados ainda</EmptyState>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid vertical={false} stroke="#ece4ee" />
                <XAxis dataKey="mes" tickFormatter={mesLabel} tick={{ fontSize: 12, fill: "#7c6b80" }} axisLine={{ stroke: "#ece4ee" }} tickLine={false} />
                <YAxis yAxisId="r" tick={{ fontSize: 11, fill: "#7c6b80" }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => brl(Number(v))} />
                <YAxis yAxisId="roi" orientation="right" tick={{ fontSize: 11, fill: "#7c6b80" }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  labelFormatter={(l) => mesLabel(String(l))}
                  formatter={(v, name) => {
                    if (v == null) return ["—", String(name)];
                    return name === "ROI acum." ? [`${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, name] : [brl(Number(v)), String(name)];
                  }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #ece4ee", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="r" dataKey="receita" name="Receita" fill={C.receita} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="r" dataKey="investimento" name="Investimento" fill={C.investimento} radius={[3, 3, 0, 0]} />
                <Line yAxisId="roi" type="monotone" dataKey="roi" name="ROI acum." stroke={C.roi} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Composição da receita */}
      <SectionTitle hint="pra onde vai cada R$ da receita (acumulado)">Composição da receita</SectionTitle>
      <Composicao payload={payload} investimentos={investimentos} />

      {/* Investimentos */}
      <SectionTitle hint="recorrentes (mensais) + pontuais">Investimentos</SectionTitle>

      <Card className="mb-4 p-4 sm:p-5">
        <form action={criarInvestimentoAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <label className="text-xs text-muted lg:col-span-1">
            Tipo
            <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "recorrente" | "pontual")} className={`mt-1 block w-full ${inputCls}`}>
              <option value="recorrente">Recorrente</option>
              <option value="pontual">Pontual</option>
            </select>
          </label>
          <label className="text-xs text-muted lg:col-span-1">
            Fornecedor
            <input name="fornecedor" required placeholder="Google, Meta, Agência…" className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <label className="text-xs text-muted lg:col-span-1">
            Valor {tipo === "recorrente" ? "(R$/mês)" : "(R$)"}
            <input name="valor" required inputMode="decimal" placeholder="3000" className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <label className="text-xs text-muted lg:col-span-1">
            {tipo === "recorrente" ? "Início" : "Mês"}
            <input name="vigencia_ini" type="month" required placeholder="AAAA-MM" pattern="\d{4}-\d{2}" className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <label className={`text-xs text-muted lg:col-span-1 ${tipo === "pontual" ? "invisible" : ""}`}>
            Fim (opcional)
            <input name="vigencia_fim" type="month" disabled={tipo === "pontual"} placeholder="AAAA-MM" pattern="\d{4}-\d{2}" className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <button type="submit" className="h-[38px] rounded-lg bg-aubergine-800 px-3 text-sm font-semibold text-white shadow-sm hover:bg-aubergine-900 lg:col-span-1">
            Adicionar
          </button>
          <input type="hidden" name="descricao" value="" />
        </form>
      </Card>

      <Card className="overflow-hidden">
        {investimentos.length === 0 ? (
          <EmptyState>nenhum investimento lançado — adicione acima pra calcular o ROI</EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2.5 text-left font-medium">Fornecedor</th>
                  <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-3 py-2.5 text-left font-medium">Período</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {investimentos.map((i) => (
                  <tr key={i.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${i.tipo === "recorrente" ? "bg-aubergine-100 text-aubergine-700" : "bg-amber-100 text-amber-700"}`}>
                        {i.tipo === "recorrente" ? "Recorrente" : "Pontual"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink/80">{i.fornecedor}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {brl(i.valor, true)}
                      {i.tipo === "recorrente" && <span className="text-xs text-muted">/mês</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{periodoLabel(i)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <form action={removerInvestimentoAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" title="Remover" className="rounded-md p-1 text-muted hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <footer className="mt-8 text-center text-xs text-muted/70">
        ROI sobre a receita total da operação (não por canal). Receita: Nuvemshop. Margem de contribuição
        opcional estima o lucro pra um ROI mais realista.
      </footer>
    </>
  );
}
