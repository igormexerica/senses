-- =====================================================================
-- ROI / Investimentos — schema adicional (NÃO altera schema.sql original).
-- Investimentos (recorrentes + pontuais) cruzados com a receita de fato_diario
-- pra calcular ROI mensal e acumulado (evolução / payback).
-- =====================================================================

create table if not exists analytics.investimentos (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('recorrente','pontual')),
  fornecedor   text not null,
  descricao    text,
  valor        numeric(14,2) not null check (valor >= 0),
  vigencia_ini date not null,          -- mês (dia 1) de início / competência
  vigencia_fim date,                   -- recorrente: fim (null = em aberto); pontual: = vigencia_ini
  criado_em    timestamptz not null default now()
);
create index if not exists ix_investimentos_tipo on analytics.investimentos (tipo, vigencia_ini);

-- config chave-valor (ex.: margem_pct = margem de contribuição %)
create table if not exists analytics.bi_config (
  chave         text primary key,
  valor         numeric,
  atualizado_em timestamptz not null default now()
);

-- Evolução mensal: receita (fato_diario) × investimento (recorrentes vigentes +
-- pontuais do mês), com acumulados. ROI/lucro o server calcula a partir disto.
create or replace view analytics.v_roi_mensal as
with meses as (
  select generate_series(
    coalesce(date_trunc('month', (select min(data) from analytics.fato_diario)),
             date_trunc('month', now())),
    date_trunc('month', now()),
    interval '1 month'
  )::date as mes
),
rec as (
  select date_trunc('month', data)::date as mes, sum(coalesce(receita,0)) as receita
  from analytics.fato_diario
  group by 1
),
inv as (
  select m.mes,
    coalesce((select sum(i.valor) from analytics.investimentos i
       where i.tipo = 'recorrente'
         and date_trunc('month', i.vigencia_ini) <= m.mes
         and m.mes <= coalesce(date_trunc('month', i.vigencia_fim), m.mes)), 0)
    + coalesce((select sum(p.valor) from analytics.investimentos p
       where p.tipo = 'pontual'
         and date_trunc('month', p.vigencia_ini) = m.mes), 0) as investimento
  from meses m
)
select
  m.mes,
  coalesce(r.receita, 0)                              as receita,
  inv.investimento                                    as investimento,
  sum(coalesce(r.receita, 0)) over (order by m.mes)   as receita_acum,
  sum(inv.investimento)       over (order by m.mes)   as investimento_acum
from meses m
left join rec r  on r.mes  = m.mes
join      inv    on inv.mes = m.mes
order by m.mes;
