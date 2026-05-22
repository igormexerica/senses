import { loadEnv } from '../lib/env.js';
import axios from 'axios';

const env = loadEnv();
const client = axios.create({
  baseURL: 'https://carchost.fieldcontrol.com.br',
  headers: { 'X-Api-Key': env.FIELD_CONTROL_API_KEY },
});

const target = process.argv[2] || 'BJK2Q0AJFG';
const startOffset = parseInt(process.argv[3] || '0', 10);
const DELAY_MS = 800; // 800ms entre requests = ~75 req/min, respeitoso

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

console.log(`Varrendo /orders procurando identifier=${target} (delay ${DELAY_MS}ms entre páginas)`);
console.log(`Iniciando do offset=${startOffset}\n`);

let offset = startOffset;
const pageSize = 100;
let total = 0;
const startTs = Date.now();

for (let page = 0; page < 300; page++) {
  try {
    const r = await client.get('/orders', { params: { limit: pageSize, offset } });
    const items = r.data.items || [];
    if (items.length === 0) {
      console.log(`Página ${page+1}: vazio. Total escaneadas nesta execução: ${total}. Não achei.`);
      break;
    }
    total += items.length;

    const match = items.find((o: any) => o.identifier === target);
    if (match) {
      const secs = ((Date.now() - startTs) / 1000).toFixed(1);
      console.log(`\n✓ ACHEI na página ${page+1} (offset ${offset}, ${secs}s):\n`);
      console.log(JSON.stringify(match, null, 2));

      // Pega tasks também
      console.log(`\n--- tasks dessa OS ---`);
      await sleep(DELAY_MS);
      try {
        const t = await client.get(`/orders/${match.id}/tasks`);
        console.log(JSON.stringify(t.data, null, 2));
      } catch (e: any) { console.log('erro tasks:', e.response?.status); }

      process.exit(0);
    }

    if (page % 5 === 0) {
      console.log(`  pg ${page+1} | offset ${offset} | total nesta execução: ${total}`);
    }

    offset += pageSize;
    await sleep(DELAY_MS);
  } catch (err: any) {
    if (err.response?.status === 429) {
      const waitSec = 30;
      console.log(`  ⚠️  Rate limit (429) na pg ${page+1}, offset ${offset}. Aguardando ${waitSec}s...`);
      await sleep(waitSec * 1000);
      // não incrementa offset, refaz a página
      page--;
      continue;
    }
    console.log(`Erro pg ${page+1}:`, err.response?.status, err.response?.data);
    console.log(`\nÚltimo offset bem-sucedido: ${offset - pageSize}`);
    console.log(`Pra continuar: npx tsx src/scripts/scan-for-identifier.ts ${target} ${offset}`);
    break;
  }
}
