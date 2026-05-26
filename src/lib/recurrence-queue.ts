import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv } from './env.js';
import { FIELD_SERVICE_NAMES } from './field-control.js';
import type { Pipeline } from './types.js';

const QUEUE_NAME = 'field-recurrences';

export interface EnqueueRecurrenceInput {
  dealId: string;
  pipeline: Pipeline;
  fieldCustomerName: string;
  fieldCustomerId: string;
  serviceTypeName: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  frequencyUnit: 'days' | 'weeks' | 'months';
  frequencyValue: number;
  skipWeekends: boolean;
}

export interface BuildRecurrenceInput {
  dealId: string;
  pipeline: Pipeline;
  fieldCustomerName: string;
  fieldCustomerId: string;
  /** YYYY-MM-DD. Caller decide (default: HOJE no TZ São Paulo). */
  startsAt: string;
}

/**
 * Constrói o payload do job a partir do contexto do webhook. Centraliza
 * as regras "remoto = bimestral, presencial = mensal, skipWeekends
 * sempre, serviceTypeName mapeado por pipeline" num lugar testável.
 */
export function buildRecurrenceJob(input: BuildRecurrenceInput): EnqueueRecurrenceInput {
  const isRemoto = input.pipeline === 'onboarding_remoto';
  return {
    dealId: input.dealId,
    pipeline: input.pipeline,
    fieldCustomerName: input.fieldCustomerName,
    fieldCustomerId: input.fieldCustomerId,
    serviceTypeName: isRemoto
      ? FIELD_SERVICE_NAMES.REMOTO_ENVIO_RECARGA
      : FIELD_SERVICE_NAMES.PRESENCIAL_MANUTENCAO,
    description: `[${input.pipeline}] Recorrência gerada via webhook Clint (saída Definição de Fragrância)`,
    startsAt: input.startsAt,
    endsAt: null,
    frequencyUnit: 'months',
    frequencyValue: isRemoto ? 2 : 1,
    skipWeekends: true,
  };
}

let _queue: Queue | null = null;
let _connection: Redis | null = null;

function getQueue(): Queue {
  if (_queue) return _queue;
  const env = loadEnv();
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL ausente — necessário pra enfileirar recorrências.');
  }
  _connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  _queue = new Queue(QUEUE_NAME, { connection: _connection });
  return _queue;
}

/**
 * Enfileira criação de Recorrência no Field via worker Playwright.
 * jobId = dealId pra dedup natural na fila (BullMQ rejeita duplicado).
 *
 * Retries com backoff exponencial: 1ª retry após 5s, 2ª após 30s.
 * Falha definitiva após attempt 3 → worker grava screenshot + Telegram.
 */
export async function enqueueRecurrence(input: EnqueueRecurrenceInput): Promise<string> {
  const queue = getQueue();
  const job = await queue.add('create-recurrence', input, {
    jobId: input.dealId, // idempotência natural via BullMQ
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  });
  return job.id ?? input.dealId;
}

export async function closeQueueConnection(): Promise<void> {
  if (_queue) await _queue.close();
  if (_connection) await _connection.quit();
  _queue = null;
  _connection = null;
}
