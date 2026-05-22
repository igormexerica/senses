import { createClient } from '@supabase/supabase-js';
import { loadEnv } from '../lib/env.js';

const env = loadEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// Insere um log de teste com os novos campos
const testRecord = {
  pipeline: 'onboarding_remoto',
  clint_deal_id: `VERIFY_SCHEMA_${Date.now()}`,
  cliente_cnpj: '00000000000000',
  cliente_nome: 'TESTE_SCHEMA',
  field_client_id: 'TEST_FIELD_CLIENT',
  field_order_id: 'TEST_FIELD_ORDER',
  field_customer_id: 'TEST_FIELD_CUSTOMER',
  contrato_inicio: '2026-05-22',
  contrato_fim: '2027-05-22',
  tipo_os: 'envio_refil',
  os_field_ids: [],
  datas_geradas: [],
  total_os: 0,
  disparado_por: 'verify-schema',
  status: 'failed',
};

console.log('Tentando inserir registro com novas colunas...');
const { data, error } = await sb.from('os_geracao_log').insert(testRecord).select();

if (error) {
  console.error('✗ Falha:', error);
  process.exit(1);
}

console.log('✓ Inserção bem-sucedida. Colunas presentes:');
console.log('  field_order_id:', data[0].field_order_id);
console.log('  field_customer_id:', data[0].field_customer_id);

// Limpa
await sb.from('os_geracao_log').delete().eq('id', data[0].id);
console.log('✓ Registro de teste deletado');
console.log('\n✅ Schema OK com as novas colunas.');
