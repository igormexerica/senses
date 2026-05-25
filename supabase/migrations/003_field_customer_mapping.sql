-- ─────────────────────────────────────────────────────────────────────────
-- Mapping table: CNPJ/CPF normalizado → field_customer_id
--
-- Plano B do design 2026-05-25: a API do Field Control NÃO suporta filtros
-- (descoberto na engenharia reversa de 2026-05-22 — customerId, externalId,
-- identifier são todos ignorados silenciosamente). Sem busca server-side
-- por documento, paginamos o catálogo completo (~1259 customers) e cacheamos
-- aqui.
--
-- Populada por:
--   - cron interno hora-em-hora (minuto 5) no microserviço
--   - endpoint manual POST /api/v1/sync-customers (X-Api-Key)
--
-- Consumida pelo webhook Clint: resolver CNPJ vindo da Clint → field_customer_id
-- antes de chamar runCreateOrders.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_customer_mapping (
  document_number text PRIMARY KEY,
  field_customer_id text NOT NULL,
  customer_name text,
  primary_location_id text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fcm_field_customer_id
  ON field_customer_mapping (field_customer_id);

CREATE INDEX IF NOT EXISTS ix_fcm_last_synced_at
  ON field_customer_mapping (last_synced_at);

COMMENT ON TABLE field_customer_mapping IS
  'Mapping CNPJ/CPF normalizado → field_customer_id (Plano B do design 2026-05-25). Populada via cron de sync e endpoint manual.';

COMMENT ON COLUMN field_customer_mapping.document_number IS
  'CNPJ ou CPF apenas com dígitos (sem máscara). PK garante unique por documento.';

COMMENT ON COLUMN field_customer_mapping.field_customer_id IS
  'ID base64 do customer no Field Control (formato MTI0NjYxOjUyMDI1).';

COMMENT ON COLUMN field_customer_mapping.primary_location_id IS
  'ID da primaryLocation do customer no Field — usado pra resolver endereço/coords da OS sem chamar GET /customers/{id} de novo.';
