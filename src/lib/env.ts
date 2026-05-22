import 'dotenv/config';
import { z } from 'zod';

/**
 * Converte string vazia em undefined antes do parse Zod. No .env, vars não
 * preenchidas ficam como "" — sem isso, `.optional()` não dispara e `.url()`
 * estoura com "Invalid url" mesmo em campos opcionais.
 */
const emptyToUndef = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const optionalString = z.preprocess(emptyToUndef, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndef, z.string().url().optional());

/**
 * Apenas FIELD_CONTROL_API_KEY é globalmente obrigatório — ela é usada pelo
 * discover-schema, pelo smoke test do Field e por toda criação de OS.
 *
 * As outras vars são opcionais aqui e validadas no ponto de uso (supabase.ts,
 * telegram.ts) — assim scripts isolados (discover-schema) não precisam de .env
 * completo pra rodar.
 */
const EnvSchema = z.object({
  FIELD_CONTROL_API_KEY: z.string().min(1, 'FIELD_CONTROL_API_KEY is required'),

  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_KEY: optionalString,

  CLINT_API_BASE: z.preprocess(emptyToUndef, z.string().url().default('https://api.clint.digital')),
  CLINT_API_KEY: optionalString,

  N8N_WEBHOOK_BASE_URL: optionalUrl,

  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID_GESTOR_CS: optionalString,
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
