import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
});

const testExternalIds = [
  'TEST_DEAL_SCHEMA_005',
];

for (const extId of testExternalIds) {
  console.log(`\n--- Buscando OS com external.id = ${extId} ---`);
  try {
    const r = await client.get('/orders', { params: { externalId: extId } });
    const items = r.data.items || [];
    if (items.length === 0) {
      console.log('Nenhuma OS encontrada');
      continue;
    }
    for (const os of items) {
      console.log(`Encontrado: ${os.id} (${os.description})`);
      try {
        const del = await client.delete(`/orders/${os.id}`);
        console.log(`  ✓ Deletada (${del.status})`);
      } catch (e: any) {
        console.log(`  ✗ DELETE falhou (${e.response?.status}). Tentando arquivar...`);
        try {
          const arch = await client.patch(`/orders/${os.id}`, { archived: true });
          console.log(`  ✓ Arquivada (${arch.status})`);
        } catch (e2: any) {
          console.log(`  ✗ Arquivar falhou também:`, e2.response?.status, e2.response?.data);
        }
      }
    }
  } catch (err: any) {
    console.log('✗', err.response?.status, err.response?.data);
  }
}
