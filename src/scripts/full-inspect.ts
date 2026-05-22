import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
});

const orderId = 'MDAwMDFkNjEtNjQ5ZC00ZGNmLTliMjMtOTkyNzIwZmY4YTdkOjUyMDI1';
const uuid = '00001d61-649d-4dcf-9b23-992720ff8a7d';

const tries = [
  `/orders/${orderId}`,
  `/orders/${orderId}/tasks`,
  `/orders/${uuid}/tasks`,
  `/tasks?orderId=${orderId}`,
  `/tasks?orderId=${uuid}`,
  `/tasks?order=${orderId}`,
  `/orders/${orderId}/activities`,
  `/orders/${orderId}/scheduling`,
  `/orders/${orderId}/schedule`,
];

for (const path of tries) {
  console.log(`\n=== GET ${path} ===`);
  try {
    const r = await client.get(path);
    console.log('✓', r.status);
    console.log(JSON.stringify(r.data, null, 2).slice(0, 2500));
  } catch (err: any) {
    console.log('✗', err.response?.status, JSON.stringify(err.response?.data || err.message).slice(0, 150));
  }
}

// Também tenta puxar tasks gerais e filtrar
console.log('\n=== GET /tasks?limit=3 (estrutura completa) ===');
try {
  const r = await client.get('/tasks', { params: { limit: 3 } });
  console.log(JSON.stringify(r.data, null, 2).slice(0, 3000));
} catch (err: any) {
  console.log('✗', err.response?.status, err.response?.data || err.message);
}
