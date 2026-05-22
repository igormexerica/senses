import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
});

const customerId = 'MjcyMjk4MTo1MjAyNQ==';

const tries = [
  '/locations?limit=3',
  `/customers/${customerId}/locations`,
  `/customers/${customerId}`,
];

for (const path of tries) {
  console.log(`\n=== GET ${path} ===`);
  try {
    const r = await client.get(path);
    console.log('✓', r.status);
    console.log(JSON.stringify(r.data, null, 2).slice(0, 1500));
  } catch (err: any) {
    console.log('✗', err.response?.status, JSON.stringify(err.response?.data).slice(0, 200));
  }
}
