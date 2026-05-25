import { z } from 'zod';

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Payload que a Clint envia em "Negócio entrou na etapa Boas-Vindas".
 * Estrutura segue seção 3.4 do integracao-clint-field-senses.md, com o
 * acréscimo de `field_customer_id` em custom_fields — pré-requisito pra
 * criar OS no Field (idealmente preenchido na Clint via dropdown
 * vinculado ao customer já cadastrado no Field).
 */

export const ChecklistItemSchema = z.object({
  item: z.string(),
  done: z.boolean(),
});

export const CustomFieldsSchema = z.object({
  cnpj: z.string().optional(),
  cliente_nome_razao: z.string().optional(),
  contrato_inicio: z.string().optional(),
  contrato_fim: z.string().optional(),
  endereco_completo: z.string().optional(),
  telefone_contato: z.string().optional(),
  email_contato: z.string().optional(),
  tecnico_padrao_id: z.string().optional(),
  /** ID base64 do customer no Field Control. Obrigatório pra criar OS. */
  field_customer_id: z.string().optional(),
});

export const WebhookClintPayloadSchema = z.object({
  deal: z.object({
    id: z.string().min(1),
    stage: z.string().min(1),
    custom_fields: CustomFieldsSchema,
    checklist: z.array(ChecklistItemSchema).default([]),
  }),
  contact: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  triggered_by: z.object({
    user_id: z.string().optional(),
    user_email: z.string().min(1),
  }),
  triggered_at: z.string().optional(),
});

export type WebhookClintPayload = z.infer<typeof WebhookClintPayloadSchema>;

export type WebhookOutcome =
  | { status: 'success'; totalOs: number; createdOrderIds: string[] }
  | { status: 'partial' | 'failed'; totalOs: number; createdOrderIds: string[]; motivo: string }
  | { status: 'ignorado_etapa_errada'; stageRecebido: string }
  | { status: 'ignorado_checklist_incompleto'; itensFaltando: string[] }
  | { status: 'ignorado_campos_incompletos'; camposFaltando: string[] }
  | { status: 'ignorado_duplicado' };

export interface WebhookResponse {
  clintDealId: string;
  pipeline: 'onboarding_remoto' | 'onboarding_presencial';
  outcome: WebhookOutcome;
}

/** Campos obrigatórios pra disparar a criação de OS. */
export const REQUIRED_CUSTOM_FIELDS = [
  'cnpj',
  'cliente_nome_razao',
  'contrato_inicio',
  'contrato_fim',
  'field_customer_id',
] as const;

export const EXPECTED_STAGE = 'Boas-Vindas';

/**
 * Identifica campos obrigatórios faltando + valida formato YYYY-MM-DD das datas.
 */
export function findMissingFields(cf: z.infer<typeof CustomFieldsSchema>): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_CUSTOM_FIELDS) {
    const value = cf[key];
    if (typeof value !== 'string' || value.trim() === '') {
      missing.push(key);
    }
  }
  if (typeof cf.contrato_inicio === 'string' && !YYYY_MM_DD.test(cf.contrato_inicio)) {
    missing.push('contrato_inicio (formato inválido — esperado YYYY-MM-DD)');
  }
  if (typeof cf.contrato_fim === 'string' && !YYYY_MM_DD.test(cf.contrato_fim)) {
    missing.push('contrato_fim (formato inválido — esperado YYYY-MM-DD)');
  }
  return missing;
}
