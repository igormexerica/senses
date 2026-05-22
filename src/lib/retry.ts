export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  onAttempt?: (attempt: number, err: unknown) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8_000;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      opts.onAttempt?.(i, err);
      if (i === attempts || !shouldRetry(err)) throw err;
      const delay = Math.min(base * 2 ** (i - 1), max);
      const jitter = Math.floor(Math.random() * 200);
      await sleep(delay + jitter);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultShouldRetry(err: unknown): boolean {
  // Retry on network errors and 5xx / 429
  const e = err as { code?: string; response?: { status?: number } };
  if (e?.code && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(e.code)) return true;
  const status = e?.response?.status;
  if (typeof status === 'number' && (status >= 500 || status === 429)) return true;
  return false;
}
