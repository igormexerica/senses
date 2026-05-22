import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();

const baseUrls = [
  'https://carchost.fieldcontrol.com.br',
];

const endpoints = [
  '/customers',
  '/orders',
  '/employees',
  '/employees/tracking',
  '/services',
  '/products',
  '/materials',
  '/tasks',
  '/activities',
  '/teams',
  '/regions',
];

const headers = {
  'X-Api-Key': env.FIELD_CONTROL_API_KEY,
  'Content-Type': 'application/json;charset=UTF-8',
};

console.log('=== Probing Field Control API (carchost) ===\n');

for (const baseURL of baseUrls) {
  for (const endpoint of endpoints) {
    const url = `${baseURL}${endpoint}`;
    try {
      const r = await axios.get(url, { headers, timeout: 5000 });
      console.log(`✓ ${r.status} ${url}`);
      const sample = JSON.stringify(r.data).slice(0, 500);
      console.log(`  → ${sample}\n`);
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.response?.data || err.message;
      if (status === 401 || status === 403) {
        console.log(`! ${status} ${url} — ${JSON.stringify(msg)}`);
      } else if (status && status !== 404) {
        console.log(`? ${status} ${url} — ${JSON.stringify(msg).slice(0, 100)}`);
      }
    }
  }
}

console.log('\n=== Done ===');
