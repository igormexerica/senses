-- =========================================================================
-- Field Control Dashboard - Atividade diária (aba Atividade: dia/semana)
-- Rode DEPOIS do 01-schema.sql. Idempotente.
-- =========================================================================
-- Throughput da equipe por DIA: OS concluídas (split visita/refil) + avaliações.
-- A aba "Atividade" agrega isso por dia ou por semana. Cobertura continua
-- mensal (na Evolução); aqui é volume operacional do dia a dia.
-- Obs: "concluidas" conta TODA OS concluída (inclui tipos internos tipo
-- ALMOÇO/DAILY se houver) — é throughput bruto. visitas = não-refil.
-- =========================================================================

SET search_path TO field, public;

CREATE OR REPLACE VIEW field.v_atividade_diaria AS
WITH os AS (
  SELECT
    concluida_em::date AS dia,
    count(*)                                                  AS concluidas,
    count(*) FILTER (WHERE lower(tipo) LIKE '%refil%')        AS refis,
    count(*) FILTER (WHERE lower(tipo) NOT LIKE '%refil%' OR tipo IS NULL) AS visitas
  FROM field.ordens_servico
  WHERE concluida_em IS NOT NULL
    AND lower(status) LIKE 'conclu%'
  GROUP BY 1
),
av AS (
  SELECT
    data_avaliacao::date AS dia,
    count(*)             AS avaliacoes,
    round(avg(nota), 2)  AS nota_media
  FROM field.avaliacoes
  WHERE data_avaliacao IS NOT NULL
  GROUP BY 1
)
SELECT
  COALESCE(os.dia, av.dia)        AS dia,
  COALESCE(os.concluidas, 0)::int AS concluidas,
  COALESCE(os.visitas, 0)::int    AS visitas,
  COALESCE(os.refis, 0)::int      AS refis,
  COALESCE(av.avaliacoes, 0)::int AS avaliacoes,
  av.nota_media
FROM os
FULL OUTER JOIN av ON os.dia = av.dia;

COMMENT ON VIEW field.v_atividade_diaria IS 'Throughput diário: OS concluídas (split visita/refil) + avaliações + nota média. Agregado por dia/semana na aba Atividade.';

GRANT SELECT ON field.v_atividade_diaria TO authenticated, anon, service_role;
