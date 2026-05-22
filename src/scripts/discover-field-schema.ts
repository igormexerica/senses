/**
 * Reconhecimento da API real do Field Control.
 *
 * APENAS GETs — não cria nem altera nada na conta.
 *
 * Uso: `npm run discover-schema`
 *
 * Pré-requisito: `.env` com `FIELD_CONTROL_API_KEY` válida.
 * Para /service-orders retornar algo, cadastre 1 OS manualmente antes.
 */
import axios, { type AxiosResponse } from 'axios';
import { fieldClient } from '../lib/field-control.js';

const SEP = '═'.repeat(72);
const SUB = '─'.repeat(72);
const ALWAYS_SHOW_HEADERS = ['content-type', 'date', 'retry-after', 'x-request-id'];

interface Probe {
  label: string;
  path: string;
  params?: Record<string, string | number>;
  maxItems: number;
  hint?: string;
}

const probes: Probe[] = [
  {
    label: 'Customers (amostra)',
    path: '/customers',
    params: { limit: 3 },
    maxItems: 3,
    hint: 'Confirme: nome real do campo de documento (document | cnpj | cpf_cnpj) e estrutura de endereço (locations?).',
  },
  {
    label: 'Orders (amostra)',
    path: '/orders',
    params: { limit: 3 },
    maxItems: 3,
    hint: 'Confirme: nomes reais de customer_id, service_id, scheduled_date, employee_id, status. Precisa ter ≥1 OS na conta.',
  },
  {
    label: 'Services (tipos de OS / serviços oferecidos)',
    path: '/services',
    maxItems: 20,
    hint: 'Catálogo de serviços da empresa. Vai precisar dos IDs pra criar OS (campo `type` ou `service_id`).',
  },
  {
    label: 'Employees (colaboradores / técnicos)',
    path: '/employees',
    maxItems: 30,
    hint: 'Lista de técnicos. Vai precisar dos IDs pra responsible_id / employee_id.',
  },
  {
    label: 'Labels (etiquetas / tags)',
    path: '/labels',
    maxItems: 30,
    hint: 'Etiquetas disponíveis. Vai precisar pra marcar OS com "onboarding_remoto", "recorrencia_automatica", etc.',
  },
];

async function probe(p: Probe): Promise<void> {
  const qs = p.params ? '?' + buildQs(p.params) : '';
  console.log('\n' + SEP);
  console.log(`▶ ${p.label}`);
  console.log(`  GET ${p.path}${qs}`);
  if (p.hint) console.log(`  ${p.hint}`);
  console.log(SEP);

  let res: AxiosResponse<unknown>;
  try {
    res = await fieldClient().get<unknown>(p.path, {
      params: p.params,
      validateStatus: () => true, // queremos ver 4xx sem throw
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.log(`  ✗ erro de rede: ${err.message} (code=${err.code ?? '-'})`);
    } else {
      console.log('  ✗ erro inesperado:', err);
    }
    return;
  }

  console.log(`  status: ${res.status} ${res.statusText}`);
  printHeaders(res.headers);

  if (res.status >= 400) {
    console.log('\n  ── corpo do erro ──');
    console.log(indent(JSON.stringify(res.data, null, 2)));
    if (res.status === 404) {
      console.log('\n  → endpoint não existe nessa conta. Veja o "hint" acima e tente o nome alternativo.');
    } else if (res.status === 401 || res.status === 403) {
      console.log('\n  → API key inválida ou sem permissão pra esse recurso.');
    } else if (res.status === 429) {
      console.log('\n  → rate limit. Aguarde e rode de novo.');
    }
    return;
  }

  const items = extractItems(res.data);
  console.log(`  itens retornados: ${items.length}`);

  if (items.length === 0) {
    console.log('\n  → lista vazia. Cadastre pelo menos 1 item no painel Field e rode de novo.');
    if (!Array.isArray(res.data)) {
      console.log('\n  ── estrutura da resposta (top-level keys) ──');
      console.log(indent(JSON.stringify(topLevelKeys(res.data), null, 2)));
    }
    return;
  }

  const shown = items.slice(0, p.maxItems);
  shown.forEach((item, i) => {
    console.log(`\n  ${SUB}`);
    console.log(`  item ${i + 1}/${shown.length}`);
    console.log(`  ${SUB}`);
    console.log(indent(JSON.stringify(item, null, 2)));
  });

  if (items.length > shown.length) {
    console.log(`\n  (${items.length - shown.length} item(s) adicionais — não mostrados)`);
  }
}

function buildQs(params: Record<string, string | number>): string {
  const entries: [string, string][] = Object.entries(params).map(([k, v]) => [k, String(v)]);
  return new URLSearchParams(entries).toString();
}

function printHeaders(headers: unknown): void {
  const h = headers as Record<string, string | string[] | undefined>;
  for (const name of ALWAYS_SHOW_HEADERS) {
    const v = h[name];
    if (v !== undefined) console.log(`  header ${name}: ${stringifyHeader(v)}`);
  }
  for (const [name, value] of Object.entries(h)) {
    if (value === undefined) continue;
    if (name.toLowerCase().startsWith('x-ratelimit')) {
      console.log(`  header ${name}: ${stringifyHeader(value)}`);
    }
  }
}

function stringifyHeader(v: string | string[]): string {
  return Array.isArray(v) ? v.join(', ') : v;
}

function extractItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'records']) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function topLevelKeys(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object') return { _value: typeof body };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = Array.isArray(v) ? `array(len=${v.length})` : typeof v;
  }
  return out;
}

function indent(s: string): string {
  return s
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n');
}

async function main(): Promise<void> {
  console.log('Field Control — schema discovery');
  console.log('Base: https://api.fieldcontrol.com.br/v3');
  console.log('Mode: GET only — sem mutations\n');

  for (const p of probes) {
    await probe(p);
  }

  console.log('\n' + SEP);
  console.log('Discovery concluído.');
  console.log('Use a saída pra confirmar os nomes reais dos campos marcados como "VALIDAR"');
  console.log('em src/lib/field-control.ts.');
  console.log(SEP);
}

main().catch((err) => {
  console.error('\n[ERRO FATAL]', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
