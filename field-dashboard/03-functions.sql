-- =========================================================================
-- Field Control Dashboard - Functions
-- Rode esse arquivo DEPOIS do 02-views.sql
-- =========================================================================
-- Funções para os 2 jobs centrais:
-- 1. Gerar expectativas no início de cada mês
-- 2. Match das expectativas com OS reais (rodando de hora em hora)
-- =========================================================================

SET search_path TO field, public;

-- =========================================================================
-- gerar_expectativas_mes
-- Cria as expectativas (visitas + refis) pro mês informado.
-- Roda dia 1 do mês, às 00:01 (via n8n cron).
-- Idempotente: se rodar 2x no mesmo mês, não duplica (UNIQUE constraint).
-- =========================================================================

CREATE OR REPLACE FUNCTION field.gerar_expectativas_mes(
  mes DATE DEFAULT date_trunc('month', CURRENT_DATE)::date
)
RETURNS TABLE (
  geradas_visitas INT,
  geradas_refis INT,
  mes_eh_impar BOOLEAN
) AS $$
DECLARE
  v_visitas INT := 0;
  v_refis INT := 0;
  v_eh_impar BOOLEAN;
BEGIN
  -- Normaliza pro primeiro dia do mês
  mes := date_trunc('month', mes)::date;
  v_eh_impar := EXTRACT(MONTH FROM mes)::INT % 2 = 1;

  -- VISITAS: todos os clientes ativos com tag 'presencial'
  WITH inseridas AS (
    INSERT INTO field.expectativas (cliente_id, tipo, mes_referencia, status)
    SELECT DISTINCT c.id, 'visita'::field.tipo_expectativa, mes, 'pendente'::field.status_expectativa
    FROM field.clientes c
    JOIN field.cliente_etiquetas ce ON ce.cliente_id = c.id
    JOIN field.etiquetas e ON e.id = ce.etiqueta_id
    WHERE c.ativo = TRUE
      AND e.nome = 'presencial'
      AND e.escopo = 'cliente'
    ON CONFLICT (cliente_id, tipo, mes_referencia) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_visitas FROM inseridas;

  -- REFIS: apenas em meses ímpares (jan, mar, mai, jul, set, nov)
  IF v_eh_impar THEN
    WITH inseridas AS (
      INSERT INTO field.expectativas (cliente_id, tipo, mes_referencia, status)
      SELECT DISTINCT c.id, 'refil'::field.tipo_expectativa, mes, 'pendente'::field.status_expectativa
      FROM field.clientes c
      JOIN field.cliente_etiquetas ce ON ce.cliente_id = c.id
      JOIN field.etiquetas e ON e.id = ce.etiqueta_id
      WHERE c.ativo = TRUE
        AND e.nome = 'remoto'
        AND e.escopo = 'cliente'
      ON CONFLICT (cliente_id, tipo, mes_referencia) DO NOTHING
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_refis FROM inseridas;
  END IF;

  RETURN QUERY SELECT v_visitas, v_refis, v_eh_impar;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION field.gerar_expectativas_mes IS 'Cria expectativas do mês. Visitas pra todo presencial ativo, refis só em meses ímpares pra remotos.';

-- =========================================================================
-- match_expectativas_os
-- Liga expectativas com OS reais. Roda de hora em hora.
-- Atualiza status conforme regras:
--   visita + OS concluída → atendida
--   refil + OS com rastreio → atendida_com_rastreio
--   refil + OS sem rastreio → em_execucao
-- =========================================================================

CREATE OR REPLACE FUNCTION field.match_expectativas_os(
  mes DATE DEFAULT date_trunc('month', CURRENT_DATE)::date
)
RETURNS TABLE (
  visitas_atendidas INT,
  refis_com_rastreio INT,
  refis_em_execucao INT
) AS $$
DECLARE
  v_visitas INT := 0;
  v_refis_ok INT := 0;
  v_refis_exec INT := 0;
BEGIN
  mes := date_trunc('month', mes)::date;

  -- VISITAS: match OS concluída do cliente no mês
  WITH matched AS (
    UPDATE field.expectativas e
    SET status = 'atendida'::field.status_expectativa,
        os_atendendo = sub.os_id
    FROM (
      SELECT DISTINCT ON (os.cliente_id) os.id AS os_id, os.cliente_id
      FROM field.ordens_servico os
      WHERE os.mes_referencia = mes
        AND lower(os.status) IN ('concluida', 'concluido', 'finalizada', 'finalizado')
        AND (lower(os.tipo) LIKE '%visita%' OR lower(os.tipo) IS NOT NULL)
      ORDER BY os.cliente_id, os.concluida_em DESC NULLS LAST
    ) sub
    WHERE e.tipo = 'visita'
      AND e.mes_referencia = mes
      AND e.status = 'pendente'
      AND e.cliente_id = sub.cliente_id
    RETURNING e.id
  )
  SELECT COUNT(*) INTO v_visitas FROM matched;

  -- REFIS COM RASTREIO: prioridade máxima, sobrescreve em_execucao
  WITH matched AS (
    UPDATE field.expectativas e
    SET status = 'atendida_com_rastreio'::field.status_expectativa,
        os_atendendo = sub.os_id
    FROM (
      SELECT DISTINCT ON (os.cliente_id) os.id AS os_id, os.cliente_id
      FROM field.ordens_servico os
      WHERE os.mes_referencia = mes
        AND lower(os.tipo) LIKE '%refil%'
        AND EXISTS (
          SELECT 1 FROM field.respostas_form rf
          WHERE rf.os_id = os.id
            AND (rf.campo ILIKE '%rastreio%' OR rf.campo ILIKE '%rastreamento%')
            AND rf.valor IS NOT NULL
            AND length(trim(rf.valor)) > 0
        )
      ORDER BY os.cliente_id, os.concluida_em DESC NULLS LAST
    ) sub
    WHERE e.tipo = 'refil'
      AND e.mes_referencia = mes
      AND e.status IN ('pendente', 'em_execucao')
      AND e.cliente_id = sub.cliente_id
    RETURNING e.id
  )
  SELECT COUNT(*) INTO v_refis_ok FROM matched;

  -- REFIS EM EXECUÇÃO: tem OS de refil, mas ainda sem rastreio
  WITH matched AS (
    UPDATE field.expectativas e
    SET status = 'em_execucao'::field.status_expectativa,
        os_atendendo = sub.os_id
    FROM (
      SELECT DISTINCT ON (os.cliente_id) os.id AS os_id, os.cliente_id
      FROM field.ordens_servico os
      WHERE os.mes_referencia = mes
        AND lower(os.tipo) LIKE '%refil%'
      ORDER BY os.cliente_id, os.criada_em DESC
    ) sub
    WHERE e.tipo = 'refil'
      AND e.mes_referencia = mes
      AND e.status = 'pendente'
      AND e.cliente_id = sub.cliente_id
    RETURNING e.id
  )
  SELECT COUNT(*) INTO v_refis_exec FROM matched;

  RETURN QUERY SELECT v_visitas, v_refis_ok, v_refis_exec;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION field.match_expectativas_os IS 'Liga expectativas pendentes com OS reais. Idempotente: roda de hora em hora sem efeitos colaterais.';

-- =========================================================================
-- upsert_cliente
-- Helper pro n8n: cria ou atualiza cliente a partir do Field
-- =========================================================================

CREATE OR REPLACE FUNCTION field.upsert_cliente(
  p_codigo_field TEXT,
  p_nome TEXT,
  p_data_inicio_contrato DATE DEFAULT NULL,
  p_ativo BOOLEAN DEFAULT TRUE
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO field.clientes (codigo_field, nome, data_inicio_contrato, ativo, ultima_sync)
  VALUES (p_codigo_field, p_nome, p_data_inicio_contrato, p_ativo, NOW())
  ON CONFLICT (codigo_field) DO UPDATE
  SET nome = EXCLUDED.nome,
      data_inicio_contrato = COALESCE(EXCLUDED.data_inicio_contrato, field.clientes.data_inicio_contrato),
      ativo = EXCLUDED.ativo,
      ultima_sync = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- upsert_etiqueta
-- =========================================================================

CREATE OR REPLACE FUNCTION field.upsert_etiqueta(
  p_codigo_field TEXT,
  p_nome TEXT,
  p_escopo field.escopo_etiqueta
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO field.etiquetas (codigo_field, nome, escopo)
  VALUES (p_codigo_field, p_nome, p_escopo)
  ON CONFLICT (codigo_field) DO UPDATE
  SET nome = EXCLUDED.nome,
      escopo = EXCLUDED.escopo
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- upsert_os
-- =========================================================================

-- Assinatura mudou (novo p_mes_referencia) — dropa a antiga pra evitar overload ambíguo
DROP FUNCTION IF EXISTS field.upsert_os(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION field.upsert_os(
  p_codigo_field TEXT,
  p_cliente_codigo_field TEXT,
  p_tipo TEXT,
  p_status TEXT,
  p_criada_em TIMESTAMPTZ,
  p_concluida_em TIMESTAMPTZ DEFAULT NULL,
  p_mes_referencia DATE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_cliente_id UUID;
  v_mes_ref DATE;
BEGIN
  -- Mês de referência: preferir o mês PLANEJADO (scheduling.date da task, vindo em
  -- p_mes_referencia); senão cai pra data de criação. O createdAt sozinho erra porque
  -- a operação cria o refil no mês anterior ao envio. Ver DESCOBERTAS-API.md.
  v_mes_ref := date_trunc('month', COALESCE(p_mes_referencia, p_criada_em::date))::date;

  -- Resolve cliente_id a partir do código do Field
  SELECT id INTO v_cliente_id
  FROM field.clientes
  WHERE codigo_field = p_cliente_codigo_field;

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado: %', p_cliente_codigo_field;
  END IF;

  INSERT INTO field.ordens_servico (
    codigo_field, cliente_id, tipo, status, mes_referencia, criada_em, concluida_em, ultima_sync
  )
  VALUES (
    p_codigo_field, v_cliente_id, p_tipo, p_status, v_mes_ref, p_criada_em, p_concluida_em, NOW()
  )
  ON CONFLICT (codigo_field) DO UPDATE
  SET tipo = EXCLUDED.tipo,
      status = EXCLUDED.status,
      mes_referencia = EXCLUDED.mes_referencia,   -- precisa atualizar no re-sync (correção de mês)
      concluida_em = EXCLUDED.concluida_em,
      ultima_sync = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- registrar_sync
-- O n8n chama no fim de cada workflow pra registrar o que processou
-- =========================================================================

CREATE OR REPLACE FUNCTION field.registrar_sync(
  p_recurso TEXT,
  p_ultimo_updated_at TIMESTAMPTZ,
  p_registros_processados INT,
  p_erro TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO field.sync_state (recurso, ultimo_sync_em, ultimo_updated_at, registros_processados, erro)
  VALUES (p_recurso, NOW(), p_ultimo_updated_at, p_registros_processados, p_erro)
  ON CONFLICT (recurso) DO UPDATE
  SET ultimo_sync_em = NOW(),
      ultimo_updated_at = COALESCE(EXCLUDED.ultimo_updated_at, field.sync_state.ultimo_updated_at),
      registros_processados = EXCLUDED.registros_processados,
      erro = EXCLUDED.erro;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- PERMISSÕES
-- =========================================================================

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA field TO service_role, authenticated;

-- =========================================================================
-- FIM
-- =========================================================================
-- Próximo passo: configurar os 3 workflows do n8n (próximo bloco do projeto)
