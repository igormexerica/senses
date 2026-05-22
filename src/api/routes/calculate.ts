import type { FastifyInstance } from 'fastify';
import { calcularDatasPresencial } from '../../calculators/presencial.js';
import { calcularDatasRemoto } from '../../calculators/remoto.js';
import {
  CalculateOsRequestSchema,
  type CalculateOsResponse,
} from '../schemas/calculate.js';

export async function calculateRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/calculate-os', async (req) => {
    const body = CalculateOsRequestSchema.parse(req.body);
    const input = {
      contratoInicio: new Date(`${body.contratoInicio}T00:00:00Z`),
      contratoFim: new Date(`${body.contratoFim}T00:00:00Z`),
    };

    const items =
      body.pipeline === 'onboarding_remoto'
        ? await calcularDatasRemoto(input)
        : await calcularDatasPresencial(input);

    const response: CalculateOsResponse = {
      pipeline: body.pipeline,
      totalOs: items.length,
      items,
    };
    req.log.info(
      { pipeline: body.pipeline, totalOs: items.length },
      'calculate_os_completed',
    );
    return response;
  });
}
