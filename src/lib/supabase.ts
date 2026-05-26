import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeDocument } from './document.js';
import { loadEnv } from './env.js';
import type { Pipeline } from './types.js';

const TABLE = 'os_geracao_log';
const MAPPING_TABLE = 'field_customer_mapping';
const UPSERT_BATCH_SIZE = 100;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type OsLogStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'queued_recurrence'
  | 'recurrence_created'
  | 'failed_playwright'
  | 'ignorado_checklist_incompleto'
  | 'ignorado_campos_incompletos'
  | 'ignorado_customer_not_mapped'
  | 'ignorado_duplicado';

export type Gatilho = 'disparo_1' | 'disparo_2';

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
  os_field_ids?: OsFieldRef[] | string[];
  datas_geradas: unknown;
  total_os?: number;
  disparado_por: string;
  status: OsLogStatus;
  erro?: string | null;
  tentativas?: number;
  // Migration 002: rastreabilidade Field
  field_order_id?: string | null;
  field_customer_id?: string | null;
  // Migration 004: rastreio do disparo + Recorrência
  gatilho?: Gatilho | null;
  field_recurrence_id?: string | null;
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
  os_field_ids: OsFieldRef[] | string[];
  datas_geradas: unknown;
  total_os: number;
  disparado_por: string;
  disparado_em: string;
  status: OsLogStatus;
  erro: string | null;
  tentativas: number;
  // Migration 002: rastreabilidade Field
  field_order_id: string | null;
  field_customer_id: string | null;
}

// ─────────────────────────────────────────────────────────────
// Client (eager — fails fast if env is missing)
// ─────────────────────────────────────────────────────────────

const env = loadEnv();

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
  throw new Error(
    'Supabase env ausente: SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios pra importar este módulo.',
  );
}

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
 * Atualiza um log existente para `status='success'` e grava os IDs das OS +
 * (opcional) field_order_id e field_customer_id pra rastreabilidade reversa.
 *
 * A unique partial index `uq_log_deal` dispara aqui se já existir success pra
 * esse deal. Throws se nenhuma linha for atualizada.
 */
export async function markSuccess(
  dealId: string,
  opts: {
    osFieldIds: string[];
    fieldOrderId?: string;
    fieldCustomerId?: string;
  },
): Promise<void> {
  const update: Record<string, unknown> = {
    status: 'success',
    os_field_ids: opts.osFieldIds,
    total_os: opts.osFieldIds.length,
    erro: null,
  };
  if (opts.fieldOrderId !== undefined) update.field_order_id = opts.fieldOrderId;
  if (opts.fieldCustomerId !== undefined) update.field_customer_id = opts.fieldCustomerId;

  const { data, error: dbErr } = await supabase
    .from(TABLE)
    .update(update)
    .eq('clint_deal_id', dealId)
    .neq('status', 'success')
    .select('id');
  if (dbErr) throw dbErr;
  if (!data || data.length === 0) {
    throw new Error(`markSuccess: no log row found for deal ${dealId}`);
  }
}

/**
 * Lookup reverso: dado um `field_order_id` (ID da OS no Field Control),
 * retorna o log correspondente — útil pra rastrear "esse order do Field
 * veio de qual deal do Clint?".
 */
export async function findByFieldOrderId(fieldOrderId: string): Promise<OsLogRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('field_order_id', fieldOrderId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as OsLogRow | null) ?? null;
}

// ─────────────────────────────────────────────────────────────
// field_customer_mapping (Plano B do design 2026-05-25)
// ─────────────────────────────────────────────────────────────

export interface FieldCustomerMapping {
  fieldCustomerId: string;
  customerName: string | null;
  primaryLocationId: string | null;
  lastSyncedAt: Date;
}

export interface UpsertMappingRow {
  documentNumber: string;
  fieldCustomerId: string;
  customerName: string | null;
  primaryLocationId: string | null;
}

export interface UpsertMappingResult {
  upserted: number;
  skipped: number;
}

/**
 * Lookup CNPJ/CPF (normalizado ou com máscara) → field_customer_id.
 * Retorna null se documento for inválido ou não estiver mapeado.
 *
 * Não tenta fallback (auto-resync etc.) — caller decide o que fazer.
 */
export async function findFieldCustomerByDocument(
  documentNumber: string,
): Promise<FieldCustomerMapping | null> {
  const normalized = normalizeDocument(documentNumber);
  if (normalized === null) return null;

  const { data, error } = await supabase
    .from(MAPPING_TABLE)
    .select('field_customer_id, customer_name, primary_location_id, last_synced_at')
    .eq('document_number', normalized)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;

  const row = data as {
    field_customer_id: string;
    customer_name: string | null;
    primary_location_id: string | null;
    last_synced_at: string;
  };
  return {
    fieldCustomerId: row.field_customer_id,
    customerName: row.customer_name,
    primaryLocationId: row.primary_location_id,
    lastSyncedAt: new Date(row.last_synced_at),
  };
}

/**
 * Upsert em lote no mapping. Normaliza documento antes; rows com documento
 * inválido vão pro contador `skipped` (não estouram a operação).
 *
 * Conflict target: document_number (PK). Em conflito atualiza
 * field_customer_id, customer_name, primary_location_id e last_synced_at.
 */
export async function upsertFieldCustomerMapping(
  rows: UpsertMappingRow[],
): Promise<UpsertMappingResult> {
  let upserted = 0;
  let skipped = 0;

  const validRows: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const normalized = normalizeDocument(r.documentNumber);
    if (normalized === null) {
      skipped++;
      continue;
    }
    validRows.push({
      document_number: normalized,
      field_customer_id: r.fieldCustomerId,
      customer_name: r.customerName,
      primary_location_id: r.primaryLocationId,
      last_synced_at: new Date().toISOString(),
    });
  }

  for (let i = 0; i < validRows.length; i += UPSERT_BATCH_SIZE) {
    const chunk = validRows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from(MAPPING_TABLE)
      .upsert(chunk, { onConflict: 'document_number' });
    if (error) throw error;
    upserted += chunk.length;
  }

  return { upserted, skipped };
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
