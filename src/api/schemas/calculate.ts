import { z } from 'zod';

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export const CalculateOsRequestSchema = z.object({
  pipeline: z.enum(['onboarding_remoto', 'onboarding_presencial']),
  contratoInicio: z.string().regex(YYYY_MM_DD, 'contratoInicio deve estar em YYYY-MM-DD'),
  contratoFim: z.string().regex(YYYY_MM_DD, 'contratoFim deve estar em YYYY-MM-DD'),
});

export type CalculateOsRequest = z.infer<typeof CalculateOsRequestSchema>;

export interface CalculateOsResponseItem {
  tipo: string;
  data: string;
  dataCalculada?: string;
  descricao: string;
}

export interface CalculateOsResponse {
  pipeline: CalculateOsRequest['pipeline'];
  totalOs: number;
  items: CalculateOsResponseItem[];
}
