-- =========================================================================
-- Field Control Dashboard - Schema base
-- Senses Olfacts | CS Operations
-- =========================================================================
-- Rode esse arquivo PRIMEIRO. Cria schema, tipos, tabelas, índices e triggers.
-- Não tem views nem functions aqui - estão nos arquivos 02 e 03.
-- =========================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- busca textual em comentários

-- Schema isolado pra não misturar com auth, storage e outras schemas do Supabase
CREATE SCHEMA IF NOT EXISTS field;
SET search_path TO field, public;

-- =========================================================================
-- TIPOS ENUM
-- =========================================================================

CREATE TYPE field.escopo_etiqueta AS ENUM ('cliente', 'os');

CREATE TYPE field.tipo_expectativa AS ENUM ('visita', 'refil');

CREATE TYPE field.status_expectativa AS ENUM (
  'pendente',                  -- esperada, mas nenhuma OS criada
  'em_execucao',               -- tem OS, mas refil sem código de rastreio
  'atendida',                  -- visita concluída
  'atendida_com_rastreio'      -- refil concluído com rastreio
);

CREATE TYPE field.criticidade AS ENUM ('critico', 'alto', 'medio', 'estavel');

-- =========================================================================
-- CLIENTES
-- =========================================================================

CREATE TABLE field.clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_field TEXT UNIQUE NOT NULL,           -- id do Field Control
  nome TEXT NOT NULL,
  data_inicio_contrato DATE,                   -- usado pra audit de jornada
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ultima_sync TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clientes_ativo ON field.clientes(ativo) WHERE ativo = TRUE;
CREATE INDEX idx_clientes_codigo_field ON field.clientes(codigo_field);
CREATE INDEX idx_clientes_data_inicio ON field.clientes(data_inicio_contrato);

COMMENT ON TABLE field.clientes IS 'Cópia local dos clientes do Field Control, sincronizada via n8n';
COMMENT ON COLUMN field.clientes.codigo_field IS 'ID original do cliente no Field Control - usado para sync';

-- =========================================================================
-- ETIQUETAS (tabela única com escopo cliente|os)
-- =========================================================================

CREATE TABLE field.etiquetas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_field TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  escopo field.escopo_etiqueta NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_etiquetas_escopo ON field.etiquetas(escopo);
CREATE INDEX idx_etiquetas_nome ON field.etiquetas(nome);

COMMENT ON COLUMN field.etiquetas.escopo IS 'cliente: tag persistente do cliente (presencial, premium, onboarding). os: tag situacional da OS (troca, retorno)';

-- =========================================================================
-- CLIENTE_ETIQUETAS (M:N entre clientes e etiquetas de escopo cliente)
-- =========================================================================

CREATE TABLE field.cliente_etiquetas (
  cliente_id UUID NOT NULL REFERENCES field.clientes(id) ON DELETE CASCADE,
  etiqueta_id UUID NOT NULL REFERENCES field.etiquetas(id) ON DELETE CASCADE,
  aplicada_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cliente_id, etiqueta_id)
);

CREATE INDEX idx_cliente_etiquetas_etiqueta ON field.cliente_etiquetas(etiqueta_id);

-- =========================================================================
-- ORDENS DE SERVIÇO
-- =========================================================================

CREATE TABLE field.ordens_servico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_field TEXT UNIQUE NOT NULL,
  cliente_id UUID REFERENCES field.clientes(id),
  tipo TEXT,                                   -- "visita", "refil", etc - vem do Field
  status TEXT,                                 -- status do Field: "concluida", "em_andamento", ...
  mes_referencia DATE NOT NULL,                -- sempre dia 1 do mês (truncado)
  criada_em TIMESTAMPTZ,
  concluida_em TIMESTAMPTZ,
  ultima_sync TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_os_cliente ON field.ordens_servico(cliente_id);
CREATE INDEX idx_os_mes ON field.ordens_servico(mes_referencia);
CREATE INDEX idx_os_cliente_mes ON field.ordens_servico(cliente_id, mes_referencia);
CREATE INDEX idx_os_tipo ON field.ordens_servico(tipo);
CREATE INDEX idx_os_status ON field.ordens_servico(status);

COMMENT ON COLUMN field.ordens_servico.mes_referencia IS 'Primeiro dia do mês a que a OS pertence - usado pro matching com expectativas';

-- =========================================================================
-- OS_ETIQUETAS (M:N entre OS e etiquetas de escopo os)
-- =========================================================================

CREATE TABLE field.os_etiquetas (
  os_id UUID NOT NULL REFERENCES field.ordens_servico(id) ON DELETE CASCADE,
  etiqueta_id UUID NOT NULL REFERENCES field.etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (os_id, etiqueta_id)
);

CREATE INDEX idx_os_etiquetas_etiqueta ON field.os_etiquetas(etiqueta_id);

-- =========================================================================
-- RESPOSTAS DE FORMULÁRIO (onde mora o código de rastreio)
-- =========================================================================

CREATE TABLE field.respostas_form (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  os_id UUID NOT NULL REFERENCES field.ordens_servico(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,                         -- nome do campo no formulário do Field
  valor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_respostas_os ON field.respostas_form(os_id);
CREATE INDEX idx_respostas_campo ON field.respostas_form(campo);

-- Índice parcial otimizado pra encontrar rastreios rapidamente
CREATE INDEX idx_respostas_rastreio ON field.respostas_form(os_id, valor)
  WHERE campo ILIKE '%rastreio%' OR campo ILIKE '%rastreamento%';

COMMENT ON TABLE field.respostas_form IS 'Respostas dos formulários customizados das OS. Código de rastreio do refil mora aqui.';

-- =========================================================================
-- AVALIAÇÕES
-- =========================================================================

CREATE TABLE field.avaliacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_field TEXT UNIQUE,
  os_id UUID UNIQUE REFERENCES field.ordens_servico(id) ON DELETE CASCADE,
  nota INTEGER CHECK (nota BETWEEN 0 AND 5),
  comentario TEXT,
  data_avaliacao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_avaliacoes_nota ON field.avaliacoes(nota);
CREATE INDEX idx_avaliacoes_nota_baixa ON field.avaliacoes(nota, data_avaliacao DESC) WHERE nota <= 3;
CREATE INDEX idx_avaliacoes_data ON field.avaliacoes(data_avaliacao DESC);

-- Busca textual rápida nos comentários (pg_trgm)
CREATE INDEX idx_avaliacoes_comentario_trgm ON field.avaliacoes USING gin(comentario gin_trgm_ops);

-- =========================================================================
-- COMENTÁRIOS TÉCNICOS
-- =========================================================================

CREATE TABLE field.comentarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_field TEXT UNIQUE,
  os_id UUID NOT NULL REFERENCES field.ordens_servico(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  autor TEXT,
  data_comentario TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comentarios_os ON field.comentarios(os_id);
CREATE INDEX idx_comentarios_data ON field.comentarios(data_comentario DESC);
CREATE INDEX idx_comentarios_texto_trgm ON field.comentarios USING gin(texto gin_trgm_ops);

-- =========================================================================
-- EXPECTATIVAS (a tabela calculada que não existe no Field)
-- =========================================================================

CREATE TABLE field.expectativas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES field.clientes(id),
  tipo field.tipo_expectativa NOT NULL,
  mes_referencia DATE NOT NULL,                -- primeiro dia do mês
  status field.status_expectativa NOT NULL DEFAULT 'pendente',
  os_atendendo UUID REFERENCES field.ordens_servico(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cliente_id, tipo, mes_referencia)
);

CREATE INDEX idx_expectativas_mes_status ON field.expectativas(mes_referencia, status);
CREATE INDEX idx_expectativas_cliente ON field.expectativas(cliente_id);
CREATE INDEX idx_expectativas_pendentes ON field.expectativas(mes_referencia, tipo)
  WHERE status IN ('pendente', 'em_execucao');

COMMENT ON TABLE field.expectativas IS 'Calculada do nosso lado: 1 visita/mês por cliente presencial, 1 refil em meses ímpares por cliente remoto';

-- =========================================================================
-- CLASSIFICAÇÃO DO AGENTE (saída da análise do Claude)
-- =========================================================================

CREATE TABLE field.classificacao_agente (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fonte_tipo TEXT NOT NULL,                    -- 'avaliacao', 'comentario', 'jornada_audit', 'gap'
  fonte_id UUID NOT NULL,
  criticidade field.criticidade,
  acao_sugerida TEXT,
  sumario TEXT,
  alertou_em TIMESTAMPTZ,                      -- quando o Telegram disparou
  processado_em TIMESTAMPTZ DEFAULT NOW(),
  modelo TEXT DEFAULT 'claude-sonnet-4-7'
);

CREATE INDEX idx_classificacao_fonte ON field.classificacao_agente(fonte_tipo, fonte_id);
CREATE INDEX idx_classificacao_criticas ON field.classificacao_agente(processado_em DESC)
  WHERE criticidade IN ('critico', 'alto');
CREATE INDEX idx_classificacao_pendente_alerta ON field.classificacao_agente(processado_em)
  WHERE criticidade = 'critico' AND alertou_em IS NULL;

-- =========================================================================
-- SYNC STATE (registro de quando rodou cada sync — controle do n8n)
-- =========================================================================

CREATE TABLE field.sync_state (
  recurso TEXT PRIMARY KEY,                    -- 'clientes', 'ordens_servico', 'etiquetas', ...
  ultimo_sync_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_updated_at TIMESTAMPTZ,               -- maior updated_at processado do Field
  registros_processados INT DEFAULT 0,
  erro TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE field.sync_state IS 'Controle de incremental sync: cada workflow do n8n atualiza aqui o último updated_at processado';

-- =========================================================================
-- TRIGGERS para updated_at automático
-- =========================================================================

CREATE OR REPLACE FUNCTION field.tg_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON field.clientes
  FOR EACH ROW EXECUTE FUNCTION field.tg_updated_at();

CREATE TRIGGER trg_os_updated_at
  BEFORE UPDATE ON field.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION field.tg_updated_at();

CREATE TRIGGER trg_expectativas_updated_at
  BEFORE UPDATE ON field.expectativas
  FOR EACH ROW EXECUTE FUNCTION field.tg_updated_at();

CREATE TRIGGER trg_sync_state_updated_at
  BEFORE UPDATE ON field.sync_state
  FOR EACH ROW EXECUTE FUNCTION field.tg_updated_at();

-- =========================================================================
-- PERMISSÕES
-- =========================================================================
-- Garante que o role anon (Supabase) e o service_role tenham acesso

GRANT USAGE ON SCHEMA field TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA field TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA field TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA field TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA field TO service_role, authenticated;

-- Para tabelas criadas no futuro, mesma regra
ALTER DEFAULT PRIVILEGES IN SCHEMA field GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA field GRANT SELECT ON TABLES TO authenticated;

-- =========================================================================
-- FIM
-- =========================================================================
-- Próximo passo: rodar 02-views.sql
