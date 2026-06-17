-- =====================================================================
-- Comparativo de Performance — camada de dados (Postgres / Supabase)
-- Grão diário: 1 linha por dia. Comparar qualquer período vira SQL trivial.
--
-- Separação de fontes (os dois scripts nunca se sobrescrevem):
--   • Financeiro (vendas, receita) -> Nuvemshop /orders
--   • Funil (visitas, carrinhos, checkouts, etapas) -> GA4
--
-- Convenção de NULL:
--   • visitas/carrinhos/checkouts = NULL  -> dia sem GA4 (mostra "sem dados")
--   • vendas/receita = 0                  -> dia carregado, sem vendas reais
-- =====================================================================

create schema if not exists analytics;

-- 1) Fato diário ------------------------------------------------------
create table if not exists analytics.fato_diario (
  data            date primary key,
  -- funil (GA4)
  visitas         integer,        -- sessions
  carrinhos       integer,        -- evento add_to_cart
  checkouts       integer,        -- evento begin_checkout
  -- financeiro (Nuvemshop)
  vendas          integer,        -- pedidos pagos e não cancelados
  receita         numeric(14,2),  -- soma do total dos pedidos pagos (BRL)
  -- meta
  fonte_funil     text,           -- 'ga4' quando o funil foi carregado
  atualizado_em   timestamptz not null default now()
);

-- 2) Tráfego por dia (origem + dispositivo, formato longo) ------------
--    formato longo = adicionar novas dimensões GA4 depois sem mudar schema
create table if not exists analytics.fato_trafego_dia (
  data        date    not null,
  dimensao    text    not null,   -- 'origem' | 'dispositivo'
  valor       text    not null,   -- 'Busca','Direto',... | 'mobile','desktop','tablet'
  visitas     integer not null default 0,
  primary key (data, dimensao, valor)
);

-- 3) Funil de checkout por dia (eventos GA4) -------------------------
create table if not exists analytics.fato_checkout_dia (
  data      date    not null,
  etapa     text    not null,     -- 'begin_checkout','add_shipping_info','add_payment_info','purchase'
  eventos   integer not null default 0,
  primary key (data, etapa)
);

create index if not exists ix_trafego_dim   on analytics.fato_trafego_dia  (dimensao, data);
create index if not exists ix_checkout_etapa on analytics.fato_checkout_dia (etapa, data);

-- =====================================================================
-- Função: KPIs agregados de um período (1 linha)
-- A dashboard chama isto 1x por período. Deltas são P2/P1, P3/P2 no front
-- (ou via outra query). media_*_dia serve p/ comparar períodos de tamanhos
-- diferentes de forma justa.
-- =====================================================================
create or replace function analytics.kpis_periodo(d_ini date, d_fim date)
returns table (
  dias                  integer,
  visitas               bigint,
  carrinhos             bigint,
  checkouts             bigint,
  vendas                bigint,
  receita               numeric,
  ticket_medio          numeric,   -- receita / vendas
  taxa_conversao        numeric,   -- vendas / visitas (%)
  taxa_carrinho         numeric,   -- carrinhos / visitas (%)
  taxa_inicio_checkout  numeric,   -- checkouts / visitas (%)
  taxa_conclusao        numeric,   -- vendas / checkouts (%) — proxy de (1 - abandono)
  media_visitas_dia     numeric,
  media_receita_dia     numeric
)
language sql stable as $$
  select
    (d_fim - d_ini + 1)                                       as dias,
    sum(visitas)                                              as visitas,
    sum(carrinhos)                                            as carrinhos,
    sum(checkouts)                                            as checkouts,
    sum(vendas)                                               as vendas,
    coalesce(sum(receita),0)                                  as receita,
    round(sum(receita) / nullif(sum(vendas),0), 2)            as ticket_medio,
    round(100.0*sum(vendas)    / nullif(sum(visitas),0), 2)   as taxa_conversao,
    round(100.0*sum(carrinhos) / nullif(sum(visitas),0), 2)   as taxa_carrinho,
    round(100.0*sum(checkouts) / nullif(sum(visitas),0), 2)   as taxa_inicio_checkout,
    round(100.0*sum(vendas)    / nullif(sum(checkouts),0), 2) as taxa_conclusao,
    round(sum(visitas)::numeric / nullif((d_fim - d_ini + 1),0), 1) as media_visitas_dia,
    round(sum(receita)          / nullif((d_fim - d_ini + 1),0), 2) as media_receita_dia
  from analytics.fato_diario
  where data between d_ini and d_fim;
$$;

-- Exemplo — os 3 períodos numa tacada (é isto que a rota do Next vai rodar):
--   select 'P1 abr' as periodo, * from analytics.kpis_periodo('2026-04-01','2026-04-16')
--   union all
--   select 'P2 mai', * from analytics.kpis_periodo('2026-05-01','2026-05-16')
--   union all
--   select 'P3 jun', * from analytics.kpis_periodo('2026-06-01','2026-06-16');

-- =====================================================================
-- Função: tráfego por período (origem OU dispositivo), já com %
-- =====================================================================
create or replace function analytics.trafego_periodo(d_ini date, d_fim date, p_dimensao text)
returns table (valor text, visitas bigint, pct numeric)
language sql stable as $$
  with t as (
    select valor, sum(visitas) as v
    from analytics.fato_trafego_dia
    where dimensao = p_dimensao and data between d_ini and d_fim
    group by valor
  )
  select valor, v, round(100.0 * v / nullif(sum(v) over (), 0), 1)
  from t
  order by v desc;
$$;

-- =====================================================================
-- Função: retenção do checkout por período (% do begin_checkout)
-- =====================================================================
create or replace function analytics.checkout_retencao(d_ini date, d_fim date)
returns table (etapa text, eventos bigint, pct_do_inicio numeric)
language sql stable as $$
  with c as (
    select etapa, sum(eventos) as e
    from analytics.fato_checkout_dia
    where data between d_ini and d_fim
    group by etapa
  ),
  base as (select e from c where etapa = 'begin_checkout')
  select etapa, e, round(100.0 * e / nullif((select e from base), 0), 1)
  from c
  order by case etapa
    when 'begin_checkout'    then 1
    when 'add_shipping_info' then 2
    when 'add_payment_info'  then 3
    when 'purchase'          then 4
    else 5
  end;
$$;
