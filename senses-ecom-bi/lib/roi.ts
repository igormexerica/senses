/**
 * ROI / Investimentos — SERVER ONLY. Leitura + escrita (postgres via DATABASE_URL).
 * Investimentos são INPUT do usuário (formulário); cruzados com a receita de
 * fato_diario na view analytics.v_roi_mensal. ROI/lucro calculados aqui.
 */
import "server-only";
import { pool, toNum } from "./pg";
import type { Investimento, RoiMes, RoiPayload, TipoInvestimento } from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// --- margem de contribuição (config global) ---
export async function getMargemPct(): Promise<number | null> {
  const { rows } = await pool().query("select valor from analytics.bi_config where chave = 'margem_pct'");
  return rows[0] ? toNum(rows[0].valor) : null;
}
export async function setMargemPct(v: number | null): Promise<void> {
  if (v == null) {
    await pool().query("delete from analytics.bi_config where chave = 'margem_pct'");
    return;
  }
  await pool().query(
    `insert into analytics.bi_config (chave, valor, atualizado_em) values ('margem_pct', $1, now())
     on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()`,
    [v],
  );
}

// --- CRUD de investimentos ---
export async function listarInvestimentos(): Promise<Investimento[]> {
  const { rows } = await pool().query(
    `select id, tipo, fornecedor, descricao, valor,
            to_char(vigencia_ini,'YYYY-MM-DD') as vigencia_ini,
            to_char(vigencia_fim,'YYYY-MM-DD') as vigencia_fim, criado_em
     from analytics.investimentos
     order by vigencia_ini desc, criado_em desc`,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    tipo: r.tipo as TipoInvestimento,
    fornecedor: String(r.fornecedor),
    descricao: (r.descricao as string) ?? null,
    valor: toNum(r.valor) ?? 0,
    vigencia_ini: String(r.vigencia_ini),
    vigencia_fim: r.vigencia_fim ? String(r.vigencia_fim) : null,
    criado_em: new Date(r.criado_em as string | Date).toISOString(),
  }));
}

export async function criarInvestimento(inp: {
  tipo: TipoInvestimento;
  fornecedor: string;
  descricao?: string | null;
  valor: number;
  vigencia_ini: string;
  vigencia_fim?: string | null;
}): Promise<void> {
  // pontual: vigência fim = início (mês de competência)
  const fim = inp.tipo === "pontual" ? inp.vigencia_ini : (inp.vigencia_fim || null);
  await pool().query(
    `insert into analytics.investimentos (tipo, fornecedor, descricao, valor, vigencia_ini, vigencia_fim)
     values ($1, $2, $3, $4, $5::date, $6::date)`,
    [inp.tipo, inp.fornecedor, inp.descricao ?? null, inp.valor, inp.vigencia_ini, fim],
  );
}

export async function removerInvestimento(id: string): Promise<void> {
  await pool().query("delete from analytics.investimentos where id = $1::uuid", [id]);
}

// --- evolução do ROI ---
export async function roiEvolucao(): Promise<RoiPayload> {
  const margem = await getMargemPct();
  const { rows } = await pool().query(
    `select to_char(mes,'YYYY-MM-DD') as mes, receita, investimento, receita_acum, investimento_acum
     from analytics.v_roi_mensal`,
  );

  const meses: RoiMes[] = (rows as Record<string, unknown>[]).map((r) => {
    const receita = toNum(r.receita) ?? 0;
    const investimento = toNum(r.investimento) ?? 0;
    const receita_acum = toNum(r.receita_acum) ?? 0;
    const investimento_acum = toNum(r.investimento_acum) ?? 0;
    const lucro_acum = margem != null ? round2((receita_acum * margem) / 100) : null;
    return {
      mes: String(r.mes),
      receita,
      investimento,
      receita_acum,
      investimento_acum,
      roi_receita_pct: investimento > 0 ? round1(((receita - investimento) / investimento) * 100) : null,
      roi_receita_acum_pct:
        investimento_acum > 0 ? round1(((receita_acum - investimento_acum) / investimento_acum) * 100) : null,
      lucro_acum,
      roi_lucro_acum_pct:
        margem != null && investimento_acum > 0 && lucro_acum != null
          ? round1(((lucro_acum - investimento_acum) / investimento_acum) * 100)
          : null,
    };
  });

  const last = meses[meses.length - 1];
  const payback = meses.find((m) => m.investimento_acum > 0 && m.receita_acum >= m.investimento_acum)?.mes ?? null;

  return {
    margem_pct: margem,
    meses,
    resumo: {
      investimento_acum: last?.investimento_acum ?? 0,
      receita_acum: last?.receita_acum ?? 0,
      lucro_acum: last?.lucro_acum ?? null,
      roi_receita_acum_pct: last?.roi_receita_acum_pct ?? null,
      roi_lucro_acum_pct: last?.roi_lucro_acum_pct ?? null,
      payback_mes: payback,
    },
  };
}
