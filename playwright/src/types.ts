import { z } from 'zod';

/**
 * Job que vai do microserviço → fila BullMQ → worker Playwright.
 * IDs e nomes (não selectores CSS) — o worker resolve via UI navigation.
 */
export const RecurrenceJobSchema = z.object({
  dealId: z.string().min(1),
  pipeline: z.enum(['onboarding_remoto', 'onboarding_presencial']),
  fieldCustomerName: z.string().min(1),
  fieldCustomerId: z.string().min(1),
  serviceTypeName: z.string().min(1),
  description: z.string().default(''),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  frequencyUnit: z.enum(['days', 'weeks', 'months']),
  frequencyValue: z.number().int().positive(),
  skipWeekends: z.boolean(),
});

export type RecurrenceJob = z.infer<typeof RecurrenceJobSchema>;

export interface RecurrenceResult {
  ok: true;
  /** ID extraído da URL pós-submit, se conseguirmos parsear. */
  fieldRecurrenceId?: string;
  durationMs: number;
}

export interface RecurrenceFailure {
  ok: false;
  reason: string;
  screenshotPath?: string;
  durationMs: number;
}
