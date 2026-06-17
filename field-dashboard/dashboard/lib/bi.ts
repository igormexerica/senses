/**
 * Camada de dados do Comparativo de Performance — SERVER ONLY.
 *
 * Acesso direto ao Postgres do Supabase self-hosted via `DATABASE_URL`
 * (connection string). A string de conexão NUNCA vai pro client: este módulo
 * importa "server-only", então qualquer import acidental no client quebra o build.
 *
 * Chama as funções SQL de bi/schema.sql (não recriadas aqui):
 *   analytics.kpis_periodo(d_ini, d_fim)
 *   analytics.trafego_periodo(d_ini, d_fim, dimensao)
 *   analytics.checkout_retencao(d_ini, d_fim)
 *
 * Convenção de NULL preservada ponta a ponta: visitas/carrinhos/checkouts e as
 * taxas derivadas vêm `null` quando não há GA4 no período → o front mostra
 * "sem dados" (nunca zero). Aqui nada é convertido pra 0.
 */
import "server-only";
import { Pool } from "pg";
import { validarPeriodo, type Periodo } from "./periodos";
import type {
  Kpis,
  TrafegoRow,
  RetencaoRow,
  PeriodoData,
  DeltasPar,
  Comparativo,
} from "./bi-types";

export type { Kpis, TrafegoRow, RetencaoRow, PeriodoData, Delta, DeltasPar, Comparativo } from "./bi-types";

// --- pool lazy (só conecta no 1º uso; não toca o banco em build/import) ------
let _pool: Pool | null = null;
function pool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não configurada (server-only). Defina a connection string do " +
        "Postgres do Supabase. Veja bi/README.md.",
    );
  }
  _pool = new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    // sslmode na própria connection string controla TLS (localhost = sem ssl).
  });
  return _pool;
}

/** pg devolve numeric/bigint como string p/ não perder precisão — normaliza p/ number|null. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// --- queries (cada função SQL, 1x) -------------------------------------------
async function kpisPeriodo(p: Periodo): Promise<Kpis> {
  const { rows } = await pool().query(
    "select * from analytics.kpis_periodo($1::date, $2::date)",
    [p.ini, p.fim],
  );
  const r = (rows[0] ?? {}) as Record<string, unknown>;
  return {
    dias: toNum(r.dias),
    visitas: toNum(r.visitas),
    carrinhos: toNum(r.carrinhos),
    checkouts: toNum(r.checkouts),
    vendas: toNum(r.vendas),
    receita: toNum(r.receita),
    ticket_medio: toNum(r.ticket_medio),
    taxa_conversao: toNum(r.taxa_conversao),
    taxa_carrinho: toNum(r.taxa_carrinho),
    taxa_inicio_checkout: toNum(r.taxa_inicio_checkout),
    taxa_conclusao: toNum(r.taxa_conclusao),
    media_visitas_dia: toNum(r.media_visitas_dia),
    media_receita_dia: toNum(r.media_receita_dia),
  };
}

async function trafegoPeriodo(p: Periodo, dimensao: "origem" | "dispositivo"): Promise<TrafegoRow[]> {
  const { rows } = await pool().query(
    "select valor, visitas, pct from analytics.trafego_periodo($1::date, $2::date, $3::text)",
    [p.ini, p.fim, dimensao],
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    valor: String(r.valor),
    visitas: toNum(r.visitas),
    pct: toNum(r.pct),
  }));
}

async function checkoutRetencao(p: Periodo): Promise<RetencaoRow[]> {
  const { rows } = await pool().query(
    "select etapa, eventos, pct_do_inicio from analytics.checkout_retencao($1::date, $2::date)",
    [p.ini, p.fim],
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    etapa: String(r.etapa),
    eventos: toNum(r.eventos),
    pct_do_inicio: toNum(r.pct_do_inicio),
  }));
}

/** Maior atualizado_em de fato_diario (indicador "última atualização"). */
export async function ultimaAtualizacao(): Promise<string | null> {
  const { rows } = await pool().query(
    "select max(atualizado_em) as m from analytics.fato_diario",
  );
  const m = rows[0]?.m;
  return m ? new Date(m as string | Date).toISOString() : null;
}

// --- deltas (calculados no server) -------------------------------------------
const KPI_KEYS: (keyof Kpis)[] = [
  "visitas",
  "carrinhos",
  "checkouts",
  "vendas",
  "receita",
  "ticket_medio",
  "taxa_conversao",
  "taxa_carrinho",
  "taxa_inicio_checkout",
  "taxa_conclusao",
  "media_visitas_dia",
  "media_receita_dia",
];
const RATE_KEYS = new Set<keyof Kpis>([
  "taxa_conversao",
  "taxa_carrinho",
  "taxa_inicio_checkout",
  "taxa_conclusao",
]);

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Delta de `a` (base, mais antigo) → `b` (mais recente). */
function deltaEntre(a: Kpis, b: Kpis): DeltasPar {
  const out = {} as DeltasPar;
  for (const k of KPI_KEYS) {
    const va = a[k];
    const vb = b[k];
    if (RATE_KEYS.has(k)) {
      out[k] = { pp: va == null || vb == null ? null : round1(vb - va) };
    } else {
      out[k] = { pct: va == null || vb == null || va === 0 ? null : round1(((vb - va) / va) * 100) };
    }
  }
  return out;
}

/**
 * Carrega os 3 períodos (KPIs + tráfego + retenção), calcula os deltas
 * (P2/P1, P3/P2, P3/P1) e a última atualização. Tudo no server.
 */
export async function buildComparativo(periodos: Periodo[]): Promise<Comparativo> {
  if (periodos.length !== 3) throw new Error("São necessários exatamente 3 períodos.");
  periodos.forEach((p, i) => validarPeriodo(p, `P${i + 1}`));

  const periodosData = await Promise.all(
    periodos.map(async (p): Promise<PeriodoData> => {
      const [kpis, origem, dispositivo, retencao] = await Promise.all([
        kpisPeriodo(p),
        trafegoPeriodo(p, "origem"),
        trafegoPeriodo(p, "dispositivo"),
        checkoutRetencao(p),
      ]);
      return { ini: p.ini, fim: p.fim, dias: kpis.dias, kpis, trafego: { origem, dispositivo }, retencao };
    }),
  );

  const [P1, P2, P3] = periodosData;
  const ultima_atualizacao = await ultimaAtualizacao();

  return {
    periodos: periodosData,
    deltas: {
      p2_p1: deltaEntre(P1.kpis, P2.kpis),
      p3_p2: deltaEntre(P2.kpis, P3.kpis),
      p3_p1: deltaEntre(P1.kpis, P3.kpis),
    },
    ultima_atualizacao,
  };
}
