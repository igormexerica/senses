/**
 * Bootstrap do microserviço HTTP (Fastify).
 *
 * Roda em dev: `npm run api:dev` (tsx watch).
 * Roda em prod (container): `npm run api:start`.
 *
 * Endpoints (todos sob /api/v1):
 *   GET  /health                          — público, sem auth.
 *   POST /calculate-os                    — X-Api-Key. Dry-run, sem efeitos.
 *   POST /create-orders                   — X-Api-Key. Cria no Field + log.
 *   POST /webhook/clint/onboarding-*      — X-Webhook-Secret. Webhook da Clint.
 */
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadEnv } from '../lib/env.js';
import { registerAuth } from './middleware/auth.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerWebhookAuth } from './middleware/webhook-auth.js';
import { calculateRoutes } from './routes/calculate.js';
import { createRoutes } from './routes/create.js';
import { healthRoutes } from './routes/health.js';
import { webhookClintRoutes } from './routes/webhook-clint.js';

const REQUEST_TIMEOUT_MS = 65_000; // 60s timeout em /create-orders + margem

export async function buildServer(): Promise<FastifyInstance> {
  const env = loadEnv();

  const isDev = env.NODE_ENV === 'development';
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      ...(isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
    connectionTimeout: REQUEST_TIMEOUT_MS,
    bodyLimit: 1024 * 1024, // 1 MB
    trustProxy: true,
    disableRequestLogging: false,
  });

  await app.register(sensible);

  registerAuth(app);
  registerWebhookAuth(app);
  registerErrorHandler(app);

  await app.register(healthRoutes);
  await app.register(calculateRoutes);
  await app.register(createRoutes);
  await app.register(webhookClintRoutes);

  return app;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutdown_initiated');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown_error');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    app.log.info({ port: env.API_PORT, host: env.API_HOST }, 'api_listening');
  } catch (err) {
    app.log.error({ err }, 'startup_failed');
    process.exit(1);
  }
}

main();
