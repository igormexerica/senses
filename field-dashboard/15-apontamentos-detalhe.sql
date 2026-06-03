-- =========================================================================
-- Field Control Dashboard - Drill-down de apontamentos por tag (tela /apontamentos)
-- Rode DEPOIS do 14-resumo-mensal.sql. Idempotente (CREATE OR REPLACE).
-- =========================================================================
-- Alimenta o drill-down: clicar numa tag no /resumo abre a relação de clientes
-- daquela tag no mês, com o comentário do técnico e a ação sugerida da IA
-- (classificacao_agente, quando existe). 1 linha por OS com a tag.
-- =========================================================================

SET search_path TO field, public;

CREATE OR REPLACE VIEW field.v_apontamentos_detalhe AS
SELECT
  o.mes_referencia,
  e.nome              AS tag,
  c.id               AS cliente_id,
  c.nome             AS cliente_nome,
  c.codigo_field     AS cliente_codigo,
  o.codigo_field     AS os_codigo,
  o.tipo             AS os_tipo,
  o.status           AS os_status,
  o.concluida_em,
  cmt.comentario,
  ia.acao_sugerida,
  ia.sumario
FROM field.etiquetas e
JOIN field.os_etiquetas oe   ON oe.etiqueta_id = e.id
JOIN field.ordens_servico o  ON o.id = oe.os_id
JOIN field.clientes c        ON c.id = o.cliente_id
-- comentário mais recente do técnico nessa OS (o contexto do apontamento)
LEFT JOIN LATERAL (
  SELECT cm.texto AS comentario
  FROM field.comentarios cm
  WHERE cm.os_id = o.id
  ORDER BY cm.data_comentario DESC NULLS LAST
  LIMIT 1
) cmt ON TRUE
-- ação sugerida da IA p/ algum comentário dessa OS (mais recente)
LEFT JOIN LATERAL (
  SELECT ca.acao_sugerida, ca.sumario
  FROM field.classificacao_agente ca
  JOIN field.comentarios cm2 ON cm2.id = ca.fonte_id AND cm2.os_id = o.id
  WHERE ca.fonte_tipo = 'comentario'
  ORDER BY ca.processado_em DESC
  LIMIT 1
) ia ON TRUE
WHERE e.escopo = 'os';

COMMENT ON VIEW field.v_apontamentos_detalhe IS
  'Drill-down: 1 linha por OS com tag (escopo os) por mês — cliente + comentário do técnico + ação sugerida da IA (classificacao_agente, quando há). Filtrar por mes_referencia + tag.';

-- service_role/authenticated só (respeita 11-lockdown; dashboard lê via service_role)
GRANT SELECT ON field.v_apontamentos_detalhe TO service_role, authenticated;
