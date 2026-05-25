import type { FastifyBaseLogger } from 'fastify';
import { listCustomersPage } from './field-control.js';
import type { FieldCustomer } from './field-control.js';
import { normalizeDocument } from './document.js';
import {
  upsertFieldCustomerMapping,
  type UpsertMappingRow,
} from './supabase.js';

const PAGE_LIMIT = 100;
const INTER_PAGE_DELAY_MS = 800; // ~75 req/min observado; 800ms = ~75 req/min
const FLUSH_BATCH_SIZE = 100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface SyncOptions {
  triggeredBy?: 'cron' | 'manual';
  logger?: FastifyBaseLogger;
  /** Override pra testes (default: listCustomersPage). */
  fetchPage?: (offset: number, limit: number) => Promise<FieldCustomer[]>;
  /** Override pra testes (default: upsertFieldCustomerMapping). */
  upsertFn?: (rows: UpsertMappingRow[]) => Promise<{ upserted: number; skipped: number }>;
  /** Override pra testes (default: 800ms). */
  interPageDelayMs?: number;
}

export interface SyncResult {
  totalScanned: number;
  totalUpserted: number;
  totalSkippedNoDocument: number;
  totalSkippedInvalidFormat: number;
  durationMs: number;
}

interface NullLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

const nullLogger: NullLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Pagina o catálogo completo de /customers do Field, normaliza CNPJ/CPF e
 * upserta no field_customer_mapping. Disparado pelo cron interno e pelo
 * endpoint manual POST /api/v1/sync-customers.
 *
 * Robustez: pausa entre páginas pra respeitar rate limit (~75 req/min),
 * batch upsert de 100, contadores de skip pra customers sem documento ou
 * com formato suspeito.
 */
export async function syncFieldCustomers(opts: SyncOptions = {}): Promise<SyncResult> {
  const log = opts.logger ?? nullLogger;
  const triggeredBy = opts.triggeredBy ?? 'manual';
  const fetchPage = opts.fetchPage ?? listCustomersPage;
  const upsertFn = opts.upsertFn ?? upsertFieldCustomerMapping;
  const interPageDelayMs = opts.interPageDelayMs ?? INTER_PAGE_DELAY_MS;

  const startedAt = Date.now();
  log.info({ triggeredBy }, 'sync_started');

  let offset = 0;
  let totalScanned = 0;
  let totalUpserted = 0;
  let totalSkippedNoDocument = 0;
  let totalSkippedInvalidFormat = 0;
  let pageNumber = 0;
  let buffer: UpsertMappingRow[] = [];

  while (true) {
    pageNumber++;
    const page = await fetchPage(offset, PAGE_LIMIT);
    if (page.length === 0) {
      log.info({ pageNumber, offset }, 'sync_no_more_pages');
      break;
    }
    totalScanned += page.length;

    for (const c of page) {
      const doc = c.documentNumber;
      if (typeof doc !== 'string' || doc.trim() === '') {
        totalSkippedNoDocument++;
        continue;
      }
      const normalized = normalizeDocument(doc);
      if (normalized === null) {
        totalSkippedInvalidFormat++;
        log.warn({ customerId: c.id, doc }, 'sync_invalid_document_format');
        continue;
      }
      buffer.push({
        documentNumber: normalized,
        fieldCustomerId: c.id,
        customerName: c.name ?? null,
        primaryLocationId: c.primaryLocation?.id ?? null,
      });
    }

    if (buffer.length >= FLUSH_BATCH_SIZE) {
      const res = await upsertFn(buffer);
      totalUpserted += res.upserted;
      buffer = [];
    }

    if (page.length < PAGE_LIMIT) {
      log.info({ pageNumber, pageLen: page.length }, 'sync_last_partial_page');
      break;
    }

    offset += PAGE_LIMIT;
    if (interPageDelayMs > 0) await sleep(interPageDelayMs);
  }

  if (buffer.length > 0) {
    const res = await upsertFn(buffer);
    totalUpserted += res.upserted;
  }

  const durationMs = Date.now() - startedAt;
  const result: SyncResult = {
    totalScanned,
    totalUpserted,
    totalSkippedNoDocument,
    totalSkippedInvalidFormat,
    durationMs,
  };
  log.info({ ...result, triggeredBy }, 'sync_completed');
  return result;
}
