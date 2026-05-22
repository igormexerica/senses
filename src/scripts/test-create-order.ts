import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: {
    'X-Api-Key': env.FIELD_CONTROL_API_KEY,
    'Content-Type': 'application/json;charset=UTF-8',
  },
});

const COORDS = { latitude: -22.421893, longitude: -47.560274 };

const payload = {
  description: 'TESTE_API_SCHEMA_005 - apagar depois',
  customer: { id: 'MjcyMjk4MTo1MjAyNQ==' },
  service: { id: 'MTI0NjYxOjUyMDI1' },
  external: { id: 'TEST_DEAL_SCHEMA_005' },
  address: {
    zipCode: '13501090',
    street: 'Rua 8 CJ',
    number: '35',
    neighborhood: null,
    complement: null,
    city: 'Rio Claro',
    state: 'São Paulo',
    coords: COORDS,
  },
  tasks: [
    {
      status: 'pending',
      duration: 30,
      coords: COORDS,
      scheduling: {
        type: 'scheduled-date',
        date: '2026-06-15',
        time: null,
      },
    },
  ],
};

console.log('=== POST /orders ===');
console.log('Payload:', JSON.stringify(payload, null, 2));

try {
  const r = await client.post('/orders', payload);
  console.log('\n✓', r.status);
  console.log('OS criada:');
  console.log(JSON.stringify(r.data, null, 2));
  console.log('\n⚠️  Apagar/arquivar OS no painel. ID:', r.data.id);
} catch (err: any) {
  console.error('\n✗', err.response?.status);
  console.error(JSON.stringify(err.response?.data, null, 2));
}
