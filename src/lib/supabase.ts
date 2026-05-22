import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './env.js';
import type { Pipeline } from './types.js';

const TABLE = 'os_geracao_log';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type OsLogStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'ignorado_checklist_incompleto'
  | 'ignorado_campos_incompletos'
  | 'ignorado_duplicado';

export type OsLogIgnoradoStatus = Extract<OsLogStatus, `ignorado_${string}`>;

export interface OsFieldRef {
  id: string;
  data: string; // 'YYYY-MM-DD'
  tipo: string;
}

export interface OsLogEntry {
  pipeline: Pipeline;
  clint_deal_id: string;
  cliente_cnpj: string;
  cliente_nome: string;
  field_client_id?: string | null;
  contrato_inicio: string; // 'YYYY-MM-DD'
  contrato_fim: string;
  tipo_os: 'envio_refil' | 'visita_tecnica';
  os_field_ids?: OsFieldRef[];
  datas_geradas: unknown;
  total_os?: number;
  disparado_por: string;
  status: OsLogStatus;
  erro?: string | null;
  tentativas?: number;
}

export interface OsLogRow {
  id: string;
  pipeline: Pipeline;
  clint_deal_id: string;
  cliente_cnpj: string;
  cliente_nome: string;
  field_client_id: string | null;
  contrato_inicio: string;
  contrato_fim: string;
  tipo_os: 'envio_refil' | 'visita_tecnica';
  os_field_ids: OsFieldRef[];
  datas_geradas: unknown;
  total_os: number;
  disparado_por: string;
  disparado_em: string;
  status: OsLogStatus;
  erro: string | null;
  tentativas: number;
}

// ─────────────────────────────────────────────────────────────
// Client (eager — fails fast if env is missing)
// ─────────────────────────────────────────────────────────────

const env = loadEnv();

export const supabase: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * True when a `success` log already exists for this deal — backed by the
 * unique partial index `uq_log_deal (clint_deal_id) WHERE status = 'success'`.
 */
export async function checkIdempotency(dealId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id')
    .eq('clint_deal_id', dealId)
    .eq('status', 'success')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function insertLog(entry: OsLogEntry): Promise<void> {
  const row = {
    os_field_ids: entry.os_field_ids ?? [],
    total_os: entry.total_os ?? entry.os_field_ids?.length ?? 0,
    tentativas: entry.tentativas ?? 1,
    ...entry,
  };
  const { error } = await supabase.from(TABLE).insert(row);
  if (error) throw error;
}

/**
 * Registra um disparo silenciosamente ignorado (auditoria).
 * Aceita o payload bruto da Clint — best-effort extraction quando campos
 * estão faltando (o que é o caso típico de `ignorado_campos_incompletos`).
 */
export async function logIgnorado(
  dealId: string,
  motivo: OsLogIgnoradoStatus,
  payload: unknown,
  context: { pipeline: Pipeline; erro?: string },
): Promise<void> {
  const extracted = extractFromPayload(payload);
  await insertLog({
    pipeline: context.pipeline,
    clint_deal_id: dealId,
    cliente_cnpj: extracted.cnpj,
    cliente_nome: extracted.nome,
    contrato_inicio: extracted.inicio,
    contrato_fim: extracted.fim,
    tipo_os: context.pipeline === 'onboarding_remoto' ? 'envio_refil' : 'visita_tecnica',
    datas_geradas: { ignored: true, raw_payload: payload },
    disparado_por: extracted.disparadoPor,
    status: motivo,
    erro: context.erro ?? null,
  });
}

/**
 * Atualiza um log existente para `status='failed'` com a mensagem de erro.
 * Pressupõe que o log do deal já foi inserido pelo workflow.
 * Throws se nenhuma linha for atualizada.
 */
export async function markFailed(dealId: string, error: string): Promise<void> {
  const { data, error: dbErr } = await supabase
    .from(TABLE)
    .update({ status: 'failed', erro: error })
    .eq('clint_deal_id', dealId)
    .neq('status', 'success')
    .select('id');
  if (dbErr) throw dbErr;
  if (!data || data.length === 0) {
    throw new Error(`markFailed: no log row found for deal ${dealId}`);
  }
}

/**
 * Atualiza um log existente para `status='success'` e grava os IDs das OS.
 * A unique partial index `uq_log_deal` dispara aqui se já existir success pra esse deal.
 * Throws se nenhuma linha for atualizada.
 */
export async function markSuccess(dealId: string, osFieldIds: OsFieldRef[]): Promise<void> {
  const { data, error: dbErr } = await supabase
    .from(TABLE)
    .update({
      status: 'success',
      os_field_ids: osFieldIds,
      total_os: osFieldIds.length,
      erro: null,
    })
    .eq('clint_deal_id', dealId)
    .neq('status', 'success')
    .select('id');
  if (dbErr) throw dbErr;
  if (!data || data.length === 0) {
    throw new Error(`markSuccess: no log row found for deal ${dealId}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────

function extractFromPayload(payload: unknown): {
  cnpj: string;
  nome: string;
  inicio: string;
  fim: string;
  disparadoPor: string;
} {
  const p = (payload ?? {}) as Record<string, unknown>;
  const deal = (p['deal'] ?? {}) as Record<string, unknown>;
  const cf = (deal['custom_fields'] ?? {}) as Record<string, unknown>;
  const tb = (p['triggered_by'] ?? {}) as Record<string, unknown>;
  return {
    cnpj: asString(cf['cnpj']) || '',
    nome: asString(cf['cliente_nome_razao']) || '',
    inicio: asString(cf['contrato_inicio']) || '1970-01-01',
    fim: asString(cf['contrato_fim']) || '1970-01-01',
    disparadoPor: asString(tb['user_email']) || asString(tb['user_id']) || 'unknown',
  };
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
