import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loadEnv } from '../../lib/env.js';

const AUTH_BYPASS_PREFIXES = ['/api/v1/health'];

export function registerAuth(app: FastifyInstance): void {
  const env = loadEnv();
  if (!env.API_INTERNAL_KEY) {
    throw new Error('API_INTERNAL_KEY ausente no .env — necessário pra autenticar requisições.');
  }
  const expected = env.API_INTERNAL_KEY;

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (AUTH_BYPASS_PREFIXES.some((p) => req.url.startsWith(p))) {
      return;
    }
    const provided = req.headers['x-api-key'];
    if (!provided || typeof provided !== 'string') {
      reply.code(401).send({
        error: 'unauthorized',
        message: 'Header X-Api-Key obrigatório.',
      });
      return reply;
    }
    if (provided !== expected) {
      reply.code(403).send({
        error: 'forbidden',
        message: 'X-Api-Key inválida.',
      });
      return reply;
    }
  });
}
