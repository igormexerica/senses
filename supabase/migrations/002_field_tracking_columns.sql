-- Adiciona colunas para rastreabilidade dos IDs do Field Control
-- Justificativa: a API do Field Control não suporta filtros (customerId,
-- externalId, identifier são ignorados silenciosamente), portanto a
-- idempotência e o rastreamento OS↔deal vivem no Supabase.

ALTER TABLE os_geracao_log
  ADD COLUMN IF NOT EXISTS field_order_id text,
  ADD COLUMN IF NOT EXISTS field_customer_id text;

CREATE INDEX IF NOT EXISTS ix_log_field_order
  ON os_geracao_log (field_order_id);

CREATE INDEX IF NOT EXISTS ix_log_field_customer
  ON os_geracao_log (field_customer_id);

COMMENT ON COLUMN os_geracao_log.field_order_id IS
  'ID base64 da OS criada no Field Control (retornado pelo POST /orders)';

COMMENT ON COLUMN os_geracao_log.field_customer_id IS
  'ID base64 do customer no Field Control (lookup via primaryLocation)';
