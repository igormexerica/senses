import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TelegramNotifier } from '../../lib/telegram.js';
import { loadEnv } from '../../lib/env.js';
import { buildRecurrenceJob, enqueueRecurrence } from '../../lib/recurrence-queue.js';
import {
  findFieldCustomerByDocument,
  insertLog,
  logIgnorado,
} from '../../lib/supabase.js';
import type { Pipeline } from '../../lib/types.js';
import type { CreateOrdersRequest } from '../schemas/create.js';
import {
  WebhookClintPayloadSchema,
  findMissingFields,
  type WebhookClintPayload,
  type WebhookResponse,
} from '../schemas/webhook-clint.js';
import { runCreateInitialOrder } from './create.js';

/**
 * Rotas que recebem o webhook OUT da Clint. Cada disparo é uma URL distinta
 * — Igor configura 4 webhooks na Clint (2 pipelines × 2 disparos), todos
 * apontando aqui com `?gatilho=disparo_1` ou `?gatilho=disparo_2`.
 *
 *   - DISPARO #1 (saída Checklist Comercial): cria 1 OS "envio inicial"
 *     com data=HOJE via REST /orders.
 *   - DISPARO #2 (saída Definição de Fragrância): enfileira criação de
 *     Recorrência no Field via worker Playwright (API REST do Field não
 *     expõe o recurso — confirmado pelo suporte 26/05/2026).
 *
 * Stage check vira advisory: loga warn se vier algo inesperado, mas
 * NÃO bloqueia (o gatilho via query string é a fonte de verdade).
 *
 * SEMPRE retorna 200 (exceto 400 em payload mal-formado) — pra Clint não
 * retentar.
 */

const GatilhoQuerySchema = z.object({
  gatilho: z.enum(['disparo_1', 'disparo_2']),
});

export async function webhookClintRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/webhook/clint/onboarding-remoto', async (req, reply) =>
    handleWebhook(req, reply, 'onboarding_remoto'),
  );

  app.post('/api/v1/webhook/clint/onboarding-presencial', async (req, reply) =>
    handleWebhook(req, reply, 'onboarding_presencial'),
  );
}

async function handleWebhook(
  req: FastifyRequest,
  reply: FastifyReply,
  pipeline: Pipeline,
): Promise<WebhookResponse> {
  const parentLog = req.log;

  // Gatilho via query string ?gatilho=disparo_1|disparo_2
  const gatilhoParsed = GatilhoQuerySchema.safeParse(req.query);
  if (!gatilhoParsed.success) {
    parentLog.warn({ query: req.query }, 'webhook_invalid_gatilho');
    reply.code(400);
    return {
      clintDealId: '',
      pipeline,
      outcome: {
        status: 'ignorado_campos_incompletos',
        camposFaltando: ['query.gatilho (esperado: disparo_1 ou disparo_2)'],
      },
    };
  }
  const gatilho = gatilhoParsed.data.gatilho;

  // Schema do payload
  const parsed = WebhookClintPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    parentLog.warn({ issues: parsed.error.issues, gatilho }, 'webhook_invalid_payload');
    reply.code(400);
    return {
      clintDealId: '',
      pipeline,
      outcome: {
        status: 'ignorado_campos_incompletos',
        camposFaltando: parsed.error.issues.map((i) => i.path.join('.')),
      },
    };
  }

  const payload: WebhookClintPayload = parsed.data;
  const log = parentLog.child({ clint_deal_id: payload.deal.id, pipeline, gatilho });
  log.info({ stage: payload.deal.stage }, 'webhook_received');

  // Checklist
  const itensFaltando = payload.deal.checklist.filter((i) => !i.done).map((i) => i.item);
  if (itensFaltando.length > 0 || payload.deal.checklist.length === 0) {
    log.info({ itensFaltando }, 'webhook_ignored_checklist_incompleto');
    await safeLogIgnorado(payload.deal.id, 'ignorado_checklist_incompleto', payload, {
      pipeline,
      erro: `Itens faltando: ${itensFaltando.join(', ') || '(checklist vazio)'}`,
      gatilho,
    }, log);
    return {
      clintDealId: payload.deal.id,
      pipeline,
      outcome: {
        status: 'ignorado_checklist_incompleto',
        itensFaltando: itensFaltando.length > 0 ? itensFaltando : ['(checklist vazio)'],
      },
    };
  }

  // Custom fields obrigatórios
  const camposFaltando = findMissingFields(payload.deal.custom_fields);
  if (camposFaltando.length > 0) {
    log.warn({ camposFaltando }, 'webhook_ignored_campos_incompletos');
    await safeLogIgnorado(payload.deal.id, 'ignorado_campos_incompletos', payload, {
      pipeline,
      erro: `Campos faltando: ${camposFaltando.join(', ')}`,
      gatilho,
    }, log);
    await safeNotifyGestor(
      `⚠️ Webhook ${pipeline} (${gatilho}) ignorado — campos faltando no deal *${payload.deal.id}*: ${camposFaltando.join(', ')}`,
      log,
    );
    return {
      clintDealId: payload.deal.id,
      pipeline,
      outcome: { status: 'ignorado_campos_incompletos', camposFaltando },
    };
  }

  // Resolve customerId (payload fallback ou mapping table)
  const cf = payload.deal.custom_fields;
  const cnpj = cf.cnpj as string;
  let customerId: string;
  let customerName: string;
  if (typeof cf.field_customer_id === 'string' && cf.field_customer_id.trim() !== '') {
    customerId = cf.field_customer_id.trim();
    customerName = (cf.cliente_nome_razao as string) ?? '';
    log.info({ source: 'payload_fallback' }, 'customer_lookup');
  } else {
    const mapping = await findFieldCustomerByDocument(cnpj);
    if (mapping === null) {
      log.warn({ cnpj }, 'customer_not_mapped');
      await safeLogIgnorado(payload.deal.id, 'ignorado_customer_not_mapped', payload, {
        pipeline,
        erro: `CNPJ ${cnpj} não mapeado em field_customer_mapping — re-sync manual via POST /api/v1/sync-customers`,
        gatilho,
      }, log);
      await safeNotifyGestor(
        `⚠️ CNPJ não mapeado no Field: \`${cnpj}\` (deal *${payload.deal.id}*, ${cf.cliente_nome_razao ?? '?'}). Rode \`POST /api/v1/sync-customers\` ou preencha \`field_customer_id\` manualmente na Clint.`,
        log,
      );
      return {
        clintDealId: payload.deal.id,
        pipeline,
        outcome: { status: 'ignorado_customer_not_mapped', cnpj },
      };
    }
    customerId = mapping.fieldCustomerId;
    customerName = mapping.customerName ?? (cf.cliente_nome_razao as string) ?? '';
    log.info(
      { source: 'mapping_table', fieldCustomerId: customerId, lastSyncedAt: mapping.lastSyncedAt },
      'customer_lookup',
    );
  }

  // Bifurca por gatilho
  if (gatilho === 'disparo_1') {
    return handleDisparo1({ payload, pipeline, cnpj, customerId, log, reply });
  }
  return handleDisparo2({ payload, pipeline, cnpj, customerId, customerName, log });
}

interface DisparoContext {
  payload: WebhookClintPayload;
  pipeline: Pipeline;
  cnpj: string;
  customerId: string;
  log: FastifyBaseLogger;
}

async function handleDisparo1(
  ctx: DisparoContext & { reply: FastifyReply },
): Promise<WebhookResponse> {
  const { payload, pipeline, cnpj, customerId, log, reply } = ctx;
  const cf = payload.deal.custom_fields;
  const createBody: CreateOrdersRequest = {
    clintDealId: payload.deal.id,
    customerId,
    pipeline,
    contratoInicio: (cf.contrato_inicio as string) ?? '',
    contratoFim: (cf.contrato_fim as string) ?? '',
    cnpj,
    clienteNome: (cf.cliente_nome_razao as string) ?? '',
    disparadoPor: payload.triggered_by.user_email,
  };
  const { response, httpStatus } = await runCreateInitialOrder(createBody, log);
  if (httpStatus !== 200) reply.code(httpStatus);

  if (response.status === 'success') {
    return {
      clintDealId: payload.deal.id,
      pipeline,
      outcome: {
        status: 'success',
        totalOs: response.totalOs,
        createdOrderIds: response.createdOrderIds,
      },
    };
  }
  if (response.status === 'ignorado_duplicado') {
    return {
      clintDealId: payload.deal.id,
      pipeline,
      outcome: { status: 'ignorado_duplicado' },
    };
  }
  return {
    clintDealId: payload.deal.id,
    pipeline,
    outcome: {
      status: 'failed',
      totalOs: response.totalOs,
      createdOrderIds: response.createdOrderIds,
      motivo: response.failed?.motivo ?? 'erro desconhecido',
    },
  };
}

async function handleDisparo2(
  ctx: DisparoContext & { customerName: string },
): Promise<WebhookResponse> {
  const { payload, pipeline, cnpj, customerId, customerName, log } = ctx;
  const cf = payload.deal.custom_fields;
  const startsAt = today();
  const job = buildRecurrenceJob({
    dealId: payload.deal.id,
    pipeline,
    fieldCustomerName: customerName,
    fieldCustomerId: customerId,
    startsAt,
  });

  try {
    const jobId = await enqueueRecurrence(job);

    await insertLog({
      pipeline,
      clint_deal_id: payload.deal.id,
      cliente_cnpj: cnpj,
      cliente_nome: customerName,
      contrato_inicio: (cf.contrato_inicio as string) ?? startsAt,
      contrato_fim: (cf.contrato_fim as string) ?? startsAt,
      tipo_os: pipeline === 'onboarding_remoto' ? 'envio_refil' : 'visita_tecnica',
      datas_geradas: {
        kind: 'recurrence',
        startsAt,
        frequencyUnit: job.frequencyUnit,
        frequencyValue: job.frequencyValue,
        serviceTypeName: job.serviceTypeName,
        skipWeekends: job.skipWeekends,
      },
      total_os: 0,
      disparado_por: payload.triggered_by.user_email,
      status: 'queued_recurrence',
      field_customer_id: customerId,
      gatilho: 'disparo_2',
    });

    log.info(
      { jobId, serviceTypeName: job.serviceTypeName, frequencyValue: job.frequencyValue },
      'recurrence_enqueued',
    );
    return {
      clintDealId: payload.deal.id,
      pipeline,
      outcome: {
        status: 'success',
        totalOs: 0,
        createdOrderIds: [],
      },
    };
  } catch (err) {
    const motivo = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    log.error({ err }, 'recurrence_enqueue_failed');
    await safeNotifyGestor(
      `❌ Falha ao enfileirar Recorrência (deal *${payload.deal.id}*, ${pipeline}): ${motivo}`,
      log,
    );
    return {
      clintDealId: payload.deal.id,
      pipeline,
      outcome: {
        status: 'failed',
        totalOs: 0,
        createdOrderIds: [],
        motivo,
      },
    };
  }
}

async function safeLogIgnorado(
  dealId: string,
  motivo:
    | 'ignorado_checklist_incompleto'
    | 'ignorado_campos_incompletos'
    | 'ignorado_customer_not_mapped',
  payload: unknown,
  ctx: { pipeline: Pipeline; erro: string; gatilho: 'disparo_1' | 'disparo_2' },
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    await logIgnorado(dealId, motivo, payload, { pipeline: ctx.pipeline, erro: ctx.erro });
  } catch (err) {
    log.error({ err, gatilho: ctx.gatilho }, 'log_ignorado_failed');
  }
}

async function safeNotifyGestor(text: string, log: FastifyBaseLogger): Promise<void> {
  try {
    const env = loadEnv();
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID_GESTOR_CS) {
      log.warn('telegram_not_configured');
      return;
    }
    const telegram = new TelegramNotifier();
    await telegram.notifyGestor(text, { parseMode: 'Markdown' });
  } catch (err) {
    log.error({ err }, 'telegram_notify_failed');
  }
}

/** YYYY-MM-DD no fuso America/Sao_Paulo. */
function today(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}
