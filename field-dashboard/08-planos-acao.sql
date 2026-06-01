-- =========================================================================
-- Field Control Dashboard - Planos de Ação (CS marca ação sobre um gap)
-- Rode DEPOIS do 01-schema.sql. Idempotente.
-- =========================================================================
-- Cada gap (expectativa pendente/em_execucao) pode receber UMA ação corrente
-- do CS, com status que aparece do lado da criticidade no dashboard.
-- Escrita: via service_role (server action do Next, atrás do login). Leitura:
-- anon (views). 1 ação por expectativa (upsert por expectativa_id).
-- =========================================================================

SET search_path TO field, public;

DO $$ BEGIN
  CREATE TYPE field.status_acao AS ENUM (
    'agendado',            -- ação tomada: visita/refil agendado
    'em_contato',          -- em contato com o cliente
    'aguardando_cliente',  -- bola com o cliente
    'resolvido'            -- gap tratado
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS field.planos_acao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expectativa_id UUID NOT NULL UNIQUE REFERENCES field.expectativas(id) ON DELETE CASCADE,
  status field.status_acao NOT NULL,
  responsavel TEXT,
  nota TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planos_acao_status ON field.planos_acao(status);

DROP TRIGGER IF EXISTS trg_planos_acao_updated_at ON field.planos_acao;
CREATE TRIGGER trg_planos_acao_updated_at
  BEFORE UPDATE ON field.planos_acao
  FOR EACH ROW EXECUTE FUNCTION field.tg_updated_at();

COMMENT ON TABLE field.planos_acao IS 'Ação corrente do CS sobre um gap (expectativa). 1 por expectativa (upsert). Status aparece ao lado da criticidade.';

-- =========================================================================
-- v_planos_acao — ações com contexto de cliente/gap (aba "Ações")
-- =========================================================================

CREATE OR REPLACE VIEW field.v_planos_acao AS
SELECT
  pa.id,
  pa.expectativa_id,
  pa.status,
  pa.responsavel,
  pa.nota,
  pa.updated_at,
  e.tipo,
  e.mes_referencia,
  e.status AS expectativa_status,
  c.id AS cliente_id,
  c.codigo_field,
  c.nome AS cliente_nome,
  cs.tier,
  cs.jornada_atual,
  cs.modalidade
FROM field.planos_acao pa
JOIN field.expectativas e ON e.id = pa.expectativa_id
JOIN field.clientes c ON c.id = e.cliente_id
LEFT JOIN field.v_clientes_segmentados cs ON cs.id = c.id;

COMMENT ON VIEW field.v_planos_acao IS 'Planos de ação do CS com contexto de cliente e do gap.';

-- =========================================================================
-- PERMISSÕES — service_role escreve; anon/authenticated só leem.
-- =========================================================================
GRANT ALL ON field.planos_acao TO service_role;
GRANT SELECT ON field.planos_acao TO anon, authenticated;
GRANT SELECT ON field.v_planos_acao TO anon, authenticated, service_role;
