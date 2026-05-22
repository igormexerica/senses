import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
});

const testId = 'ZjI0MGM3ZjQtZTE5Ny00NzAyLThmNjItMmJkMWM5MzhkOWE4OjUyMDI1';

console.log('\n=== GET direto na OS de teste ===');
try {
  const r = await client.get(`/orders/${testId}`);
  console.log('✓ EXISTE no Field. Status:', r.status);
  console.log('Identifier:', r.data.identifier);
  console.log('Description:', r.data.description);
  console.log('External.id:', r.data.external?.id);
  console.log('Archived:', r.data.archived);
  console.log('Customer ID:', r.data.customer?.id);
  console.log('Tasks:', r.data.tasks?.length);
  console.log('Link:', r.data.link);
} catch (err: any) {
  console.log('✗', err.response?.status);
  console.log(JSON.stringify(err.response?.data, null, 2));
}

console.log('\n=== Lista OSs do cliente Filipe Cortez ===');
try {
  const r = await client.get('/orders', {
    params: { customerId: 'MjcyMjk4MTo1MjAyNQ==', limit: 10 }
  });
  console.log(`Total no cliente: ${r.data.totalCount}`);
  r.data.items?.forEach((o: any) =>
    console.log(`   • ${o.identifier} | ext=${o.external?.id ?? '-'} | ${(o.description||'').slice(0,50)}`)
  );
} catch (err: any) {
  console.log('✗', err.response?.status, err.response?.data);
}
