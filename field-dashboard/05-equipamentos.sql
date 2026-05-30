-- =========================================================================
-- Field Control Dashboard - Equipamentos (inventário de máquinas por cliente)
-- Rode DEPOIS do 03-functions.sql. Migration incremental, idempotente.
-- =========================================================================
-- Fonte: GET /equipments (2328 máquinas). A API NÃO filtra por cliente
-- (?customer= é ignorado) e NÃO tem /customers/{id}/equipments → o sync varre
-- tudo e agrupa por customer.id. `updatedAt` vem sempre null → sync é full
-- (gateado por hora no run_sync). O `name` carrega o modelo só ~65% das vezes
-- ("SENSES BRISA - BRANCA"); o resto é nomeado pela localização física
-- ("RECEPÇÃO", "BANHEIRO", "."). modelo/cor são derivados no ingest (Python).
-- Ver DESCOBERTAS-API.md (seção /equipments).
-- =========================================================================

SET search_path TO field, public;

-- =========================================================================
-- TABELA equipamentos
-- =========================================================================

CREATE TABLE IF NOT EXISTS field.equipamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- uuid-ossp fica no schema extensions; gen_random_uuid é core
  codigo_field TEXT UNIQUE NOT NULL,             -- equipment.id do Field
  cliente_id UUID REFERENCES field.clientes(id) ON DELETE SET NULL,
  cliente_codigo_field TEXT,                     -- customer.id (guardado mesmo se o cliente não está na base)
  nome TEXT,                                     -- name bruto do Field
  modelo TEXT,                                   -- derivado: "BRISA","SERENA","BRUMA"... NULL p/ nome de localização
  cor TEXT,                                      -- derivado: "BRANCA"/"PRETA"
  numero TEXT,                                   -- number (patrimônio)
  location_codigo TEXT,                          -- location.id
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  ultima_sync TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equip_cliente ON field.equipamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_equip_modelo ON field.equipamentos(modelo);
CREATE INDEX IF NOT EXISTS idx_equip_codigo_field ON field.equipamentos(codigo_field);
CREATE INDEX IF NOT EXISTS idx_equip_ativos ON field.equipamentos(cliente_id, modelo) WHERE archived = FALSE;

COMMENT ON TABLE field.equipamentos IS 'Cópia local dos equipamentos do Field Control (GET /equipments). modelo/cor derivados do name no ingest.';
COMMENT ON COLUMN field.equipamentos.modelo IS 'Linha do difusor (BRISA, SERENA, BRUMA...). NULL quando o equipamento foi nomeado pela localização física no Field.';

-- =========================================================================
-- upsert_equipamento — helper do sync. cliente_id é OPCIONAL (não levanta
-- exceção se o customer não estiver na base, ao contrário do upsert_os).
-- =========================================================================

CREATE OR REPLACE FUNCTION field.upsert_equipamento(
  p_codigo_field TEXT,
  p_cliente_codigo_field TEXT,
  p_nome TEXT,
  p_modelo TEXT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL,
  p_numero TEXT DEFAULT NULL,
  p_location_codigo TEXT DEFAULT NULL,
  p_archived BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_cliente_id UUID;
BEGIN
  IF p_cliente_codigo_field IS NOT NULL THEN
    SELECT id INTO v_cliente_id
    FROM field.clientes
    WHERE codigo_field = p_cliente_codigo_field;
  END IF;

  INSERT INTO field.equipamentos (
    codigo_field, cliente_id, cliente_codigo_field, nome, modelo, cor,
    numero, location_codigo, archived, ultima_sync
  )
  VALUES (
    p_codigo_field, v_cliente_id, p_cliente_codigo_field, p_nome, p_modelo, p_cor,
    p_numero, p_location_codigo, p_archived, NOW()
  )
  ON CONFLICT (codigo_field) DO UPDATE
  SET cliente_id = EXCLUDED.cliente_id,
      cliente_codigo_field = EXCLUDED.cliente_codigo_field,
      nome = EXCLUDED.nome,
      modelo = EXCLUDED.modelo,
      cor = EXCLUDED.cor,
      numero = EXCLUDED.numero,
      location_codigo = EXCLUDED.location_codigo,
      archived = EXCLUDED.archived,
      ultima_sync = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- v_inventario_modelo — frota agregada por modelo (a resposta de "quantas
-- brumas eu tenho"). Só clientes ATIVOS e equipamento NÃO-archived.
-- =========================================================================

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
GROUP BY COALESCE(eq.modelo, 'NÃO IDENTIFICADO')
ORDER BY total DESC;

COMMENT ON VIEW field.v_inventario_modelo IS 'Frota por modelo (clientes ativos, equip não-archived). modelo NULL => "NÃO IDENTIFICADO" (nomeado por localização no Field).';

-- =========================================================================
-- v_inventario_cliente — inventário por cliente: total + breakdown por modelo.
-- Só clientes ATIVOS com >=1 equipamento não-archived.
-- =========================================================================

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
GROUP BY c.id, c.codigo_field, c.nome
ORDER BY total_equipamentos DESC;

COMMENT ON VIEW field.v_inventario_cliente IS 'Inventário por cliente ativo: total_equipamentos + por_modelo (jsonb modelo->qtd). Só equip não-archived.';

-- =========================================================================
-- PERMISSÕES
-- =========================================================================

GRANT ALL ON field.equipamentos TO service_role;
GRANT SELECT ON field.equipamentos TO authenticated, anon;
GRANT SELECT ON field.v_inventario_modelo, field.v_inventario_cliente TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION field.upsert_equipamento(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

-- =========================================================================
-- FIM
-- =========================================================================
