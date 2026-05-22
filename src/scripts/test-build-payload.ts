/**
 * Demonstra `buildOrderPayload` montando um payload válido sem chamar POST.
 *
 * Faz 2 GETs (customer + locations) e imprime o payload pronto pra createOrder.
 * Cliente alvo: Filipe Cortez (id MjcyMjk4MTo1MjAyNQ==), service Remoto, data 2026-07-01.
 *
 * Uso: `npx tsx src/scripts/test-build-payload.ts`
 */
import { buildOrderPayload, FIELD_SERVICE_IDS } from '../lib/field-control.js';

const FILIPE_CORTEZ_ID = 'MjcyMjk4MTo1MjAyNQ==';

async function main(): Promise<void> {
  console.log('=== buildOrderPayload — dry run (NO POST) ===\n');
  console.log('Input:');
  console.log({
    clintDealId: 'TEST_BUILD_PAYLOAD_001',
    customerId: FILIPE_CORTEZ_ID,
    serviceId: FIELD_SERVICE_IDS.REMOTO_ENVIO_RECARGA,
    description: 'TESTE_BUILD_PAYLOAD - Filipe Cortez, refil remoto',
    scheduledDate: '2026-07-01',
    duration: 30,
  });
  console.log('\nResolvendo customer + primaryLocation via 2 GETs...\n');

  const payload = await buildOrderPayload({
    clintDealId: 'TEST_BUILD_PAYLOAD_001',
    customerId: FILIPE_CORTEZ_ID,
    serviceId: FIELD_SERVICE_IDS.REMOTO_ENVIO_RECARGA,
    description: 'TESTE_BUILD_PAYLOAD - Filipe Cortez, refil remoto',
    scheduledDate: '2026-07-01',
    duration: 30,
  });

  console.log('Payload montado:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('NÃO chamei POST /orders. Pra criar de verdade, passar');
  console.log('esse payload pra `createOrder(payload)`.');
  console.log('──────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('\n[ERRO]', err instanceof Error ? `${err.name}: ${err.message}` : err);
  if (err && typeof err === 'object' && 'body' in err) {
    console.error('body:', JSON.stringify((err as { body: unknown }).body, null, 2));
  }
  process.exitCode = 1;
});
