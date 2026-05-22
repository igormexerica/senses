import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const r = await axios.get('https://carchost.fieldcontrol.com.br/orders', {
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
  params: { limit: 20 }
});

console.log('Total de OSs retornadas:', r.data.items.length);
console.log('TotalCount no response:', r.data.totalCount);
console.log('\nLista (ordem retornada pela API):');
r.data.items.forEach((o: any, i: number) =>
  console.log(`${i+1}.`, o.id, '|', o.createdAt, '|', o.identifier, '|', (o.description || '').slice(0, 40))
);
