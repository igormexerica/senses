import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  FIELD_CONTROL_API_KEY: z.string().min(1, 'FIELD_CONTROL_API_KEY is required'),

  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),

  CLINT_API_BASE: z.string().url().default('https://api.clint.digital'),
  CLINT_API_KEY: z.string().min(1).optional(),

  N8N_WEBHOOK_BASE_URL: z.string().url().optional(),

  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_CHAT_ID_GESTOR_CS: z.string().min(1, 'TELEGRAM_CHAT_ID_GESTOR_CS is required'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
