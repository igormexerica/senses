import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import pino from 'pino';
import { FieldSession, createRecurrence } from './field-automation.js';
import { RecurrenceJobSchema, type RecurrenceJob } from './types.js';

const QUEUE_NAME = 'field-recurrences';
const MAX_ATTEMPTS = 3; // 1 inicial + 2 retries
const BACKOFF_MS = 5_000; // exponencial: 5s, 30s (3×5×2² ≈ 60s; ajustamos manual abaixo)

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'senses-playwright-worker' },
});

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

async function main(): Promise<void> {
  const redisUrl = requireEnv('REDIS_URL');
  const fieldLoginEmail = requireEnv('FIELD_LOGIN_EMAIL');
  const fieldLoginPassword = requireEnv('FIELD_LOGIN_PASSWORD');
  const headless = (process.env.PLAYWRIGHT_HEADLESS ?? 'true').toLowerCase() !== 'false';

  const connection: ConnectionOptions = parseRedisUrl(redisUrl);

  const session = new FieldSession({
    fieldLoginEmail,
    fieldLoginPassword,
    headless,
    logger,
  });

  const worker = new Worker<RecurrenceJob>(
    QUEUE_NAME,
    async (job: Job<RecurrenceJob>) => {
      const jobLog = logger.child({
        jobId: job.id ?? 'unknown',
        attempt: job.attemptsMade + 1,
        maxAttempts: MAX_ATTEMPTS,
      });
      jobLog.info('job_received');

      const parsed = RecurrenceJobSchema.parse(job.data);
      const page = await session.ensureReady();
      try {
        const result = await createRecurrence(page, parsed, jobLog);
        return result;
      } finally {
        await page.close().catch(() => undefined);
      }
    },
    {
      connection,
      concurrency: 1, // 1 Playwright por vez (semáforo natural)
    },
  );

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'job_completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id ?? 'unknown',
        attemptsMade: job?.attemptsMade ?? 0,
        err: err.message,
        screenshotPath: (err as Error & { screenshotPath?: string }).screenshotPath,
      },
      'job_failed',
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutdown_initiated');
    await worker.close();
    await session.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  logger.info({ queue: QUEUE_NAME, concurrency: 1, headless }, 'worker_started');

  // Mantém referência pra evitar GC enquanto BullMQ não emite mais nada
  void MAX_ATTEMPTS;
  void BACKOFF_MS;
}

function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(parsed.username ? { username: parsed.username } : {}),
  };
}

main().catch((err) => {
  logger.error({ err }, 'worker_fatal');
  process.exit(1);
});
