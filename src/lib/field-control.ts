import axios, { type AxiosInstance } from 'axios';
import { loadEnv } from './env.js';
import { withRetry } from './retry.js';

// Base URL real conforme https://developers.fieldcontrol.com.br/ (a spec interna
// do projeto referenciava api.fieldcontrol.com.br/v3, que não existe).
const BASE_URL = 'https://carchost.fieldcontrol.com.br';

// ─────────────────────────────────────────────────────────────
// Tipos — confirmados via discover-schema 2026-05-22.
// IDs são opacos (formato base64), tratar como strings.
// ─────────────────────────────────────────────────────────────

export interface FieldAddress {
  zipCode?: string;
  street?: string;
  number?: string;
  neighborhood?: string | null;
  complement?: string | null;
  city: string;
  state: string;
  formattedAddress?: string;
  coords: {
    latitude: number;
    longitude: number;
  };
}

export interface FieldClient {
  id: string;
  name: string;
  code: string | null;
  notes: string | null;
  documentNumber: string | null;      // NÃO é `document` — é `documentNumber`
  primaryLocation: { id: string } | null;
  archived: boolean;
  createdAt: string;
  external: { id: string | null };
  contact: {
    email: string | null;
    phone: string | null;
  };
  address: FieldAddress;
  statistics?: Record<string, unknown>;
}

export interface FieldServiceOrder {
  id: string;
  link: string;
  archived: boolean;
  identifier: string;
  description: string;
  productsTotalValue: number;
  servicesTotalValue: number;
  totalValue: number;
  deadlineContract: string | null;    // possivelmente "prazo final" — investigar uso pra agendamento
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  external: { id: string | null };
  customer: { id: string };           // referência ao /customers/:id
  service: { id: string };            // referência ao /services/:id
  address: FieldAddress;
  ticket: { id: string } | null;
  location: { id: string };
  // ATENÇÃO: API GET não retorna scheduled_date nem employee_id/responsible nem
  // status nem labels. Esses ou (a) só existem no POST e ficam escondidos, ou
  // (b) precisam de endpoint diferente (não documentado publicamente).
  // Decisão pendente — ver bloco "PENDENTE" em CreateOSInput.
}

// ─────────────────────────────────────────────────────────────
// INPUTS — schemas baseados na doc oficial (POST /customers) e em
// inferência (POST /orders, doc truncada).
// ─────────────────────────────────────────────────────────────

export interface CreateClientInput {
  // Obrigatórios pela doc: name, address.city, address.state, address.coords.*
  name: string;
  code?: string;
  documentNumber?: string;
  notes?: string;
  external?: { id?: string };
  address: {
    zipCode?: string;
    street?: string;
    number?: string;
    neighborhood?: string;
    complement?: string;
    city: string;
    state: string;
    coords: {
      latitude: number;
      longitude: number;
    };
  };
}

export interface CreateOSInput {
  // PENDENTE: schema completo do POST /orders não está na doc pública.
  // Campos confirmados via GET: customer.id, service.id, description, address.
  // Campos especulados (a confirmar via POST de teste com cancelamento):
  //   - data agendada (talvez `scheduledDate` ou `deadlineContract`)
  //   - colaborador/técnico (talvez `employee.id` ou `assignedTo`)
  //   - tags/labels (talvez via POST /orders/:id/labels após criar)
  customer: { id: string };
  service: { id: string };
  description: string;
  address?: Partial<FieldAddress> & { city: string; state: string };
  external?: { id?: string };
  // VALIDAR: campos abaixo são especulação — confirmar com POST de teste
  scheduledDate?: string;             // VALIDAR
  employee?: { id: string };          // VALIDAR
}

export type UpdateOSInput = Partial<CreateOSInput> & {
  archived?: boolean;                 // VALIDAR — Field tem flag `archived`; cancelar pode ser archived=true
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
  // VALIDAR: formato real do filtro (pode ser ?document=, ?cnpj=, ?q=, etc).
  // Ajustar após discover-schema mostrar a resposta de /customers.
  const res = await withRetry(() =>
    fieldClient().get<unknown>('/customers', { params: { document: cnpj } }),
  );
  const items = unwrapList<FieldClient>(res.data);
  return items[0] ?? null;
}

export async function createClient(data: CreateClientInput): Promise<FieldClient> {
  const res = await withRetry(() => fieldClient().post<unknown>('/customers', data));
  return unwrapItem<FieldClient>(res.data);
}

export async function createServiceOrder(data: CreateOSInput): Promise<FieldServiceOrder> {
  const res = await withRetry(() => fieldClient().post<unknown>('/orders', data));
  return unwrapItem<FieldServiceOrder>(res.data);
}

export async function updateServiceOrder(id: string, patch: UpdateOSInput): Promise<FieldServiceOrder> {
  // Doc do Field usa PUT (não PATCH) pra updates.
  const res = await withRetry(() =>
    fieldClient().put<unknown>(`/orders/${encodeURIComponent(id)}`, patch),
  );
  return unwrapItem<FieldServiceOrder>(res.data);
}

export async function cancelServiceOrder(id: string): Promise<FieldServiceOrder> {
  // VALIDAR: Field não expõe `status` no GET. Cancelamento provavelmente é via
  // `archived: true` (flag presente no GET). Confirmar empiricamente.
  return updateServiceOrder(id, { archived: true });
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
