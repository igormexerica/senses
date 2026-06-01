-- =========================================================================
-- Field Control Dashboard - Máquinas sem modelo identificado (renomear no Field)
-- Rode DEPOIS do 05-equipamentos.sql. Idempotente.
-- =========================================================================
-- 531 máquinas foram cadastradas no Field com o nome da LOCALIZAÇÃO física
-- ("RECEPÇÃO", "BANHEIRO", ".") em vez do modelo -> modelo NULL. Esta lista
-- (cliente + número + nome atual) ajuda o time a achar e renomear no Field.
-- =========================================================================

SET search_path TO field, public;

CREATE OR REPLACE VIEW field.v_equip_sem_modelo AS
SELECT
  e.id,
  e.numero,
  e.nome,
  e.location_codigo,
  c.id   AS cliente_id,
  c.nome AS cliente_nome
FROM field.equipamentos e
JOIN field.clientes c ON c.id = e.cliente_id
WHERE e.modelo IS NULL
  AND e.archived = FALSE
  AND c.ativo = TRUE;

GRANT SELECT ON field.v_equip_sem_modelo TO service_role, authenticated;
