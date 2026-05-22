import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const osId = process.argv[2];

const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: {
    'X-Api-Key': env.FIELD_CONTROL_API_KEY,
    'Content-Type': 'application/json;charset=UTF-8',
  },
});

// 1. Tenta GET direto na OS específica
console.log('\n=== GET /orders/' + osId + ' ===');
try {
  const r = await client.get(`/orders/${osId}`);
  console.log(JSON.stringify(r.data, null, 2));
} catch (err: any) {
  console.error('Erro:', err.response?.status, err.response?.data || err.message);
}

// 2. Lista tasks dessa OS (estrutura comum em APIs com hierarquia)
console.log('\n=== GET /orders/' + osId + '/tasks ===');
try {
  const r = await client.get(`/orders/${osId}/tasks`);
  console.log(JSON.stringify(r.data, null, 2));
} catch (err: any) {
  console.error('Erro:', err.response?.status, err.response?.data || err.message);
}

// 3. Lista 1 task completa pra ver estrutura cheia
console.log('\n=== GET /tasks?limit=1 (amostra completa) ===');
try {
  const r = await client.get('/tasks', { params: { limit: 1 } });
  console.log(JSON.stringify(r.data, null, 2));
} catch (err: any) {
  console.error('Erro:', err.response?.status, err.response?.data || err.message);
}
