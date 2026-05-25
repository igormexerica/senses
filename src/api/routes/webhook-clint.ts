import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { TelegramNotifier } from '../../lib/telegram.js';
import { loadEnv } from '../../lib/env.js';
import { findFieldCustomerByDocument, logIgnorado } from '../../lib/supabase.js';
import type { Pipeline } from '../../lib/types.js';
import type { CreateOrdersRequest } from '../schemas/create.js';
import {
  EXPECTED_STAGE,
  WebhookClintPayloadSchema,
  findMissingFields,
  type WebhookClintPayload,
  type WebhookResponse,
} from '../schemas/webhook-clint.js';
import { runCreateOrders } from './create.js';

/**
 * Rotas que recebem o webhook OUT da Clint quando um deal entra na etapa
 * "Boas-Vindas". Stage e checklist são o gate: se passarem, dispara a
 * criação real de OS via runCreateOrders (chamada in-process, sem ciclo HTTP).
 *
 * SEMPRE retorna 200 (exceto 400 em payload mal-formado) — pra Clint não
 * retentar. Os ramos "ignorado_*" ficam registrados no Supabase via
 * logIgnorado pra auditoria.
 */
export async function webhookClintRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/webhook/clint/onboarding-remoto', async (req, reply) => {
    return handleWebhook(req.body, 'onboarding_remoto', req.log, reply);
  });

  app.post('/api/v1/webhook/clint/onboarding-presencial', async (req, reply) => {
    return handleWebhook(req.body, 'onboarding_presencial', req.log, reply);
  });
}

async function handleWebhook(
  rawBody: unknown,
  pipeline: Pipeline,
  parentLog: FastifyBaseLogger,
  reply: import('fastify').FastifyReply,
): Promise<WebhookResponse> {
  // a. Schema validation
  const parsed = WebhookClintPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    parentLog.warn({ issues: parsed.error.issues }, 'webhook_invalid_payload');
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
  const log = parentLog.child({ clint_deal_id: payload.deal.id, pipeline });

  // b. Stage
  if (payload.deal.stage !== EXPECTED_STAGE) {
    log.info({ stageRecebido: payload.deal.stage }, 'webhook_ignored_wrong_stage');
    return {
      clintDealId: payload.deal.id,
      pipeline,
      outcome: { status: 'ignorado_etapa_errada', stageRecebido: payload.deal.stage },
    };
  }

  // c. Checklist
  const itensFaltando = payload.deal.checklist.filter((i) => !i.done).map((i) => i.item);
  if (itensFaltando.length > 0 || payload.deal.checklist.length === 0) {
    log.info({ itensFaltando }, 'webhook_ignored_checklist_incompleto');
    await safeLogIgnorado(payload.deal.id, 'ignorado_checklist_incompleto', payload, {
      pipeline,
      erro: `Itens faltando: ${itensFaltando.join(', ') || '(checklist vazio)'}`,
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

  // d. Custom fields obrigatórios
  const camposFaltando = findMissingFields(payload.deal.custom_fields);
  if (camposFaltando.length > 0) {
    log.warn({ camposFaltando }, 'webhook_ignored_campos_incompletos');
    await safeLogIgnorado(payload.deal.id, 'ignorado_campos_incompletos', payload, {
      pipeline,
      erro: `Campos faltando: ${camposFaltando.join(', ')}`,
    }, log);
    await safeNotifyGestor(
      `⚠️ Webhook ${pipeline} ignorado — campos faltando no deal *${payload.deal.id}*: ${camposFaltando.join(', ')}`,
      log,
    );
    return {
      clintDealId: payload.deal.id,
      pipeline,
      outcome: { status: 'ignorado_campos_incompletos', camposFaltando },
    };
  }

  // e. Resolver customerId: usa fallback manual do payload, ou lookup via CNPJ
  const cf = payload.deal.custom_fields;
  const cnpj = cf.cnpj as string;
  let customerId: string;
  if (typeof cf.field_customer_id === 'string' && cf.field_customer_id.trim() !== '') {
    customerId = cf.field_customer_id.trim();
    log.info({ source: 'payload_fallback' }, 'customer_lookup');
  } else {
    const mapping = await findFieldCustomerByDocument(cnpj);
    if (mapping === null) {
      log.warn({ cnpj }, 'customer_not_mapped');
      await safeLogIgnorado(payload.deal.id, 'ignorado_customer_not_mapped', payload, {
        pipeline,
        erro: `CNPJ ${cnpj} não mapeado em field_customer_mapping — re-sync manual via POST /api/v1/sync-customers`,
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
    log.info(
      { source: 'mapping_table', fieldCustomerId: customerId, lastSyncedAt: mapping.lastSyncedAt },
      'customer_lookup',
    );
  }

  const createBody: CreateOrdersRequest = {
    clintDealId: payload.deal.id,
    customerId,
    pipeline,
    contratoInicio: cf.contrato_inicio as string,
    contratoFim: cf.contrato_fim as string,
    cnpj,
    clienteNome: cf.cliente_nome_razao as string,
    disparadoPor: payload.triggered_by.user_email,
  };

  const { response, httpStatus } = await runCreateOrders(createBody, log);
  if (httpStatus !== 200) reply.code(httpStatus);

  // Map CreateOrdersResponse → WebhookOutcome
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
  // failed
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

async function safeLogIgnorado(
  dealId: string,
  motivo:
    | 'ignorado_checklist_incompleto'
    | 'ignorado_campos_incompletos'
    | 'ignorado_customer_not_mapped',
  payload: unknown,
  ctx: { pipeline: Pipeline; erro: string },
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    await logIgnorado(dealId, motivo, payload, ctx);
  } catch (err) {
    log.error({ err }, 'log_ignorado_failed');
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
