import axios, { type AxiosInstance } from 'axios';
import { loadEnv } from './env.js';
import { withRetry } from './retry.js';

const BASE_URL = 'https://api.fieldcontrol.com.br/v3';

// ─────────────────────────────────────────────────────────────
// Tipos — campos exatos dependem da conta. Marcações "VALIDAR"
// indicam pontos a confirmar pelo script `discover-schema`.
// ─────────────────────────────────────────────────────────────

export interface FieldClient {
  id: string;
  name: string;                       // VALIDAR: nome real do campo a confirmar
  document: string;                   // VALIDAR: pode ser 'document' | 'cnpj' | 'cpf_cnpj'
  phone?: string;
  email?: string;
  address?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;             // resto da estrutura — ver discover-schema
}

export interface FieldServiceOrder {
  id: string;
  client_id: string;                  // VALIDAR: pode ser 'client_id' | 'cliente_id'
  type?: string;                      // VALIDAR: pode ser 'type' | 'tipo' | 'tipo_os' | 'tipo_servico_id'
  scheduled_date?: string;            // VALIDAR: pode ser 'scheduled_date' | 'data_agendada' | 'data_inicio'
  responsible_id?: string;            // VALIDAR: pode ser 'responsible_id' | 'colaborador_id' | 'tecnico_id'
  status?: string;
  description?: string;
  tags?: string[];                    // VALIDAR: pode ser 'tags' | 'etiquetas' | array de IDs
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CreateClientInput {
  name: string;                       // VALIDAR
  document: string;                   // VALIDAR
  phone?: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    [key: string]: unknown;
  };
  custom_fields?: Record<string, unknown>;
}

export interface CreateOSInput {
  client_id: string;                  // VALIDAR
  type: string;                       // VALIDAR — nome do campo E formato (string vs ID)
  scheduled_date: string;             // VALIDAR — formato 'YYYY-MM-DD' ou ISO completo
  description: string;
  responsible_id: string;             // VALIDAR — nome do campo E se é ID do colaborador
  tags?: string[];                    // VALIDAR — pode ser nomes ou IDs de etiquetas
  custom_fields?: Record<string, unknown>;
}

export type UpdateOSInput = Partial<CreateOSInput> & {
  status?: string;                    // VALIDAR — valor real pra cancelar ('cancelado' | 'canceled' | 'cancelada')
};

// ─────────────────────────────────────────────────────────────
// Client factory (lazy)
// ─────────────────────────────────────────────────────────────

let _client: AxiosInstance | null = null;

export function fieldClient(): AxiosInstance {
  if (_client) return _client;
  const env = loadEnv();
  _client = axios.create({
    baseURL: BASE_URL,
    headers: {
      'X-Api-Key': env.FIELD_CONTROL_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 15_000,
  });
  return _client;
}

// ─────────────────────────────────────────────────────────────
// Operations — com retry (3 attempts, backoff exponencial)
// ─────────────────────────────────────────────────────────────

export async function getClientByDocument(cnpj: string): Promise<FieldClient | null> {
  const res = await withRetry(() =>
    fieldClient().get<unknown>('/clients', { params: { 'filter[document]': cnpj } }),
  );
  const items = unwrapList<FieldClient>(res.data);
  return items[0] ?? null;
}

export async function createClient(data: CreateClientInput): Promise<FieldClient> {
  const res = await withRetry(() => fieldClient().post<unknown>('/clients', data));
  return unwrapItem<FieldClient>(res.data);
}

export async function createServiceOrder(data: CreateOSInput): Promise<FieldServiceOrder> {
  const res = await withRetry(() => fieldClient().post<unknown>('/service-orders', data));
  return unwrapItem<FieldServiceOrder>(res.data);
}

export async function updateServiceOrder(id: string, patch: UpdateOSInput): Promise<FieldServiceOrder> {
  const res = await withRetry(() =>
    fieldClient().patch<unknown>(`/service-orders/${encodeURIComponent(id)}`, patch),
  );
  return unwrapItem<FieldServiceOrder>(res.data);
}

export async function cancelServiceOrder(id: string): Promise<FieldServiceOrder> {
  // VALIDAR: valor real do status de cancelamento na API
  return updateServiceOrder(id, { status: 'cancelado' });
}

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

function unwrapList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'records']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

function unwrapItem<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    const data = (body as { data: unknown }).data;
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as T;
  }
  return body as T;
}
