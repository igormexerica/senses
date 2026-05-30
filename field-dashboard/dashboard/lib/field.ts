/**
 * Camada de leitura do schema `field` via PostgREST (Supabase self-hosted).
 * Server-only: a anon key fica no servidor; o browser nunca vê.
 * As views consultadas têm GRANT SELECT pra anon (ver 02-views / 05-equipamentos).
 */
import "server-only";

const BASE = process.env.SUPABASE_URL ?? "http://localhost:8000";
const KEY = process.env.SUPABASE_ANON_KEY ?? "";

export async function fieldGet<T = unknown>(
  path: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/rest/v1/${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Accept-Profile": "field",
    },
    // dados operacionais mudam a cada sync (30min) — sem cache estático
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`PostgREST ${res.status} em ${path}: ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

// ---------------------------------------------------------------------------
// Tipos das views
// ---------------------------------------------------------------------------
export type Criticidade = "critico" | "alto" | "medio" | "estavel";
export type TipoExpectativa = "visita" | "refil";

export interface CoberturaMensal {
  mes_referencia: string;
  tipo: TipoExpectativa;
  total_expectativas: number;
  atendidas: number;
  em_execucao: number;
  pendentes: number;
  percentual_cobertura: number | null;
}

export interface Gap {
  expectativa_id: string;
  cliente_id: string;
  codigo_field: string;
  cliente_nome: string;
  tipo: TipoExpectativa;
  status: string;
  modalidade: string | null;
  jornada_atual: string | null;
  tier: string | null;
  todas_etiquetas: string[] | null;
  os_atendendo: string | null;
  criticidade: Criticidade;
}

export interface AlertaPendente {
  id: string;
  fonte_tipo: string;
  fonte_id: string;
  criticidade: Criticidade;
  sumario: string | null;
  acao_sugerida: string | null;
  processado_em: string;
}

export interface InventarioModelo {
  modelo: string;
  total: number;
  branca: number;
  preta: number;
  sem_cor: number;
  clientes: number;
}

export interface InventarioCliente {
  cliente_id: string;
  codigo_field: string;
  cliente_nome: string;
  total_equipamentos: number;
  com_modelo: number;
  sem_modelo: number;
  por_modelo: Record<string, number>;
}

export interface AvaliacaoCritica {
  avaliacao_id: string;
  nota: number | null;
  comentario: string | null;
  data_avaliacao: string | null;
  os_codigo: string | null;
  cliente_codigo: string | null;
  cliente_nome: string | null;
  tier: string | null;
  jornada_atual: string | null;
  modalidade: string | null;
  classificacao_agente: Criticidade | null;
  acao_sugerida: string | null;
  sumario: string | null;
  analisada_em: string | null;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
const mesAtual = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

export const getCoberturaMes = (mes = mesAtual()) =>
  fieldGet<CoberturaMensal>("v_cobertura_mensal", { mes_referencia: `eq.${mes}` });

export const getGaps = (limit = 500) =>
  fieldGet<Gap>("v_gaps_priorizados", { limit: String(limit) });

export const getAlertasPendentes = () =>
  fieldGet<AlertaPendente>("v_alertas_pendentes", {});

export const getInventarioModelo = () =>
  fieldGet<InventarioModelo>("v_inventario_modelo", {});

export const getInventarioCliente = (limit = 1000) =>
  fieldGet<InventarioCliente>("v_inventario_cliente", {
    order: "total_equipamentos.desc",
    limit: String(limit),
  });

export const getAvaliacoesCriticas = (limit = 200) =>
  fieldGet<AvaliacaoCritica>("v_avaliacoes_criticas", {
    order: "data_avaliacao.desc",
    limit: String(limit),
  });
