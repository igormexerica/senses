-- =========================================================================
-- Field Control Dashboard - Avaliação média por mês (página Evolução)
-- Rode DEPOIS do 01-schema.sql. Idempotente.
-- =========================================================================
-- Média da nota (1-5) por mês de avaliação, pra somar a dimensão de
-- satisfação à evolução. Amostra pequena (~8-14/mês) -> exibir o N junto.
-- Mês = mês-calendário do data_avaliacao (não o mes_referencia da OS).
-- =========================================================================

SET search_path TO field, public;

CREATE OR REPLACE VIEW field.v_avaliacao_mensal AS
SELECT
  date_trunc('month', a.data_avaliacao)::date AS mes_referencia,
  count(*)                                     AS qtd,
  round(avg(a.nota), 2)                        AS media,
  count(*) FILTER (WHERE a.nota <= 3)          AS criticas
FROM field.avaliacoes a
WHERE a.data_avaliacao IS NOT NULL
GROUP BY 1;

COMMENT ON VIEW field.v_avaliacao_mensal IS 'Avaliação média (nota 1-5) por mês-calendário do data_avaliacao. qtd = amostra do mês (pequena), criticas = notas <=3.';

GRANT SELECT ON field.v_avaliacao_mensal TO authenticated, anon, service_role;
