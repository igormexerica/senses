import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loadEnv } from '../../lib/env.js';

const WEBHOOK_PREFIX = '/api/v1/webhook/';

/**
 * Valida header `X-Webhook-Secret` em todas as rotas sob /api/v1/webhook/.
 * Comparação em tempo constante via crypto.timingSafeEqual.
 *
 * - sem header → 401
 * - header inválido → 403
 *
 * Falha rápido no boot se WEBHOOK_SECRET não estiver no env (não faz sentido
 * subir o microserviço sem o gate do webhook ativo).
 */
export function registerWebhookAuth(app: FastifyInstance): void {
  const env = loadEnv();
  if (!env.WEBHOOK_SECRET) {
    throw new Error('WEBHOOK_SECRET ausente no .env — obrigatório pra subir as rotas de webhook.');
  }
  const expected = Buffer.from(env.WEBHOOK_SECRET, 'utf8');

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith(WEBHOOK_PREFIX)) return;

    const provided = req.headers['x-webhook-secret'];
    if (!provided || typeof provided !== 'string') {
      reply.code(401).send({
        error: 'unauthorized',
        message: 'Header X-Webhook-Secret obrigatório.',
      });
      return reply;
    }

    const providedBuf = Buffer.from(provided, 'utf8');
    if (providedBuf.length !== expected.length || !timingSafeEqual(providedBuf, expected)) {
      reply.code(403).send({
        error: 'forbidden',
        message: 'X-Webhook-Secret inválido.',
      });
      return reply;
    }
  });
}
