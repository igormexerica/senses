-- =========================================================================
-- 04-pgcron.sql — Agendamento das funções SQL internas via pg_cron
-- Rode DEPOIS de 01, 02, 03 e de confirmar que pg_cron está disponível.
-- =========================================================================
-- O Supabase self-hosted já vem com pg_cron na imagem. Se não estiver
-- habilitado, este CREATE EXTENSION resolve.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_cron roda no database "postgres" por padrão. As funções estão no
-- schema field, então qualificamos o nome completo.

-- -------------------------------------------------------------------------
-- Job 1: Gerar expectativas — todo dia 1 do mês às 00:05
-- -------------------------------------------------------------------------
SELECT cron.schedule(
  'gerar-expectativas-mensal',
  '5 0 1 * *',                          -- min hora dia mês dia-semana
  $$SELECT field.gerar_expectativas_mes();$$
);

-- -------------------------------------------------------------------------
-- Job 2: Match expectativas <-> OS — de hora em hora, no minuto 15
-- (defasado dos syncs do Python que rodam no minuto 0/30)
-- -------------------------------------------------------------------------
SELECT cron.schedule(
  'match-expectativas-horario',
  '15 * * * *',
  $$SELECT field.match_expectativas_os();$$
);

-- -------------------------------------------------------------------------
-- Conferir os jobs agendados:
--   SELECT * FROM cron.job;
-- Ver histórico de execução:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- Remover um job (se precisar):
--   SELECT cron.unschedule('nome-do-job');
-- -------------------------------------------------------------------------

-- IMPORTANTE: a primeira geração de expectativas do mês corrente NÃO espera
-- o dia 1. Rode manualmente uma vez agora, após o primeiro sync de clientes:
--   SELECT * FROM field.gerar_expectativas_mes();
--   SELECT * FROM field.match_expectativas_os();
