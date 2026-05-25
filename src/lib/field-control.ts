/**
 * Field Control API client.
 *
 * Base: https://carchost.fieldcontrol.com.br (sem prefixo de versão)
 * Auth: header `X-Api-Key`
 *
 * ──────────────────────────────────────────────────────────────────────
 * LIMITAÇÕES CONHECIDAS (descobertas via engenharia reversa 2026-05-22)
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. **GET /orders ignora silenciosamente todos os filtros testados**
 *    (customerId, externalId, identifier, sort, sortBy, q, search, filter[*]).
 *    Apenas `limit` e `offset` funcionam. CONSEQUÊNCIA: idempotência via Field
 *    é IMPOSSÍVEL — sempre verificar duplicidade via Supabase
 *    (tabela `os_geracao_log` com unique index em `clint_deal_id` WHERE
 *    status='success').
 *
 * 2. **Rate limit ~75 req/min** sem header documentando. Atingido o limite,
 *    a API retorna 429. Aguardar ~30s e tentar de novo (withRetry trata).
 *
 * 3. **DELETE e PATCH /orders/{id} retornam 404.** OS criada não pode ser
 *    arquivada/deletada via API — só manualmente no painel.
 *
 * 4. **POST /orders aceita payload completo com `tasks` aninhadas.**
 *    `status: 'scheduled'` é obrigatório pra aparecer no calendário do app;
 *    `'pending'` fica oculto. `coords` é obrigatório no address E em cada task.
 */
import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { loadEnv } from './env.js';
import { withRetry } from './retry.js';

const BASE_URL = 'https://carchost.fieldcontrol.com.br';
const DEFAULT_TASK_DURATION_MIN = 30;

// ─────────────────────────────────────────────────────────────
// Constantes públicas
// ─────────────────────────────────────────────────────────────

/** Service IDs confirmados pra mapeamento por pipeline (Senses, 2026-05-22). */
export const FIELD_SERVICE_IDS = {
  /** ENVIO MENSAL DE RECARGA — usado pelo Onboarding Remoto. */
  REMOTO_ENVIO_RECARGA: 'MTI0NjYxOjUyMDI1',
  /** MANUTENÇÃO MENSAL — usado pelo Onboarding Presencial. */
  PRESENCIAL_MANUTENCAO: 'MTIyNTk0OjUyMDI1',
} as const;

// ─────────────────────────────────────────────────────────────
// Tipos — confirmados via engenharia reversa
// ─────────────────────────────────────────────────────────────

export interface FieldCoords {
  latitude: number;
  longitude: number;
}

/**
 * ATENÇÃO: o nome do campo de CEP diverge entre endpoints da Field:
 * - GET /customers/{id}            → retorna `zipCode`
 * - GET /customers/{id}/locations  → retorna `postalCode`
 * - POST /orders                   → espera `zipCode`
 *
 * `FieldAddress` aceita ambos; `buildOrderPayload` normaliza pra `zipCode`
 * antes de enviar ao POST.
 */
export interface FieldAddress {
  zipCode?: string | null;
  postalCode?: string | null;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  complement: string | null;
  city: string;
  state: string;
  coords: FieldCoords;
  formattedAddress?: string;
}

export interface FieldLocation {
  id: string;
  name?: string | null;
  notes?: string | null;
  archived: boolean;
  customer: { id: string };
  address: FieldAddress;
}

export interface FieldCustomer {
  id: string;
  name: string;
  code: string | null;
  documentNumber: string | null;
  archived: boolean;
  createdAt: string;
  external: { id: string | null };
  contact: { email: string | null; phone: string | null };
  address: FieldAddress;
  primaryLocation: { id: string } | null;
  notes?: string | null;
  statistics?: Record<string, unknown>;
}

export interface FieldTaskScheduling {
  type: 'scheduled-date' | string;
  date: string; // 'YYYY-MM-DD'
  time: string | null; // 'HH:mm' ou null
}

export type FieldTaskStatus = 'scheduled' | 'pending' | 'done' | string;

export interface FieldTask {
  id: string;
  status: FieldTaskStatus;
  position: number;
  duration: number;
  coords: FieldCoords;
  scheduling: FieldTaskScheduling;
  employee?: { id?: string };
  order: { id: string };
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface FieldOrder {
  id: string;
  link: string;
  identifier: string;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  external: { id: string | null };
  customer: { id: string };
  service: { id: string };
  location: { id: string };
  address: FieldAddress;
  ticket: { id: string } | null;
  metadata?: Record<string, unknown>;
}

/** Item de task dentro do CreateOrderPayload. */
export interface CreateOrderTask {
  status: 'scheduled';
  position: number;
  duration: number;
  coords: FieldCoords;
  scheduling: FieldTaskScheduling;
}

/** Payload exato enviado ao POST /orders (validado: retorna 201). */
export interface CreateOrderPayload {
  description: string | null;
  customer: { id: string };
  service: { id: string };
  external: { id: string | null };
  address: FieldAddress;
  tasks: CreateOrderTask[];
}

/** Input simplificado pro `buildOrderPayload` (resolve customer+location). */
export interface CreateOrderInput {
  clintDealId: string;
  customerId: string;
  serviceId: string;
  description?: string;
  scheduledDate: string; // 'YYYY-MM-DD'
  duration?: number;     // minutos, default 30
}

// ─────────────────────────────────────────────────────────────
// Erros customizados
// ─────────────────────────────────────────────────────────────

export class FieldApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'FieldApiError';
  }
}

export class FieldValidationError extends FieldApiError {
  constructor(
    message: string,
    body: unknown,
    public readonly errors: unknown[],
  ) {
    super(422, message, body);
    this.name = 'FieldValidationError';
  }
}

export class FieldAuthError extends FieldApiError {
  constructor(status: 401 | 403, body: unknown) {
    super(status, `Field API auth error (HTTP ${status})`, body);
    this.name = 'FieldAuthError';
  }
}

export class FieldNotFoundError extends FieldApiError {
  constructor(message: string, body: unknown) {
    super(404, message, body);
    this.name = 'FieldNotFoundError';
  }
}

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
      'Content-Type': 'application/json;charset=UTF-8',
    },
    timeout: 10_000,
  });
  return _client;
}

// ─────────────────────────────────────────────────────────────
// Operations
// ─────────────────────────────────────────────────────────────

export async function getCustomer(id: string): Promise<FieldCustomer> {
  try {
    const res = await withRetry(() =>
      fieldClient().get<FieldCustomer>(`/customers/${encodeURIComponent(id)}`),
    );
    return res.data;
  } catch (err) {
    throw remapFieldError(err);
  }
}

export async function getCustomerLocations(customerId: string): Promise<FieldLocation[]> {
  try {
    const res = await withRetry(() =>
      fieldClient().get<unknown>(`/customers/${encodeURIComponent(customerId)}/locations`),
    );
    return unwrapList<FieldLocation>(res.data);
  } catch (err) {
    throw remapFieldError(err);
  }
}

/**
 * Pagina /customers. Field ignora filtros — só limit/offset funciona.
 * Sem ordering garantido pela API (testado 2026-05-22). Caller responsável
 * por chamar até a página vir vazia (ou menor que `limit`).
 */
export async function listCustomersPage(
  offset: number,
  limit: number,
): Promise<FieldCustomer[]> {
  try {
    const res = await withRetry(() =>
      fieldClient().get<unknown>('/customers', { params: { limit, offset } }),
    );
    return unwrapList<FieldCustomer>(res.data);
  } catch (err) {
    throw remapFieldError(err);
  }
}

export async function getOrder(id: string): Promise<FieldOrder> {
  try {
    const res = await withRetry(() =>
      fieldClient().get<FieldOrder>(`/orders/${encodeURIComponent(id)}`),
    );
    return res.data;
  } catch (err) {
    throw remapFieldError(err);
  }
}

export async function getOrderTasks(orderId: string): Promise<FieldTask[]> {
  try {
    const res = await withRetry(() =>
      fieldClient().get<unknown>(`/orders/${encodeURIComponent(orderId)}/tasks`),
    );
    return unwrapList<FieldTask>(res.data);
  } catch (err) {
    throw remapFieldError(err);
  }
}

/**
 * Cria OS via POST /orders. Espera HTTP 201.
 * - 422 → FieldValidationError com errors[]
 * - 401/403 → FieldAuthError (sem retry)
 * - 5xx/429/network → withRetry
 *
 * Idempotência: NÃO é garantida pela Field — verificar duplicidade no Supabase
 * antes de chamar (vide nota no topo do arquivo).
 */
export async function createOrder(payload: CreateOrderPayload): Promise<FieldOrder> {
  try {
    const res = await withRetry(
      () => fieldClient().post<FieldOrder>('/orders', payload),
      { shouldRetry: shouldRetryRespectingClientErrors },
    );
    if (res.status !== 201) {
      throw new FieldApiError(
        res.status,
        `POST /orders esperava 201, recebeu ${res.status}`,
        res.data,
      );
    }
    return res.data;
  } catch (err) {
    throw remapFieldError(err);
  }
}

// ─────────────────────────────────────────────────────────────
// buildOrderPayload — input simplificado → payload pronto pro POST
// ─────────────────────────────────────────────────────────────

/**
 * Resolve customer + primaryLocation pra extrair address + coords, e monta o
 * payload completo pronto pra `createOrder`. Faz 2 GETs (customer + locations).
 */
export async function buildOrderPayload(input: CreateOrderInput): Promise<CreateOrderPayload> {
  const customer = await getCustomer(input.customerId);
  const primaryId = customer.primaryLocation?.id;
  if (!primaryId) {
    throw new FieldApiError(0, `Customer ${input.customerId} não tem primaryLocation`);
  }

  const locations = await getCustomerLocations(input.customerId);
  const primary = locations.find((l) => l.id === primaryId);
  if (!primary) {
    throw new FieldApiError(
      0,
      `Customer ${input.customerId}: primaryLocation ${primaryId} não está na lista de locations`,
    );
  }

  const address = normalizeAddressForOrder(primary.address);
  return {
    description: input.description ?? null,
    customer: { id: input.customerId },
    service: { id: input.serviceId },
    external: { id: input.clintDealId },
    address,
    tasks: [
      {
        status: 'scheduled',
        position: 1,
        duration: input.duration ?? DEFAULT_TASK_DURATION_MIN,
        coords: address.coords,
        scheduling: {
          type: 'scheduled-date',
          date: input.scheduledDate,
          time: null,
        },
      },
    ],
  };
}

/**
 * Normaliza o address pro formato que POST /orders espera:
 * - Mapeia `postalCode` (vindo de /locations) → `zipCode`.
 * - Remove `postalCode` e `formattedAddress` do payload final.
 */
function normalizeAddressForOrder(addr: FieldAddress): FieldAddress {
  const { postalCode, formattedAddress, ...rest } = addr;
  return {
    ...rest,
    zipCode: addr.zipCode ?? postalCode ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

function unwrapList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    for (const key of ['items', 'data', 'results', 'records']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

/** Como o default, mas não retenta erros do cliente (401/403/404/422). */
function shouldRetryRespectingClientErrors(err: unknown): boolean {
  const ax = err as AxiosError;
  const status = ax.response?.status;
  if (status === 401 || status === 403 || status === 404 || status === 422) return false;
  if (ax.code && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(ax.code)) {
    return true;
  }
  if (typeof status === 'number' && (status >= 500 || status === 429)) return true;
  return false;
}

function remapFieldError(err: unknown): Error {
  if (err instanceof FieldApiError) return err;
  if (!(err instanceof Error)) return new Error(String(err));
  if (!('isAxiosError' in err)) return err;

  const ax = err as AxiosError<unknown>;
  const status = ax.response?.status;
  const body = ax.response?.data;

  if (status === 401 || status === 403) return new FieldAuthError(status, body);
  if (status === 404) return new FieldNotFoundError(`Field 404: ${ax.config?.url ?? 'unknown URL'}`, body);
  if (status === 422) {
    const errors = extractErrors(body);
    const msg =
      errors.length > 0
        ? `Field 422: ${errors.map(formatErrorEntry).join('; ')}`
        : 'Field 422: validation error (no errors[] in body)';
    return new FieldValidationError(msg, body, errors);
  }
  if (typeof status === 'number') return new FieldApiError(status, ax.message, body);
  return err;
}

function extractErrors(body: unknown): unknown[] {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.errors)) return obj.errors;
  }
  return [];
}

function formatErrorEntry(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    const field = obj.field ?? obj.path ?? obj.key ?? '';
    const msg = obj.message ?? obj.msg ?? obj.error ?? JSON.stringify(obj);
    return field ? `${String(field)}: ${String(msg)}` : String(msg);
  }
  return String(e);
}
