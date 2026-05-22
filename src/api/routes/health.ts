import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      version: '0.1.0',
    };
  });
}
