import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
});

console.log('Paginando todos os clientes com "camila" no nome...\n');

let offset = 0;
const pageSize = 100;
const todasCamilas: any[] = [];
let total = 0;

for (let page = 0; page < 500; page++) {
  try {
    const r = await client.get('/customers', { params: { limit: pageSize, offset } });
    const items = r.data.items || [];
    if (items.length === 0) {
      console.log(`Página ${page+1} vazia. Total escaneado: ${total}`);
      break;
    }
    total += items.length;

    const matches = items.filter((c: any) =>
      c.name?.toLowerCase().includes('camila') ||
      c.name?.toLowerCase().includes('soave')
    );

    matches.forEach((m: any) => {
      todasCamilas.push(m);
      console.log(`  [pg ${page+1}] ${m.id} | ${m.name} | archived=${m.archived}`);
    });

    if (page % 20 === 0 && page > 0) {
      console.log(`  --- ${total} escaneados ---`);
    }

    offset += pageSize;
  } catch (err: any) {
    console.log(`Erro página ${page+1}:`, err.response?.status);
    break;
  }
}

console.log(`\n=== RESULTADO ===`);
console.log(`Total escaneado: ${total}`);
console.log(`Clientes com "camila" ou "soave": ${todasCamilas.length}`);

if (todasCamilas.length === 0) {
  console.log('\n⚠️  Nada encontrado. Possibilidades:');
  console.log('  - Cadastro com outro nome (ex: razão social diferente)');
  console.log('  - Em outra conta do Field');
} else {
  // Lista as OSs de cada um
  for (const c of todasCamilas) {
    console.log(`\n--- OSs de "${c.name}" (id=${c.id}) ---`);
    try {
      const o = await client.get('/orders', { params: { customerId: c.id, limit: 5 } });
      const items = o.data.items || [];
      items.slice(0, 5).forEach((os: any) =>
        console.log(`  ${os.identifier} | ${os.createdAt} | ${(os.description||'').slice(0,50)}`)
      );
    } catch (e: any) {
      console.log('  erro:', e.response?.status);
    }
  }
}
