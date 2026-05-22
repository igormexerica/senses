import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const uuid = '97218b75-68b8-4548-aa9d-8158add12e95';
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
});

const tries = [
  `/orders/${uuid}`,
  `/tasks/${uuid}`,
  `/orders?identifier=${uuid}`,
  `/orders?externalId=${uuid}`,
];

for (const path of tries) {
  console.log(`\n--- ${path} ---`);
  try {
    const r = await client.get(path);
    console.log('✓', r.status);
    console.log(JSON.stringify(r.data, null, 2).slice(0, 1500));
  } catch (err: any) {
    console.log('✗', err.response?.status, err.response?.data?.message || err.message);
  }
}
