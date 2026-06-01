-- =========================================================================
-- Field Control Dashboard - Auditoria de DELETE (rede de segurança)
-- Rode DEPOIS do 01-schema.sql. Idempotente.
-- =========================================================================
-- O Postgres aqui não loga DML (log_statement=ddl), então uma deleção de dados
-- passa sem rastro. Este trigger registra QUALQUER DELETE nas tabelas de
-- negócio com quem fez, de onde, quantas linhas e quando — pra a gente pegar
-- no flagrante se voltar a sumir (ex.: expectativas do mês corrente).
-- =========================================================================

SET search_path TO field, public;

CREATE TABLE IF NOT EXISTS field.audit_delete (
  id BIGSERIAL PRIMARY KEY,
  tabela TEXT NOT NULL,
  linhas INT NOT NULL,
  feito_por TEXT,         -- role do banco (postgres / service_role / ...)
  app TEXT,               -- application_name (ex.: PostgREST, psql)
  em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION field.tg_audit_delete()
RETURNS TRIGGER AS $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM deletadas;
  IF n > 0 THEN
    INSERT INTO field.audit_delete (tabela, linhas, feito_por, app)
    VALUES (TG_TABLE_NAME, n, current_user, current_setting('application_name', true));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- statement-level (uma linha de auditoria por DELETE, com a contagem)
DROP TRIGGER IF EXISTS trg_audit_del_expectativas ON field.expectativas;
CREATE TRIGGER trg_audit_del_expectativas
  AFTER DELETE ON field.expectativas
  REFERENCING OLD TABLE AS deletadas
  FOR EACH STATEMENT EXECUTE FUNCTION field.tg_audit_delete();

DROP TRIGGER IF EXISTS trg_audit_del_planos_acao ON field.planos_acao;
CREATE TRIGGER trg_audit_del_planos_acao
  AFTER DELETE ON field.planos_acao
  REFERENCING OLD TABLE AS deletadas
  FOR EACH STATEMENT EXECUTE FUNCTION field.tg_audit_delete();

DROP TRIGGER IF EXISTS trg_audit_del_clientes ON field.clientes;
CREATE TRIGGER trg_audit_del_clientes
  AFTER DELETE ON field.clientes
  REFERENCING OLD TABLE AS deletadas
  FOR EACH STATEMENT EXECUTE FUNCTION field.tg_audit_delete();

GRANT SELECT ON field.audit_delete TO service_role;
