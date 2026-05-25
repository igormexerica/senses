import type { FastifyInstance } from 'fastify';
import { syncFieldCustomers } from '../../lib/field-customer-sync.js';

/**
 * Trigger manual da sincronização Field → field_customer_mapping.
 *
 * Caller típico: operação humana resolvendo "customer X foi cadastrado no
 * Field agora, não quero esperar o cron". Auth via X-Api-Key (middleware
 * global). Sem body.
 *
 * Timeout total ~60s (server tem connectionTimeout 65s). Sync típico
 * com ~1300 customers e pausa de 800ms entre páginas leva ~10-15s.
 */
export async function syncCustomersRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/sync-customers', async (req) => {
    const result = await syncFieldCustomers({
      triggeredBy: 'manual',
      logger: req.log,
    });
    return result;
  });
}
