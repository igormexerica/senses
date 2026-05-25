import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { calcularDatasPresencial } from '../../calculators/presencial.js';
import { calcularDatasRemoto } from '../../calculators/remoto.js';
import {
  buildOrderPayload,
  createOrder,
  FIELD_SERVICE_IDS,
} from '../../lib/field-control.js';
import {
  checkIdempotency,
  insertLog,
  markFailed,
  markSuccess,
} from '../../lib/supabase.js';
import type { OSToCreate, Pipeline } from '../../lib/types.js';
import {
  CreateOrdersRequestSchema,
  type CreateOrdersRequest,
  type CreateOrdersResponse,
} from '../schemas/create.js';

/** Rate limit observado: ~75 req/min. 900ms entre POSTs fica em ~67 req/min, com folga. */
const FIELD_POST_DELAY_MS = 900;

/** Sleep entre POSTs pra não bater no rate limit do Field. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface RunCreateOrdersResult {
  response: CreateOrdersResponse;
  /** Sugestão de HTTP status — caller decide se aplica. */
  httpStatus: 200 | 502;
}

/**
 * Pipeline completo de criação de OS — extraído da rota pra ser reutilizado
 * pelo handler do webhook Clint (que chama esta função direto, sem ciclo HTTP).
 */
export async function runCreateOrders(
  body: CreateOrdersRequest,
  parentLog: FastifyBaseLogger,
): Promise<RunCreateOrdersResult> {
  const log = parentLog.child({ clint_deal_id: body.clintDealId, pipeline: body.pipeline });

  // a. Idempotência
  const jaCriado = await checkIdempotency(body.clintDealId);
  if (jaCriado) {
    log.info('ignored_duplicate');
    return {
      response: {
        clintDealId: body.clintDealId,
        status: 'ignorado_duplicado',
        totalOs: 0,
        createdOrderIds: [],
        skipped: { motivo: 'já existe log com status=success pra esse clintDealId' },
      },
      httpStatus: 200,
    };
  }

  // b. Calcular datas
  const items = await calcularDatas(body);
  log.info({ totalOs: items.length }, 'calc_completed');

  // Log placeholder com status=failed (atualizado ao final)
  await insertLog({
    pipeline: body.pipeline,
    clint_deal_id: body.clintDealId,
    cliente_cnpj: body.cnpj,
    cliente_nome: body.clienteNome,
    contrato_inicio: body.contratoInicio,
    contrato_fim: body.contratoFim,
    tipo_os: body.pipeline === 'onboarding_remoto' ? 'envio_refil' : 'visita_tecnica',
    datas_geradas: items,
    total_os: items.length,
    disparado_por: body.disparadoPor,
    status: 'failed',
    erro: 'em_processamento',
    field_customer_id: body.customerId,
  });

  // c. Criar OS uma a uma com pausa
  const serviceId =
    body.pipeline === 'onboarding_remoto'
      ? FIELD_SERVICE_IDS.REMOTO_ENVIO_RECARGA
      : FIELD_SERVICE_IDS.PRESENCIAL_MANUTENCAO;

  const createdOrderIds: string[] = [];
  let firstFailure: { motivo: string; index: number } | null = null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    try {
      const payload = await buildOrderPayload({
        clintDealId: body.clintDealId,
        customerId: body.customerId,
        serviceId,
        description: `[${body.pipeline}] ${item.descricao}`,
        scheduledDate: item.data,
      });
      const order = await createOrder(payload);
      createdOrderIds.push(order.id);
      log.info(
        { index: i, fieldOrderId: order.id, scheduledDate: item.data },
        'order_created',
      );
    } catch (err) {
      const motivo = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      firstFailure = { motivo, index: i };
      log.error({ err, index: i, scheduledDate: item.data }, 'order_create_failed');
      break;
    }
    if (i < items.length - 1) await sleep(FIELD_POST_DELAY_MS);
  }

  // d. Atualiza log
  if (firstFailure === null) {
    await markSuccess(body.clintDealId, {
      osFieldIds: createdOrderIds,
      ...(createdOrderIds[0] !== undefined ? { fieldOrderId: createdOrderIds[0] } : {}),
      fieldCustomerId: body.customerId,
    });
    log.info({ totalOs: createdOrderIds.length }, 'create_orders_success');
    return {
      response: {
        clintDealId: body.clintDealId,
        status: 'success',
        totalOs: createdOrderIds.length,
        createdOrderIds,
      },
      httpStatus: 200,
    };
  }

  // e. Falha parcial ou total → markFailed + 502
  const erroMsg = `Falha ao criar OS ${firstFailure.index + 1}/${items.length}: ${firstFailure.motivo}. Criadas parciais: ${createdOrderIds.length}`;
  await markFailed(body.clintDealId, erroMsg);
  log.warn(
    { criadasParciais: createdOrderIds.length, motivo: firstFailure.motivo },
    'create_orders_failed',
  );
  return {
    response: {
      clintDealId: body.clintDealId,
      status: 'failed',
      totalOs: createdOrderIds.length,
      createdOrderIds,
      failed: { motivo: firstFailure.motivo, criadasParciais: createdOrderIds },
    },
    httpStatus: 502,
  };
}

export async function createRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/create-orders', async (req, reply) => {
    const body = CreateOrdersRequestSchema.parse(req.body);
    const result = await runCreateOrders(body, req.log);
    if (result.httpStatus !== 200) reply.code(result.httpStatus);
    return result.response;
  });
}

async function calcularDatas(body: CreateOrdersRequest): Promise<OSToCreate[]> {
  const input = {
    contratoInicio: new Date(`${body.contratoInicio}T00:00:00Z`),
    contratoFim: new Date(`${body.contratoFim}T00:00:00Z`),
  };
  const pipeline: Pipeline = body.pipeline;
  return pipeline === 'onboarding_remoto'
    ? calcularDatasRemoto(input)
    : calcularDatasPresencial(input);
}
