-- =========================================================================
-- Field Control Dashboard - Evolução mensal (backfill de expectativas)
-- Rode DEPOIS do 03-functions.sql. Idempotente (pode rodar de novo).
-- =========================================================================
-- Objetivo: ter histórico mês a mês de cobertura/gaps pra página "Evolução".
-- O `gerar_expectativas_mes` operacional só rodou pra maio/junho 2026. Aqui
-- geramos as expectativas dos meses anteriores e casamos com as OS reais
-- (que existem desde 2022) via match_expectativas_os.
--
-- DIFERENÇA vs gerar_expectativas_mes (NÃO mexemos na função operacional):
--   filtramos `c.data_inicio_contrato < (mes + 1 mês)` -> só gera meta pra
--   cliente que existia em ALGUM dia do mês (inclusive quem começou no próprio
--   mês). Senão a meta de meses antigos infla com clientes novos e a cobertura
--   sai falsamente baixa.
--
-- LIMITAÇÃO (aproximação aceita): usa o cohort de clientes ATIVOS hoje + tags
-- de hoje. Clientes que cancelaram (archived) não entram no histórico (não há
-- data de churn). Leitura correta: "entre os clientes que temos hoje, como
-- estava a cobertura deles ao longo do tempo". Serve pra tendência, não auditoria.
-- =========================================================================

SET search_path TO field, public;

DO $$
DECLARE
  m DATE;
  v_eh_impar BOOLEAN;
  v_vis INT;
  v_ref INT;
BEGIN
  -- jun/2025 .. abr/2026 (maio/junho 2026 já vêm do gerar operacional)
  FOR m IN SELECT generate_series('2025-06-01'::date, '2026-04-01'::date, '1 month')::date
  LOOP
    v_eh_impar := EXTRACT(MONTH FROM m)::INT % 2 = 1;

    -- VISITAS: presencial ativo que já existia no mês
    INSERT INTO field.expectativas (cliente_id, tipo, mes_referencia, status)
    SELECT DISTINCT c.id, 'visita'::field.tipo_expectativa, m, 'pendente'::field.status_expectativa
    FROM field.clientes c
    JOIN field.cliente_etiquetas ce ON ce.cliente_id = c.id
    JOIN field.etiquetas e ON e.id = ce.etiqueta_id
    WHERE c.ativo = TRUE
      AND c.data_inicio_contrato < (m + INTERVAL '1 month')  -- existia em algum dia do mês m
      AND e.nome = 'presencial'
      AND e.escopo = 'cliente'
    ON CONFLICT (cliente_id, tipo, mes_referencia) DO NOTHING;
    GET DIAGNOSTICS v_vis = ROW_COUNT;

    -- REFIS: remoto ativo que já existia, só meses ímpares
    v_ref := 0;
    IF v_eh_impar THEN
      INSERT INTO field.expectativas (cliente_id, tipo, mes_referencia, status)
      SELECT DISTINCT c.id, 'refil'::field.tipo_expectativa, m, 'pendente'::field.status_expectativa
      FROM field.clientes c
      JOIN field.cliente_etiquetas ce ON ce.cliente_id = c.id
      JOIN field.etiquetas e ON e.id = ce.etiqueta_id
      WHERE c.ativo = TRUE
        AND c.data_inicio_contrato < (m + INTERVAL '1 month')  -- existia em algum dia do mês m
        AND e.nome = 'remoto'
        AND e.escopo = 'cliente'
      ON CONFLICT (cliente_id, tipo, mes_referencia) DO NOTHING;
      GET DIAGNOSTICS v_ref = ROW_COUNT;
    END IF;

    -- casa com as OS reais do mês
    PERFORM field.match_expectativas_os(m);

    RAISE NOTICE 'backfill % -> % visitas, % refis geradas (matched)', m, v_vis, v_ref;
  END LOOP;
END$$;

-- =========================================================================
-- v_evolucao_mensal — métrica mês a mês pra página Evolução.
-- Duas taxas por (mes, tipo):
--   realizado_pct  = (total - pendente)/total  -> ENTREGUE (robusto; refil em
--                    execução conta como entregue). É a métrica-título.
--   cobertura_pct  = atendida estrita/total    -> casa com v_cobertura_mensal
--                    (refil exige rastreio). Secundária; o rastreio histórico
--                    só ficou consistente a partir de ~nov/2025.
-- =========================================================================

CREATE OR REPLACE VIEW field.v_evolucao_mensal AS
SELECT
  e.mes_referencia,
  e.tipo,
  count(*)                                                              AS total,
  count(*) FILTER (WHERE e.status = 'pendente')                        AS pendente,
  count(*) FILTER (WHERE e.status = 'em_execucao')                     AS em_execucao,
  count(*) FILTER (WHERE e.status IN ('atendida','atendida_com_rastreio')) AS atendida,
  count(*) FILTER (WHERE e.status = 'atendida_com_rastreio')           AS com_rastreio,
  count(*) FILTER (WHERE e.status <> 'pendente')                       AS realizado,
  round(100.0 * count(*) FILTER (WHERE e.status <> 'pendente')
        / nullif(count(*), 0), 1)                                      AS realizado_pct,
  round(100.0 * count(*) FILTER (WHERE e.status IN ('atendida','atendida_com_rastreio'))
        / nullif(count(*), 0), 1)                                      AS cobertura_pct
FROM field.expectativas e
GROUP BY e.mes_referencia, e.tipo;

COMMENT ON VIEW field.v_evolucao_mensal IS 'Cobertura mês a mês pra página Evolução. realizado_pct = entregue (não-pendente, métrica-título); cobertura_pct = estrita (com rastreio p/ refil), casa com v_cobertura_mensal.';

-- =========================================================================
-- v_gaps_mensais — igual v_gaps_priorizados, mas TODOS os meses + coluna
-- mes_referencia (pra filtrar por mês via PostgREST). A v_gaps_priorizados
-- (mês corrente) fica intacta.
-- =========================================================================

CREATE OR REPLACE VIEW field.v_gaps_mensais AS
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
    CASE cs.tier
      WHEN 'super-star' THEN 4 WHEN 'star' THEN 3 WHEN 'premium' THEN 2 WHEN 'growth' THEN 1 ELSE 0
    END AS tier_score,
    CASE cs.jornada_atual
      WHEN 'onboarding' THEN 4 WHEN 'conexao' THEN 3 WHEN 'consolidacao' THEN 2 WHEN 'fidelizado-dna' THEN 1 ELSE 0
    END AS risco_score
  FROM field.expectativas e
  JOIN field.clientes c ON c.id = e.cliente_id
  LEFT JOIN field.v_clientes_segmentados cs ON cs.id = c.id
  WHERE e.status IN ('pendente', 'em_execucao')
)
SELECT
  expectativa_id,
  mes_referencia,
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
  END AS criticidade,
  -- AGENDADO no Field: já existe OS do mesmo cliente/mês/tipo (agendada, ainda
  -- não concluída — senão a expectativa não estaria como gap). Evita o CS
  -- re-registrar "agendado" à mão: se marcou no Field, aparece aqui sozinho.
  EXISTS (
    SELECT 1 FROM field.ordens_servico os
    WHERE os.cliente_id = base.cliente_id
      AND os.mes_referencia = base.mes_referencia
      AND ( (base.tipo = 'refil'  AND lower(os.tipo) LIKE '%refil%')
         OR (base.tipo = 'visita' AND (lower(os.tipo) NOT LIKE '%refil%' OR os.tipo IS NULL)) )
  ) AS agendado_field
FROM base
ORDER BY
  mes_referencia DESC,
  CASE
    WHEN tier_score >= 3 AND risco_score >= 3 THEN 1
    WHEN tier_score >= 3 OR (tier_score >= 2 AND risco_score >= 3) THEN 2
    WHEN tier_score >= 2 OR risco_score >= 3 THEN 3
    ELSE 4
  END,
  cliente_nome;

-- =========================================================================
-- PERMISSÕES
-- =========================================================================
GRANT SELECT ON field.v_evolucao_mensal, field.v_gaps_mensais TO authenticated, anon, service_role;

-- =========================================================================
-- FIM
-- =========================================================================
