import { describe, expect, it, vi } from 'vitest';
import { syncFieldCustomers } from '../src/lib/field-customer-sync.js';
import type { FieldCustomer } from '../src/lib/field-control.js';

function buildCustomer(i: number, overrides: Partial<FieldCustomer> = {}): FieldCustomer {
  return {
    id: `cust_${i}`,
    name: `Cliente ${i}`,
    code: null,
    documentNumber: `1234567800${String(i).padStart(4, '0')}`, // 14 digits CNPJ
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
    external: { id: null },
    contact: { email: null, phone: null },
    address: {
      zipCode: null,
      street: null,
      number: null,
      neighborhood: null,
      complement: null,
      city: 'X',
      state: 'SP',
      coords: { latitude: 0, longitude: 0 },
    },
    primaryLocation: { id: `loc_${i}` },
    ...overrides,
  };
}

describe('syncFieldCustomers', () => {
  it('pagina, normaliza e contabiliza tudo (250 customers, 3 páginas)', async () => {
    const customers: FieldCustomer[] = [];
    for (let i = 1; i <= 247; i++) customers.push(buildCustomer(i));
    // 2 sem documento (vão pra skippedNoDocument)
    customers.push(buildCustomer(248, { documentNumber: null }));
    customers.push(buildCustomer(249, { documentNumber: '' }));
    // 1 com formato inválido (vai pra skippedInvalidFormat)
    customers.push(buildCustomer(250, { documentNumber: '12345' }));

    const fetchPage = vi.fn(async (offset: number, limit: number): Promise<FieldCustomer[]> => {
      return customers.slice(offset, offset + limit);
    });

    const upsertFn = vi.fn(
      async (rows: Array<unknown>): Promise<{ upserted: number; skipped: number }> => {
        return { upserted: rows.length, skipped: 0 };
      },
    );

    const result = await syncFieldCustomers({
      triggeredBy: 'manual',
      fetchPage,
      upsertFn,
      interPageDelayMs: 0, // sem pausa pro teste
    });

    expect(result.totalScanned).toBe(250);
    expect(result.totalUpserted).toBe(247);
    expect(result.totalSkippedNoDocument).toBe(2);
    expect(result.totalSkippedInvalidFormat).toBe(1);
    // 3 páginas: 100 + 100 + 50, mas a última (50<100) encerra o loop sem
    // chamar a 4ª. Então fetchPage foi chamado 3 vezes.
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 100, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 200, 100);
  });

  it('respeita interPageDelayMs entre páginas', async () => {
    const customers: FieldCustomer[] = [];
    for (let i = 1; i <= 200; i++) customers.push(buildCustomer(i));

    const fetchPage = vi.fn(async (offset: number, limit: number): Promise<FieldCustomer[]> => {
      return customers.slice(offset, offset + limit);
    });
    const upsertFn = vi.fn(async () => ({ upserted: 0, skipped: 0 }));

    const start = Date.now();
    await syncFieldCustomers({
      fetchPage,
      upsertFn,
      interPageDelayMs: 50, // 50ms entre páginas
    });
    const elapsed = Date.now() - start;

    // 200 customers, página 100 → 2 páginas inteiras + 1 vazia. Pausa só
    // depois de páginas cheias, então ~50ms apenas entre página 1 e 2.
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(500);
  });

  it('encerra ao receber página vazia', async () => {
    const fetchPage = vi.fn(async (): Promise<FieldCustomer[]> => []);
    const upsertFn = vi.fn(async () => ({ upserted: 0, skipped: 0 }));

    const result = await syncFieldCustomers({
      fetchPage,
      upsertFn,
      interPageDelayMs: 0,
    });

    expect(result.totalScanned).toBe(0);
    expect(result.totalUpserted).toBe(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(upsertFn).not.toHaveBeenCalled();
  });
});
