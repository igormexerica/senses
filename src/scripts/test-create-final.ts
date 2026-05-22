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
  description: 'TESTE_API_FINAL - status scheduled',
  customer: { id: 'MjcyMjk4MTo1MjAyNQ==' },
  service: { id: 'MTI0NjYxOjUyMDI1' },
  external: { id: 'TEST_DEAL_FINAL_001' },
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
      status: 'scheduled',
      position: 1,
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

console.log('=== POST /orders (final) ===');
console.log('Payload:', JSON.stringify(payload, null, 2));

try {
  const r = await client.post('/orders', payload);
  console.log('\n✓', r.status);
  console.log('OS criada:');
  console.log(JSON.stringify(r.data, null, 2));
  console.log('\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
  console.log('AGORA VAI NO PAINEL DO FIELD E VERIFICA:');
  console.log('1. Procura por descrição "TESTE_API_FINAL" no calendário em 15/06/2026');
  console.log('2. Confirma se aparece');
  console.log('ID base64:', r.data.id);
  console.log('Identifier:', r.data.identifier);
  console.log('Link:', r.data.link);
  console.log('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
} catch (err: any) {
  console.error('\n✗', err.response?.status);
  console.error(JSON.stringify(err.response?.data, null, 2));
}
