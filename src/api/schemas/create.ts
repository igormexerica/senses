import { z } from 'zod';

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export const CreateOrdersRequestSchema = z.object({
  clintDealId: z.string().min(1),
  customerId: z.string().min(1), // ID base64 do customer no Field
  pipeline: z.enum(['onboarding_remoto', 'onboarding_presencial']),
  contratoInicio: z.string().regex(YYYY_MM_DD, 'contratoInicio deve estar em YYYY-MM-DD'),
  contratoFim: z.string().regex(YYYY_MM_DD, 'contratoFim deve estar em YYYY-MM-DD'),
  cnpj: z.string().min(1),
  clienteNome: z.string().min(1),
  disparadoPor: z.string().min(1),
});

export type CreateOrdersRequest = z.infer<typeof CreateOrdersRequestSchema>;

export type CreateOrdersStatus = 'success' | 'ignorado_duplicado' | 'failed';

export interface CreateOrdersResponse {
  clintDealId: string;
  status: CreateOrdersStatus;
  totalOs: number;
  createdOrderIds: string[];
  skipped?: { motivo: string };
  failed?: { motivo: string; criadasParciais: string[] };
}
