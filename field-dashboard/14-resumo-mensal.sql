-- =========================================================================
-- Field Control Dashboard - Resumo Executivo Mensal (tela /resumo)
-- Rode DEPOIS dos arquivos anteriores. Idempotente (CREATE OR REPLACE).
-- =========================================================================
-- Duas views novas pra alimentar a tela de apresentação da gestora:
--   v_ativacoes_mes            -> Bloco 1 (Ativações no mês)
--   v_apontamentos_por_tag_mes -> Bloco 2 (Apontamentos por tag)
-- O Bloco 3 (Cobertura) reusa v_evolucao_mensal (já existe).
-- =========================================================================

SET search_path TO field, public;

-- =========================================================================
-- v_ativacoes_mes — "Ativações no mês" (métrica-destaque da tela).
-- Definição confirmada nos dados (ver DESCOBERTAS-API.md, decisão "ativada"):
--   ativação = cliente distinto com OS de INSTALAÇÃO (presencial/remota/piloto)
--   OU PRIMEIRO ENVIO, do mês, JÁ CONCLUÍDA.
-- IMPORTANTE: agrupa por `mes_referencia` = mês PLANEJADO (scheduling.date), a MESMA
-- convenção de cobertura/gaps/expectativas (consistência dentro da tela). O filtro
-- status concluída é um predicado (só conta o que já rolou), não o mês de conclusão —
-- uma OS planejada p/ maio e concluída em junho conta em MAIO, como no resto do dash.
-- COUNT(DISTINCT cliente_id) dedup por cliente: o cliente remoto costuma ter
-- INSTALAÇÃO REMOTA e PRIMEIRO ENVIO no mesmo mês (59 sobreposições observadas)
-- → somar contaria 2x. Conta CLIENTES/OS, não unidades físicas de máquina
-- (não há vínculo OS→equipamento na API do Field).
-- =========================================================================

CREATE OR REPLACE VIEW field.v_ativacoes_mes AS
SELECT
  o.mes_referencia,
  COUNT(DISTINCT o.cliente_id) AS ativacoes
FROM field.ordens_servico o
WHERE o.status ILIKE '%conclu%'
  AND o.cliente_id IS NOT NULL
  AND o.tipo IN (
    'INSTALAÇÃO PRESENCIAL',
    'INSTALAÇÃO REMOTA',
    'INSTALAÇÃO CONTRATO PILOTO',
    'INSTALAÇÃO CONTRATO PILOTO REMOTO',
    'PRIMEIRO ENVIO'
  )
GROUP BY o.mes_referencia;

COMMENT ON VIEW field.v_ativacoes_mes IS
  'Ativações/mês = clientes distintos com instalação (presencial/remota/piloto) OU primeiro envio, do mês (mes_referencia=planejado), já concluído. Dedup por cliente. Conta clientes/OS, não unidades físicas.';

-- =========================================================================
-- v_apontamentos_por_tag_mes — Bloco 2. Contagem de OS por tag (etiqueta
-- escopo='os') por mês. 1 apontamento = 1 OS com aquela tag. O front soma p/
-- o total e ordena desc. Inclui tags de período ("02/2026","maio/junho") que
-- são rótulos de lote, não apontamentos operacionais — o front filtra essas
-- (contêm "/"). Mantidas aqui pra view ficar fiel aos dados.
-- =========================================================================

CREATE OR REPLACE VIEW field.v_apontamentos_por_tag_mes AS
SELECT
  o.mes_referencia,
  e.nome AS tag,
  COUNT(DISTINCT oe.os_id) AS qtd
FROM field.ordens_servico o
JOIN field.os_etiquetas oe ON oe.os_id = o.id
JOIN field.etiquetas e ON e.id = oe.etiqueta_id AND e.escopo = 'os'
GROUP BY o.mes_referencia, e.nome;

COMMENT ON VIEW field.v_apontamentos_por_tag_mes IS
  'Apontamentos por tag de OS (escopo os) por mês. Inclui tags de período (rótulos de lote) que o front filtra. qtd = OS distintas com a tag.';

-- =========================================================================
-- PERMISSÕES — só service_role/authenticated (o dashboard lê via service_role;
-- anon perdeu SELECT no schema field no 11-lockdown.sql — NÃO re-expor).
-- =========================================================================

GRANT SELECT ON field.v_ativacoes_mes, field.v_apontamentos_por_tag_mes
  TO service_role, authenticated;

-- =========================================================================
-- FIM
-- =========================================================================
