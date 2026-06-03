-- =========================================================================
-- Field Control Dashboard - Drill-down de Risco de churn (card no /resumo)
-- Rode DEPOIS dos arquivos anteriores. Idempotente (CREATE OR REPLACE).
-- =========================================================================
-- Acrescenta 2 colunas a v_avaliacoes_criticas (avaliações nota<=3) p/ o
-- drill-down do card "Risco de churn":
--   cliente_id     -> link pro /cliente/[id] (360, onde o CS age na hora)
--   mes_referencia -> filtro por mês que casa EXATO com v_avaliacao_mensal.criticas
--                     (mesmo date_trunc da data_avaliacao)
-- CREATE OR REPLACE exige manter as colunas existentes na MESMA ordem e só
-- ACRESCENTAR no fim — por isso cliente_id/mes_referencia vão por último.
-- =========================================================================

SET search_path TO field, public;

CREATE OR REPLACE VIEW field.v_avaliacoes_criticas AS
SELECT
  a.id                 AS avaliacao_id,
  a.nota,
  a.comentario,
  a.data_avaliacao,
  os.codigo_field      AS os_codigo,
  c.codigo_field       AS cliente_codigo,
  c.nome               AS cliente_nome,
  cs.tier,
  cs.jornada_atual,
  cs.modalidade,
  ca.criticidade       AS classificacao_agente,
  ca.acao_sugerida,
  ca.sumario,
  ca.processado_em     AS analisada_em,
  -- colunas novas (no fim, p/ não quebrar o CREATE OR REPLACE):
  c.id                                         AS cliente_id,
  date_trunc('month', a.data_avaliacao)::date  AS mes_referencia
FROM field.avaliacoes a
JOIN field.ordens_servico os ON os.id = a.os_id
JOIN field.clientes c        ON c.id = os.cliente_id
LEFT JOIN field.v_clientes_segmentados cs ON cs.id = c.id
LEFT JOIN field.classificacao_agente ca
       ON ca.fonte_tipo = 'avaliacao'::text AND ca.fonte_id = a.id
WHERE a.nota <= 3
ORDER BY a.data_avaliacao DESC;

-- service_role/authenticated só (respeita 11-lockdown). CREATE OR REPLACE
-- preserva grants existentes; reafirmado por garantia.
GRANT SELECT ON field.v_avaliacoes_criticas TO service_role, authenticated;
