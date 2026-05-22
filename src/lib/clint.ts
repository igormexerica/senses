import axios, { type AxiosInstance } from 'axios';
import { loadEnv } from './env.js';
import { withRetry } from './retry.js';

export class ClintClient {
  private readonly http: AxiosInstance;

  constructor(opts: { baseUrl?: string; apiKey?: string } = {}) {
    const env = loadEnv();
    const baseURL = opts.baseUrl ?? env.CLINT_API_BASE;
    const apiKey = opts.apiKey ?? env.CLINT_API_KEY;
    this.http = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      timeout: 15_000,
    });
  }

  /** Add a tag to a deal (e.g. "OS_gerada_OK" or "OS_falha_geracao"). */
  async addDealTag(dealId: string, tag: string): Promise<void> {
    await withRetry(() => this.http.post(`/deals/${dealId}/tags`, { tag }));
  }

  /**
   * Update one or more custom fields on a deal.
   * Used after success to write back `os_field_ids_geradas` and `disparo_status`.
   */
  async updateDealCustomFields(dealId: string, fields: Record<string, unknown>): Promise<void> {
    await withRetry(() => this.http.patch(`/deals/${dealId}`, { custom_fields: fields }));
  }
}
