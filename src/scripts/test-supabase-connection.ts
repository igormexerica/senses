/**
 * Smoke test do Supabase.
 *
 * Pré-requisito: aplicar `supabase/migrations/001_os_geracao_log.sql` no
 * Supabase Dashboard → SQL Editor antes de rodar.
 *
 * Uso: `npx tsx src/scripts/test-supabase-connection.ts`
 */
import { insertLog, supabase, type OsLogEntry, type OsLogRow } from '../lib/supabase.js';

const TABLE = 'os_geracao_log';

async function main(): Promise<void> {
  console.log('--- test-supabase-connection ---');

  // 1) Conexão
  const { error: pingError } = await supabase.from(TABLE).select('id', { count: 'exact', head: true });
  if (pingError) {
    throw new Error(`conexão falhou: ${pingError.message} (hint: aplicou a migration?)`);
  }
  console.log('conexão OK');

  const dealId = `test_${Date.now()}`;
  const entry: OsLogEntry = {
    pipeline: 'onboarding_remoto',
    clint_deal_id: dealId,
    cliente_cnpj: '00000000000000',
    cliente_nome: 'SMOKE TEST — apagar',
    contrato_inicio: '2026-01-01',
    contrato_fim: '2027-01-01',
    tipo_os: 'envio_refil',
    datas_geradas: { test: true, generated_at: new Date().toISOString() },
    disparado_por: 'test-supabase-connection.ts',
    status: 'failed', // 'failed' não dispara unique index, seguro pra smoke test
    erro: 'smoke test placeholder',
  };

  // 2) Insert
  console.log(`[1/4] inserindo registro de teste (deal_id=${dealId}, status=failed)...`);
  await insertLog(entry);
  console.log('       OK — inserido.');

  // 3) Fetch
  console.log('[2/4] buscando o registro inserido...');
  const { data: fetched, error: fetchError } = await supabase
    .from(TABLE)
    .select('*')
    .eq('clint_deal_id', dealId)
    .single<OsLogRow>();
  if (fetchError) throw new Error(`fetch falhou: ${fetchError.message}`);
  if (!fetched) throw new Error('fetch retornou null inesperadamente');
  console.log(`       OK — id=${fetched.id}, status=${fetched.status}, cnpj=${fetched.cliente_cnpj}`);

  // 4) Confirmar campos chave
  console.log('[3/4] validando campos persistidos...');
  if (fetched.cliente_nome !== entry.cliente_nome) {
    throw new Error(`cliente_nome divergente: esperado "${entry.cliente_nome}", obtido "${fetched.cliente_nome}"`);
  }
  if (fetched.tipo_os !== entry.tipo_os) {
    throw new Error(`tipo_os divergente: esperado "${entry.tipo_os}", obtido "${fetched.tipo_os}"`);
  }
  console.log('       OK — campos batem.');

  // 5) Delete
  console.log('[4/4] deletando o registro de teste...');
  const { error: deleteError } = await supabase.from(TABLE).delete().eq('id', fetched.id);
  if (deleteError) throw new Error(`delete falhou: ${deleteError.message}`);
  console.log(`       OK — id=${fetched.id} removido.`);

  console.log('--- smoke test concluído com sucesso ---');
}

main().catch((err) => {
  console.error('\n[ERRO]', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
