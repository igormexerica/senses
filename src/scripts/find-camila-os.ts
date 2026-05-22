import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
});

// 1. Tenta filtros de busca de cliente (igual fizemos com /orders)
console.log('=== Tentando filtros nativos em /customers ===');
const filterTries = [
  '/customers?name=Camila',
  '/customers?q=Camila',
  '/customers?search=Camila',
  '/customers?filter[name]=Camila',
];

let camila: any = null;
for (const path of filterTries) {
  try {
    const r = await client.get(path);
    const items = r.data.items || [];
    const found = items.filter((c: any) => c.name?.toLowerCase().includes('camila'));
    console.log(`  ${path} → ${items.length} items, ${found.length} com "camila"`);
    if (found.length > 0 && !camila) {
      camila = found[found.length - 1];
      console.log(`  ✓ Achei via ${path}`);
    }
  } catch (err: any) {
    console.log(`  ✗ ${path}: ${err.response?.status}`);
  }
}

// 2. Se não achou via filter, paginação completa
if (!camila) {
  console.log('\n=== Paginando /customers até achar ===');
  let offset = 0;
  const pageSize = 100;
  let total = 0;

  for (let page = 0; page < 500; page++) {
    try {
      const r = await client.get('/customers', { params: { limit: pageSize, offset } });
      const items = r.data.items || [];
      if (items.length === 0) break;
      total += items.length;

      const matches = items.filter((c: any) => c.name?.toLowerCase().includes('camila'));
      if (matches.length > 0) {
        console.log(`\n✓ Achei ${matches.length} resultado(s) na página ${page+1} (offset ${offset}):`);
        matches.forEach((m: any) =>
          console.log(`  ${m.id} | ${m.name} | createdAt=${m.createdAt}`)
        );
        camila = matches[matches.length - 1];
        break;
      }

      if (page % 10 === 0) {
        console.log(`  Página ${page+1}: ${total} clientes escaneados...`);
      }

      offset += pageSize;
    } catch (err: any) {
      console.log(`  Página ${page+1}: erro ${err.response?.status}`);
      break;
    }
  }

  if (!camila) {
    console.log(`\n✗ Não achei "Camila" em ${total} clientes escaneados`);
  }
}

// 3. Se achou Camila, lista OSs dela
if (camila) {
  console.log(`\n=== OSs do cliente ${camila.name} (${camila.id}) ===`);
  const orders = await client.get('/orders', {
    params: { customerId: camila.id, limit: 20 }
  });

  console.log(`Total: ${orders.data.totalCount}\n`);
  orders.data.items?.forEach((o: any) =>
    console.log(`  id: ${o.id}\n  identifier: ${o.identifier}\n  createdAt: ${o.createdAt}\n  description: ${(o.description||'').slice(0,60)}\n`)
  );
}
