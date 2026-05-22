import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Pipeline discriminator
// ─────────────────────────────────────────────────────────────
export const PipelineSchema = z.enum(['onboarding_remoto', 'onboarding_presencial']);
export type Pipeline = z.infer<typeof PipelineSchema>;

// ─────────────────────────────────────────────────────────────
// Clint webhook payload (section 3.4 of spec)
// ─────────────────────────────────────────────────────────────
export const ChecklistItemSchema = z.object({
  item: z.string(),
  done: z.boolean(),
});

export const DealCustomFieldsSchema = z.object({
  cnpj: z.string(),
  cliente_nome_razao: z.string(),
  contrato_inicio: z.string(), // 'YYYY-MM-DD'
  contrato_fim: z.string(),
  endereco_completo: z.string(),
  telefone_contato: z.string(),
  email_contato: z.string().email(),
  tecnico_padrao_id: z.string(),
  os_field_ids_geradas: z.string().optional(),
  disparo_status: z.string().optional(),
});

export const ClintWebhookPayloadSchema = z.object({
  deal: z.object({
    id: z.string(),
    stage: z.string(),
    custom_fields: DealCustomFieldsSchema,
    checklist: z.array(ChecklistItemSchema),
  }),
  contact: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string(),
  }),
  triggered_by: z.object({
    user_id: z.string(),
    user_email: z.string().email(),
  }),
  triggered_at: z.string(),
});

export type ClintWebhookPayload = z.infer<typeof ClintWebhookPayloadSchema>;
export type DealCustomFields = z.infer<typeof DealCustomFieldsSchema>;
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// ─────────────────────────────────────────────────────────────
// Calculator output — OS to be created
// ─────────────────────────────────────────────────────────────
export type OSType =
  | 'envio_refil_inicial'
  | 'envio_refil_equalizacao'
  | 'envio_refil_regular'
  | 'visita_tecnica_inicial'
  | 'visita_tecnica_regular';

export interface OSToCreate {
  tipo: OSType;
  data: string;              // 'YYYY-MM-DD' — data efetiva que vai pro Field
  dataCalculada?: string;    // data teórica antes de normalização (dia 01 / dia útil)
  descricao: string;
}

// Supabase log types live in src/lib/supabase.ts (OsLogStatus, OsLogEntry, OsLogRow).
// Field Control types live in src/lib/field-control.ts (FieldClient, FieldServiceOrder, CreateClientInput, CreateOSInput, UpdateOSInput).
