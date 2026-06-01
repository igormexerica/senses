-- =========================================================================
-- Field Control Dashboard - Visão 360 do cliente (página /cliente/[id])
-- Rode DEPOIS do 02-views.sql. Idempotente.
-- =========================================================================

SET search_path TO field, public;

-- Cabeçalho do cliente: dados + segmentação (LEFT JOIN p/ incluir inativos)
CREATE OR REPLACE VIEW field.v_cliente_detalhe AS
SELECT
  c.id,
  c.codigo_field,
  c.nome,
  c.ativo,
  c.data_inicio_contrato,
  (CURRENT_DATE - c.data_inicio_contrato) / 30 AS meses_de_casa,
  cs.modalidade,
  cs.jornada_atual,
  cs.jornada_esperada,
  cs.tier,
  cs.todas_etiquetas
FROM field.clientes c
LEFT JOIN field.v_clientes_segmentados cs ON cs.id = c.id;

-- Avaliações por cliente (avaliacoes liga por os_id; aqui já resolvido)
CREATE OR REPLACE VIEW field.v_avaliacao_cliente AS
SELECT
  a.id,
  a.nota,
  a.comentario,
  a.data_avaliacao,
  os.cliente_id,
  os.codigo_field AS os_codigo,
  os.tipo AS os_tipo
FROM field.avaliacoes a
JOIN field.ordens_servico os ON os.id = a.os_id;

GRANT SELECT ON field.v_cliente_detalhe, field.v_avaliacao_cliente
  TO service_role, authenticated;
-- anon segue revogado pelo 11-lockdown (não re-conceder).
