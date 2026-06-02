-- =========================================================================
-- Field Control Dashboard - Views
-- Rode esse arquivo DEPOIS do 01-schema.sql
-- =========================================================================
-- Views são "queries congeladas" - você consulta como tabela mas o Postgres
-- recalcula em tempo real. O dashboard Next.js vai bater direto nessas views.
-- =========================================================================

SET search_path TO field, public;

-- =========================================================================
-- v_clientes_segmentados
-- Cada cliente com suas tags consolidadas em uma linha só
-- =========================================================================

CREATE OR REPLACE VIEW field.v_clientes_segmentados AS
SELECT
  c.id,
  c.codigo_field,
  c.nome,
  c.data_inicio_contrato,
  c.ativo,
  (CURRENT_DATE - c.data_inicio_contrato) / 30 AS meses_de_casa,
  -- modalidade
  CASE
    WHEN bool_or(e.nome = 'presencial') THEN 'presencial'
    WHEN bool_or(e.nome = 'remoto') THEN 'remoto'
    ELSE NULL
  END AS modalidade,
  -- jornada (tag atual)
  CASE
    WHEN bool_or(e.nome = 'fidelizado-dna') THEN 'fidelizado-dna'
    WHEN bool_or(e.nome = 'consolidacao') THEN 'consolidacao'
    WHEN bool_or(e.nome = 'conexao') THEN 'conexao'
    WHEN bool_or(e.nome = 'onboarding') THEN 'onboarding'
    ELSE NULL
  END AS jornada_atual,
  -- jornada esperada com base na data de início (audit)
  CASE
    WHEN c.data_inicio_contrato IS NULL THEN NULL
    WHEN (CURRENT_DATE - c.data_inicio_contrato) / 30 >= 24 THEN 'fidelizado-dna'
    WHEN (CURRENT_DATE - c.data_inicio_contrato) / 30 >= 12 THEN 'consolidacao'
    WHEN (CURRENT_DATE - c.data_inicio_contrato) / 30 >= 6 THEN 'conexao'
    ELSE 'onboarding'
  END AS jornada_esperada,
  -- tier de contrato
  CASE
    WHEN bool_or(e.nome = 'super-star') THEN 'super-star'
    WHEN bool_or(e.nome = 'star') THEN 'star'
    WHEN bool_or(e.nome = 'premium') THEN 'premium'
    WHEN bool_or(e.nome = 'growth') THEN 'growth'
    ELSE NULL
  END AS tier,
  -- todas as etiquetas
  array_agg(e.nome ORDER BY e.nome) FILTER (WHERE e.nome IS NOT NULL) AS todas_etiquetas
FROM field.clientes c
LEFT JOIN field.cliente_etiquetas ce ON ce.cliente_id = c.id
LEFT JOIN field.etiquetas e ON e.id = ce.etiqueta_id AND e.escopo = 'cliente'
WHERE c.ativo = TRUE
GROUP BY c.id, c.codigo_field, c.nome, c.data_inicio_contrato, c.ativo;

-- =========================================================================
-- v_audit_jornada
-- Clientes cuja tag de jornada não bate com o tempo real de casa
-- (Como a tag é manual, esse é o flag pra gestora atualizar)
-- =========================================================================

CREATE OR REPLACE VIEW field.v_audit_jornada AS
SELECT
  id,
  codigo_field,
  nome,
  meses_de_casa,
  jornada_atual,
  jornada_esperada,
  CASE
    WHEN jornada_atual IS NULL THEN 'sem_etiqueta'
    WHEN jornada_atual = jornada_esperada THEN 'ok'
    ELSE 'desalinhado'
  END AS situacao
FROM field.v_clientes_segmentados
WHERE jornada_atual IS DISTINCT FROM jornada_esperada
  OR jornada_atual IS NULL;

-- =========================================================================
-- v_gaps_priorizados
-- TODOS os gaps do mês corrente, ranqueados por criticidade
-- Esta é a view principal do dashboard
-- =========================================================================

CREATE OR REPLACE VIEW field.v_gaps_priorizados AS
WITH base AS (
  SELECT
    e.id AS expectativa_id,
    e.tipo,
    e.status,
    e.mes_referencia,
    e.os_atendendo,
    c.id AS cliente_id,
    c.codigo_field,
    c.nome AS cliente_nome,
    cs.modalidade,
    cs.jornada_atual,
    cs.tier,
    cs.todas_etiquetas,
    -- pontuação para ranqueamento
    CASE cs.tier
      WHEN 'super-star' THEN 4
      WHEN 'star' THEN 3
      WHEN 'premium' THEN 2
      WHEN 'growth' THEN 1
      ELSE 0
    END AS tier_score,
    CASE cs.jornada_atual
      WHEN 'onboarding' THEN 4
      WHEN 'conexao' THEN 3
      WHEN 'consolidacao' THEN 2
      WHEN 'fidelizado-dna' THEN 1
      ELSE 0
    END AS risco_score
  FROM field.expectativas e
  JOIN field.clientes c ON c.id = e.cliente_id
  LEFT JOIN field.v_clientes_segmentados cs ON cs.id = c.id
  WHERE e.mes_referencia = date_trunc('month', CURRENT_DATE)::date
    AND e.status IN ('pendente', 'em_execucao')
)
SELECT
  expectativa_id,
  cliente_id,
  codigo_field,
  cliente_nome,
  tipo,
  status,
  modalidade,
  jornada_atual,
  tier,
  todas_etiquetas,
  os_atendendo,
  CASE
    WHEN tier_score >= 3 AND risco_score >= 3 THEN 'critico'::field.criticidade
    WHEN tier_score >= 3 OR (tier_score >= 2 AND risco_score >= 3) THEN 'alto'::field.criticidade
    WHEN tier_score >= 2 OR risco_score >= 3 THEN 'medio'::field.criticidade
    ELSE 'estavel'::field.criticidade
  END AS criticidade
FROM base
ORDER BY
  CASE
    WHEN tier_score >= 3 AND risco_score >= 3 THEN 1
    WHEN tier_score >= 3 OR (tier_score >= 2 AND risco_score >= 3) THEN 2
    WHEN tier_score >= 2 OR risco_score >= 3 THEN 3
    ELSE 4
  END,
  cliente_nome;

-- =========================================================================
-- v_cobertura_mensal
-- KPI agregado: % de cobertura do mês por tipo de expectativa
-- =========================================================================

CREATE OR REPLACE VIEW field.v_cobertura_mensal AS
SELECT
  mes_referencia,
  tipo,
  COUNT(*) AS total_expectativas,
  COUNT(*) FILTER (WHERE status IN ('atendida', 'atendida_com_rastreio')) AS atendidas,
  COUNT(*) FILTER (WHERE status = 'em_execucao') AS em_execucao,
  COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status IN ('atendida', 'atendida_com_rastreio'))
    / NULLIF(COUNT(*), 0),
    1
  ) AS percentual_cobertura
FROM field.expectativas
GROUP BY mes_referencia, tipo
ORDER BY mes_referencia DESC, tipo;

-- =========================================================================
-- v_refis_sem_rastreio
-- Refis que estão "concluídos" mas sem rastreio - risco invisível
-- =========================================================================

CREATE OR REPLACE VIEW field.v_refis_sem_rastreio AS
SELECT
  e.id AS expectativa_id,
  c.codigo_field AS cliente_codigo,
  c.nome AS cliente_nome,
  os.id AS os_id,
  os.codigo_field AS os_codigo,
  os.status AS os_status,
  os.concluida_em,
  e.mes_referencia,
  e.status AS expectativa_status,
  -- quantos dias se passaram desde a conclusão sem rastreio
  EXTRACT(DAY FROM (NOW() - os.concluida_em))::INT AS dias_sem_rastreio
FROM field.expectativas e
JOIN field.clientes c ON c.id = e.cliente_id
LEFT JOIN field.ordens_servico os ON os.id = e.os_atendendo
WHERE e.tipo = 'refil'
  AND e.status = 'em_execucao'
  AND e.mes_referencia >= DATE '2026-01-01'   -- PISO: início do acompanhamento efetivo (rastreio não era controlado antes)
ORDER BY e.mes_referencia DESC, os.concluida_em ASC;

-- =========================================================================
-- v_avaliacoes_criticas
-- Avaliações com nota baixa, contextualizadas com o cliente
-- =========================================================================

CREATE OR REPLACE VIEW field.v_avaliacoes_criticas AS
SELECT
  a.id AS avaliacao_id,
  a.nota,
  a.comentario,
  a.data_avaliacao,
  os.codigo_field AS os_codigo,
  c.codigo_field AS cliente_codigo,
  c.nome AS cliente_nome,
  cs.tier,
  cs.jornada_atual,
  cs.modalidade,
  -- classificação do agente, se já analisada
  ca.criticidade AS classificacao_agente,
  ca.acao_sugerida,
  ca.sumario,
  ca.processado_em AS analisada_em
FROM field.avaliacoes a
JOIN field.ordens_servico os ON os.id = a.os_id
JOIN field.clientes c ON c.id = os.cliente_id
LEFT JOIN field.v_clientes_segmentados cs ON cs.id = c.id
LEFT JOIN field.classificacao_agente ca
  ON ca.fonte_tipo = 'avaliacao' AND ca.fonte_id = a.id
WHERE a.nota <= 3
ORDER BY a.data_avaliacao DESC;

-- =========================================================================
-- v_comentarios_para_analise
-- Comentários técnicos que ainda não passaram pelo agente
-- =========================================================================

CREATE OR REPLACE VIEW field.v_comentarios_para_analise AS
SELECT
  com.id AS comentario_id,
  com.os_id,
  com.texto,
  com.autor,
  com.data_comentario,
  os.codigo_field AS os_codigo,
  c.nome AS cliente_nome,
  cs.tier,
  cs.jornada_atual
FROM field.comentarios com
JOIN field.ordens_servico os ON os.id = com.os_id
JOIN field.clientes c ON c.id = os.cliente_id
LEFT JOIN field.v_clientes_segmentados cs ON cs.id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM field.classificacao_agente ca
  WHERE ca.fonte_tipo = 'comentario' AND ca.fonte_id = com.id
)
ORDER BY com.data_comentario DESC;

-- =========================================================================
-- v_alertas_pendentes
-- Classificações críticas que ainda não dispararam alerta no Telegram
-- O workflow do n8n consome essa view, manda no Telegram, e marca alertou_em
-- =========================================================================

CREATE OR REPLACE VIEW field.v_alertas_pendentes AS
SELECT
  ca.id,
  ca.fonte_tipo,
  ca.fonte_id,
  ca.criticidade,
  ca.sumario,
  ca.acao_sugerida,
  ca.processado_em
FROM field.classificacao_agente ca
WHERE ca.criticidade = 'critico'
  AND ca.alertou_em IS NULL
ORDER BY ca.processado_em ASC;

-- =========================================================================
-- PERMISSÕES
-- =========================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA field TO authenticated, anon;

-- =========================================================================
-- FIM
-- =========================================================================
-- Próximo passo: rodar 03-functions.sql
