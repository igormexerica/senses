/**
 * Smoke test do webhook Clint. Dispara um payload mock contra a rota e
 * imprime status + corpo. Variações por env var TEST_SCENARIO:
 *   - missing-secret   → sem X-Webhook-Secret (espera 401)
 *   - bad-secret       → secret errado        (espera 403)
 *   - wrong-stage      → stage != Boas-Vindas (espera 200 ignorado_etapa_errada)
 *   - checklist-incomp → checklist com done=false (espera 200 ignorado_checklist_incompleto)
 *   - missing-fields   → custom_fields incompletos (espera 200 ignorado_campos_incompletos)
 *   - lookup-cnpj      → sem field_customer_id, CNPJ mapeado (env CNPJ_MAPPED)
 *                        → espera customer_lookup via mapping_table
 *   - unmapped-cnpj    → sem field_customer_id, CNPJ aleatório
 *                        → espera 200 ignorado_customer_not_mapped
 *   - happy (default)  → payload completo com IDs DUMMY (vai falhar no Field
 *                        ou no Supabase — ok pra MVP, só queremos confirmar que
 *                        passa por todos os gates).
 *
 * Uso:
 *   tsx src/scripts/test-webhook.ts
 *   TEST_SCENARIO=wrong-stage tsx src/scripts/test-webhook.ts
 *   WEBHOOK_URL=https://senses-api.ifops.com.br tsx src/scripts/test-webhook.ts
 */
import 'dotenv/config';
import axios from 'axios';

const BASE = process.env.WEBHOOK_URL ?? 'http://localhost:3000';
const SECRET = process.env.WEBHOOK_SECRET ?? '';
const SCENARIO = process.env.TEST_SCENARIO ?? 'happy';
const PIPELINE = process.env.PIPELINE ?? 'onboarding-remoto';

const URL = `${BASE}/api/v1/webhook/clint/${PIPELINE}`;

interface Payload {
  deal: {
    id: string;
    stage: string;
    custom_fields: Record<string, string | undefined>;
    checklist: { item: string; done: boolean }[];
  };
  contact: { name: string; email: string; phone: string };
  triggered_by: { user_id: string; user_email: string };
  triggered_at: string;
}

function buildHappyPayload(): Payload {
  return {
    deal: {
      id: `deal_mock_${Date.now()}`,
      stage: 'Boas-Vindas',
      custom_fields: {
        cnpj: '12345678000190',
        cliente_nome_razao: 'Cliente Teste S/A',
        contrato_inicio: '2026-06-01',
        contrato_fim: '2027-06-01',
        endereco_completo: 'Rua Mock, 123 - Rio Claro/SP',
        telefone_contato: '+5519999999999',
        email_contato: 'mock@cliente.com',
        tecnico_padrao_id: 'tech_mock_id',
        field_customer_id: 'MOCK_CUSTOMER_ID_VAI_FALHAR_NO_FIELD',
      },
      checklist: [
        { item: 'Boas-vindas enviadas', done: true },
        { item: 'Contrato assinado anexado', done: true },
        { item: 'Cliente cadastrado no sistema', done: true },
      ],
    },
    contact: { name: 'João da Silva', email: 'joao@empresa.com', phone: '+5519999999999' },
    triggered_by: { user_id: 'user_mock', user_email: 'cs-mock@senses.com.br' },
    triggered_at: new Date().toISOString(),
  };
}

function buildPayload(scenario: string): Payload {
  const p = buildHappyPayload();
  switch (scenario) {
    case 'wrong-stage':
      p.deal.stage = 'OutraEtapa';
      return p;
    case 'checklist-incomp':
      p.deal.checklist[0]!.done = false;
      return p;
    case 'missing-fields':
      p.deal.custom_fields.cnpj = '';
      p.deal.custom_fields.cliente_nome_razao = '';
      return p;
    case 'lookup-cnpj':
      delete p.deal.custom_fields.field_customer_id;
      p.deal.custom_fields.cnpj = process.env.CNPJ_MAPPED ?? '12345678000190';
      return p;
    case 'unmapped-cnpj':
      delete p.deal.custom_fields.field_customer_id;
      p.deal.custom_fields.cnpj = '99887766554433'; // improvável de existir
      return p;
    default:
      return p;
  }
}

async function main(): Promise<void> {
  const payload = buildPayload(SCENARIO);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (SCENARIO === 'missing-secret') {
    // omit
  } else if (SCENARIO === 'bad-secret') {
    headers['X-Webhook-Secret'] = 'totalmente-errado';
  } else {
    if (!SECRET) {
      console.error('WEBHOOK_SECRET ausente no env. Configure .env ou exporte WEBHOOK_SECRET=...');
      process.exit(1);
    }
    headers['X-Webhook-Secret'] = SECRET;
  }

  console.log(`POST ${URL}`);
  console.log(`scenario: ${SCENARIO}, header: ${SCENARIO.includes('secret') ? SCENARIO : 'X-Webhook-Secret=<set>'}`);

  try {
    const res = await axios.post(URL, payload, {
      headers,
      timeout: 30_000,
      validateStatus: () => true,
    });
    console.log(`HTTP ${res.status}`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    const e = err as Error;
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}

main();
