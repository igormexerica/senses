/**
 * Camada de leitura do schema `field` via PostgREST (Supabase self-hosted).
 * Server-only: a anon key fica no servidor; o browser nunca vê.
 * As views consultadas têm GRANT SELECT pra anon (ver 02-views / 05-equipamentos).
 */
import "server-only";
import { mesAtualISO } from "./format";

const BASE = process.env.SUPABASE_URL ?? "http://localhost:8000";
// Leitura server-side com SERVICE_ROLE (o dashboard está atrás do login). O anon
// não lê mais o schema `field` no PostgREST público (ver 11-lockdown.sql).
// Fallback p/ anon só por segurança caso a service_role não esteja setada.
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

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
  /** true = já existe OS agendada no Field p/ esse cliente/mês (vem do v_gaps_mensais). */
  agendado_field?: boolean;
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
export const getCoberturaMes = (mes = mesAtualISO()) =>
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

// ---------------------------------------------------------------------------
// Evolução mensal + gaps por mês (página Evolução e seletores de mês)
// ---------------------------------------------------------------------------
export interface EvolucaoMensal {
  mes_referencia: string;
  tipo: TipoExpectativa;
  total: number;
  pendente: number;
  em_execucao: number;
  atendida: number;
  com_rastreio: number;
  realizado: number;
  realizado_pct: number | null;
  cobertura_pct: number | null;
}

export interface GapMensal extends Gap {
  mes_referencia: string;
}

export const getEvolucao = () =>
  fieldGet<EvolucaoMensal>("v_evolucao_mensal", {
    order: "mes_referencia.asc,tipo.asc",
  });

export const getGapsMes = (mes: string, limit = 1000) =>
  fieldGet<GapMensal>("v_gaps_mensais", {
    mes_referencia: `eq.${mes}`,
    limit: String(limit),
  });

// ---------------------------------------------------------------------------
// Planos de ação (CS marca ação sobre um gap)
// ---------------------------------------------------------------------------
export type StatusAcao = "agendado" | "em_contato" | "aguardando_cliente" | "resolvido";

export interface PlanoAcao {
  id: string;
  expectativa_id: string;
  status: StatusAcao;
  responsavel: string | null;
  nota: string | null;
  updated_at: string;
}

export interface PlanoAcaoView extends PlanoAcao {
  tipo: TipoExpectativa;
  mes_referencia: string;
  expectativa_status: string;
  cliente_id: string;
  codigo_field: string;
  cliente_nome: string;
  tier: string | null;
  jornada_atual: string | null;
  modalidade: string | null;
}

// Leitura de planos_acao é PRIVILEGIADA (service_role) — ver lib/field-write.ts.
// (anon não tem SELECT nessas tabelas; são notas internas do CS.)

export interface AtividadeDia {
  dia: string;
  concluidas: number;
  visitas: number;
  refis: number;
  avaliacoes: number;
  nota_media: number | null;
}

export const getAtividadeDiaria = (desde: string) =>
  fieldGet<AtividadeDia>("v_atividade_diaria", {
    dia: `gte.${desde}`,
    order: "dia.asc",
    limit: "400",
  });

export interface AvaliacaoMensal {
  mes_referencia: string;
  qtd: number;
  media: number | null;
  criticas: number;
}

export const getAvaliacaoMensal = () =>
  fieldGet<AvaliacaoMensal>("v_avaliacao_mensal", { order: "mes_referencia.asc" });

/** Meses com dados (desc), pra alimentar os seletores. */
export const getMesesDisponiveis = async (): Promise<string[]> => {
  const rows = await fieldGet<{ mes_referencia: string }>("v_evolucao_mensal", {
    select: "mes_referencia",
    order: "mes_referencia.desc",
  });
  return [...new Set(rows.map((r) => r.mes_referencia))];
};
