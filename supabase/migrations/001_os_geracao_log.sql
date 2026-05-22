-- Migration: 001_os_geracao_log
-- Spec: integracao-clint-field-senses.md § 2
-- Apply manually via Supabase Dashboard → SQL Editor.

create table os_geracao_log (
  id uuid primary key default gen_random_uuid(),
  pipeline text not null,                     -- 'onboarding_remoto' | 'onboarding_presencial'
  clint_deal_id text not null,
  cliente_cnpj text not null,
  cliente_nome text not null,
  field_client_id text,
  contrato_inicio date not null,
  contrato_fim date not null,
  tipo_os text not null,                      -- 'envio_refil' | 'visita_tecnica'
  os_field_ids jsonb not null default '[]',   -- [{id, data, tipo}, ...]
  datas_geradas jsonb not null,               -- snapshot do cálculo
  total_os int not null default 0,
  disparado_por text not null,                -- email/ID do usuário Clint
  disparado_em timestamptz default now(),
  status text not null,                       -- 'success' | 'partial' | 'failed' | 'ignorado_checklist_incompleto' | 'ignorado_campos_incompletos' | 'ignorado_duplicado'
  erro text,
  tentativas int default 1
);

create unique index uq_log_deal on os_geracao_log (clint_deal_id) where status = 'success';
create index ix_log_cnpj on os_geracao_log (cliente_cnpj);
create index ix_log_pipeline on os_geracao_log (pipeline);
create index ix_log_status on os_geracao_log (status);
