import type { FastifyInstance } from 'fastify';
import cron, { type ScheduledTask } from 'node-cron';
import { syncFieldCustomers } from '../lib/field-customer-sync.js';

/**
 * Cron interno: dispara syncFieldCustomers hora-em-hora no minuto 5.
 * Minuto 5 evita bater com horários redondos comuns (jobs de terceiros,
 * picos em :00). Primeiro disparo só após o próximo :05 — não dispara no
 * startup.
 *
 * Erros do job são capturados e logados como warning (não derrubam o
 * cron — o próximo tick tenta de novo). Caller deve guardar a referência
 * retornada pra parar no shutdown.
 */
const SYNC_CRON_EXPR = '5 * * * *';

export interface CronHandle {
  stopAll: () => void;
}

export function registerCronJobs(app: FastifyInstance): CronHandle {
  const tasks: ScheduledTask[] = [];

  const syncTask = cron.schedule(
    SYNC_CRON_EXPR,
    async () => {
      app.log.info({ cron: 'field_customer_sync' }, 'cron_tick');
      try {
        const result = await syncFieldCustomers({
          triggeredBy: 'cron',
          logger: app.log,
        });
        app.log.info(result, 'cron_sync_succeeded');
      } catch (err) {
        app.log.warn({ err }, 'cron_sync_failed');
      }
    },
    { timezone: 'America/Sao_Paulo' },
  );
  tasks.push(syncTask);

  app.log.info(
    { cron: 'field_customer_sync', expr: SYNC_CRON_EXPR, tz: 'America/Sao_Paulo' },
    'cron_initialized',
  );

  return {
    stopAll: () => {
      for (const t of tasks) t.stop();
    },
  };
}
