import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
});

const identifier = process.argv[2] || 'BJK2Q0AJFG';

// Tenta com sort params
const tries = [
  '/orders?sort=-createdAt&limit=10',
  '/orders?sortBy=createdAt&order=desc&limit=10',
  '/orders?orderBy=createdAt&direction=desc&limit=10',
  '/orders?_sort=createdAt&_order=desc&limit=10',
];

for (const path of tries) {
  console.log(`\n--- ${path} ---`);
  try {
    const r = await client.get(path);
    const items = r.data.items || [];
    console.log(`Total items retornados: ${items.length}`);
    if (items.length > 0) {
      console.log(`Primeiro item createdAt: ${items[0].createdAt}`);
      const match = items.find((o: any) => o.identifier === identifier);
      if (match) {
        console.log('\n✓ ACHADA com esse sort:');
        console.log('  id:', match.id);
        console.log('  createdAt:', match.createdAt);
        console.log('  description:', match.description);
        process.exit(0);
      }
    }
  } catch (err: any) {
    console.log('✗', err.response?.status, err.response?.data?.message || 'erro');
  }
}

// Fallback: filtra por cliente Filipe (assumindo que você criou pra ele)
console.log('\n--- Listing por cliente Filipe Cortez (100 items) ---');
try {
  const r = await client.get('/orders', {
    params: { customerId: 'MjcyMjk4MTo1MjAyNQ==', limit: 100 }
  });
  const items = r.data.items || [];
  console.log(`Total no cliente: ${r.data.totalCount}, retornados: ${items.length}`);
  const match = items.find((o: any) => o.identifier === identifier);
  if (match) {
    console.log('\n✓ ACHADA:');
    console.log('  id:', match.id);
    console.log('  createdAt:', match.createdAt);
    console.log('  description:', match.description);
  } else {
    console.log('Não achou. Listando últimos 5 por createdAt:');
    const sorted = [...items].sort((a: any, b: any) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    sorted.slice(0, 5).forEach((o: any) =>
      console.log(`  ${o.createdAt} | ${o.identifier} | ${o.id}`)
    );
  }
} catch (err: any) {
  console.log('✗', err.response?.status, err.response?.data);
}
