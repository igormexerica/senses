-- =========================================================================
-- Field Control Dashboard - Excluir estandes de feira da contagem de inventário
-- Rode DEPOIS do 05-equipamentos.sql. Idempotente (CREATE OR REPLACE).
-- =========================================================================
-- Os registros "EXPO REVESTIR 2026 - ..." são estandes temporários de feira
-- (não clientes reais) e inflavam a frota. Excluídos SÓ da contagem de
-- inventário (v_inventario_modelo / v_inventario_cliente) via filtro de nome.
-- Os clientes reais (EMBRAMACO, CERAMICA VILLAGRES, etc.) são registros
-- SEPARADOS e continuam contando — por isso filtra pelo prefixo do nome do
-- estande, não por "EMBRAMACO". O sync nunca toca views, então é durável
-- (marcar ativo=false seria revertido pelo sync de clientes a cada ~6h).
-- Escopo: SÓ inventário. Cobertura/gaps/avaliações não mudam.
-- =========================================================================

SET search_path TO field, public;

-- v_inventario_modelo — frota por modelo (clientes ativos, equip não-archived),
-- agora excluindo estandes de feira.
CREATE OR REPLACE VIEW field.v_inventario_modelo AS
SELECT
  COALESCE(eq.modelo, 'NÃO IDENTIFICADO') AS modelo,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE eq.cor = 'BRANCA') AS branca,
  COUNT(*) FILTER (WHERE eq.cor = 'PRETA')  AS preta,
  COUNT(*) FILTER (WHERE eq.cor IS NULL)    AS sem_cor,
  COUNT(DISTINCT eq.cliente_id) AS clientes
FROM field.equipamentos eq
JOIN field.clientes c ON c.id = eq.cliente_id AND c.ativo = TRUE
WHERE eq.archived = FALSE
  AND c.nome NOT ILIKE 'EXPO REVESTIR%'   -- exclui estandes de feira
GROUP BY COALESCE(eq.modelo, 'NÃO IDENTIFICADO')
ORDER BY total DESC;

-- v_inventario_cliente — inventário por cliente, agora excluindo estandes de feira.
CREATE OR REPLACE VIEW field.v_inventario_cliente AS
WITH base AS (
  SELECT
    eq.cliente_id,
    COALESCE(eq.modelo, 'NÃO IDENTIFICADO') AS modelo,
    COUNT(*) AS qtd
  FROM field.equipamentos eq
  WHERE eq.archived = FALSE
    AND eq.cliente_id IS NOT NULL
  GROUP BY eq.cliente_id, COALESCE(eq.modelo, 'NÃO IDENTIFICADO')
)
SELECT
  c.id AS cliente_id,
  c.codigo_field,
  c.nome AS cliente_nome,
  (SUM(b.qtd))::int AS total_equipamentos,
  (SUM(b.qtd) FILTER (WHERE b.modelo <> 'NÃO IDENTIFICADO'))::int AS com_modelo,
  (SUM(b.qtd) FILTER (WHERE b.modelo =  'NÃO IDENTIFICADO'))::int AS sem_modelo,
  jsonb_object_agg(b.modelo, b.qtd) AS por_modelo
FROM field.clientes c
JOIN base b ON b.cliente_id = c.id
WHERE c.ativo = TRUE
  AND c.nome NOT ILIKE 'EXPO REVESTIR%'   -- exclui estandes de feira
GROUP BY c.id, c.codigo_field, c.nome
ORDER BY total_equipamentos DESC;

GRANT SELECT ON field.v_inventario_modelo, field.v_inventario_cliente
  TO service_role, authenticated;
