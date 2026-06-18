# Comparativo de Performance — camada de dados

Backend do dashboard de 3 períodos. Grão diário no Postgres/Supabase; comparar
qualquer recorte (dia, quinzena, mês, trimestre) vira SQL parametrizado.

```
Nuvemshop /orders ─┐
                   ├─►  fato_diario (1 linha/dia)  ──►  funções SQL  ──►  rota Next  ──►  dashboard
GA4 Data API ──────┘    + fato_trafego_dia              (kpis_periodo …)
                        + fato_checkout_dia
```

**Regra que sustenta o resto:** financeiro e funil moram em colunas separadas e
são gravados por scripts diferentes, então um nunca sobrescreve o outro.
- `vendas`/`receita` = `NULL`→nunca rodou, `0`→carregado sem vendas (Nuvemshop).
- `visitas`/`carrinhos`/`checkouts` = `NULL`→sem GA4 naquele dia (o front mostra
  "sem dados" em vez de zero falso — é isso que protege os períodos antigos).

---

## 1. Pré-requisitos

```bash
pip install requests psycopg2-binary google-analytics-data python-dotenv
```

`.env` (ou variáveis de ambiente):

```env
DATABASE_URL=postgresql://user:senha@host:5432/postgres

# Nuvemshop
NUVEMSHOP_STORE_ID=000000
NUVEMSHOP_TOKEN=seu_access_token
NUVEMSHOP_APP_NAME=SensesBI
NUVEMSHOP_CONTACT_EMAIL=contato@gruposenses.com.br
# NUVEMSHOP_API_BASE=https://api.nuvemshop.com/v1   # default; ajuste se a sua loja usa outro

# GA4
GA4_PROPERTY_ID=123456789
GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json
```

GA4: crie uma service account, baixe o JSON e dê acesso de **Leitor** à propriedade
(Admin → Acesso à propriedade → adicionar o e-mail da service account).

---

## 2. Ordem de execução

```bash
# 1) cria tabelas e funções (uma vez)
psql "$DATABASE_URL" -f schema.sql

# 2) backfill financeiro — histórico completo da Nuvemshop entra sem problema
python ingest_nuvemshop.py --from 2026-04-01 --to 2026-06-16

# 3) backfill do funil — só entra onde o GA4 já coletava naquela data
python ingest_ga4.py --from 2026-04-01 --to 2026-06-16
```

Sem argumentos, os dois scripts processam **ontem** — formato pronto pra cron.

> **Sobre o backfill de abril/maio:** o passo 2 preenche o financeiro dos três
> meses. O passo 3 só preenche o funil dos dias em que o GA4 já estava instalado.
> Se o GA4 entrou depois de 01/04, abril/maio aparecem completos no financeiro e
> marcados "sem dados" no funil — exatamente como o protótipo já trata.

---

## 3. Cron (diário, ~6h, depois do fechamento do dia anterior)

```cron
0 6 * * *  cd /opt/senses-bi && /usr/bin/python ingest_nuvemshop.py >> logs/nuvem.log 2>&1
5 6 * * *  cd /opt/senses-bi && /usr/bin/python ingest_ga4.py       >> logs/ga4.log   2>&1
```

(ou PM2 com `cron_restart`, como nos seus outros agentes.)

---

## 4. Como o dashboard consome

A rota do Next chama as funções e devolve JSON pros cards/gráficos. Uma chamada
cobre os três períodos:

```sql
select 'P1' as periodo, * from analytics.kpis_periodo('2026-04-01','2026-04-16')
union all
select 'P2', * from analytics.kpis_periodo('2026-05-01','2026-05-16')
union all
select 'P3', * from analytics.kpis_periodo('2026-06-01','2026-06-16');
```

Outras seções:
- Origem do tráfego: `select * from analytics.trafego_periodo('2026-06-01','2026-06-16','origem');`
- Dispositivo: mesma função com `'dispositivo'`.
- Funil de checkout: `select * from analytics.checkout_retencao('2026-06-01','2026-06-16');`

Os deltas (P2/P1, P3/P2) o front calcula a partir dessas linhas — mesma lógica do
protótipo.

---

## 5. Confirme antes de confiar nos números

- **Eventos GA4:** no DebugView/Tempo real, veja quais a integração da Nuvemshop
  dispara. `add_to_cart`, `begin_checkout` e `purchase` costumam vir; `add_shipping_info`
  e `add_payment_info` dependem da versão — se faltarem, as etapas do meio do funil
  ficam vazias (o script não quebra, só avisa).
- **Consistência do funil:** as etapas Visitas→Carrinho→Checkout→Vendas vêm todas do
  GA4 (mesma régua). Os cards de **Receita/Vendas/Ticket** vêm da Nuvemshop, que é
  mais exata pro dinheiro — pequenas diferenças entre `purchase` (GA4) e pedidos pagos
  (Nuvemshop) são esperadas.
- **Fuso:** vendas são contadas por data de criação em America/Sao_Paulo, igual ao
  painel. Confira se o GA4 também está em horário de Brasília pra os dias baterem.
