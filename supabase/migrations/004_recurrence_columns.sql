-- ─────────────────────────────────────────────────────────────────────────
-- Migration 004 — colunas pra rastrear o novo fluxo de 2 disparos
--
-- Contexto (decisão 2026-05-26): Field Control NÃO expõe Recorrências via
-- REST (confirmado pelo suporte). Agora temos 2 disparos do webhook Clint:
--   - DISPARO #1 (saída Checklist Comercial): cria 1 OS "envio inicial"
--     com data=HOJE via REST /orders (caminho atual, idempotente via log).
--   - DISPARO #2 (saída Definição de Fragrância): cria 1 Recorrência via
--     Playwright (worker BullMQ + senses-playwright-worker). Enfileira e
--     retorna 200 imediato pra Clint não retentar.
--
-- Coluna `gatilho` distingue os dois disparos nos logs de auditoria.
-- Coluna `field_recurrence_id` é opcional (preenchida se o worker
-- conseguir extrair o ID da URL pós-submit do Field).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE os_geracao_log
  ADD COLUMN IF NOT EXISTS gatilho text,
  ADD COLUMN IF NOT EXISTS field_recurrence_id text;

CREATE INDEX IF NOT EXISTS ix_log_gatilho
  ON os_geracao_log (gatilho);

CREATE INDEX IF NOT EXISTS ix_log_field_recurrence_id
  ON os_geracao_log (field_recurrence_id);

COMMENT ON COLUMN os_geracao_log.gatilho IS
  'Origem do disparo: ''disparo_1'' (Checklist Comercial → OS inicial) ou ''disparo_2'' (Definição de Fragrância → Recorrência Playwright).';

COMMENT ON COLUMN os_geracao_log.field_recurrence_id IS
  'ID da Recorrência no Field Control (extraído da URL pós-submit pelo worker Playwright). Pode ficar null se a URL não tiver formato parseável.';

-- Status já está como `text` sem CHECK constraint (migration 001), então
-- novos valores ('queued_recurrence', 'recurrence_created', 'failed_playwright')
-- são aceitos sem DDL adicional. Sincronizar enum TS em src/lib/supabase.ts.
