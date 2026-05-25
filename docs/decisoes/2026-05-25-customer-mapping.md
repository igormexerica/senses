# Customer mapping: CNPJ → field_customer_id

**Data:** 2026-05-25
**Status:** ativo
**Sucede parcialmente:** [`2026-05-25-remove-n8n-direct-webhook.md`](./2026-05-25-remove-n8n-direct-webhook.md) — relaxa o requisito de a Clint preencher `field_customer_id` manualmente

---

## Contexto

A API do Field Control **não suporta filtros** (engenharia reversa de
2026-05-22 — `customerId`, `externalId`, `identifier`, `filter[document]`
são todos ignorados silenciosamente, retornando o catálogo inteiro). Sem
um lookup server-side por documento, a primeira versão do webhook exigia
que o time CS preenchesse `field_customer_id` manualmente em cada deal
da Clint — operacionalmente frágil (typo, esquecimento, ID errado).

## Decisão

**Plano B:** manter uma **mapping table local no Supabase** (CNPJ/CPF
normalizado → `field_customer_id`), populada via cron interno + endpoint
manual de re-sync. Webhook resolve o customer automaticamente; CS só
precisa garantir que o CNPJ está correto no deal.

### Schema

```sql
CREATE TABLE field_customer_mapping (
  document_number     text PRIMARY KEY,   -- só dígitos, sem máscara
  field_customer_id   text NOT NULL,      -- ID base64 do Field
  customer_name       text,
  primary_location_id text,               -- cacheia pra reduzir GETs
  last_synced_at      timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_fcm_field_customer_id ON field_customer_mapping (field_customer_id);
CREATE INDEX ix_fcm_last_synced_at    ON field_customer_mapping (last_synced_at);
```

`document_number` como PK garante upsert idempotente. Sem mascará: tudo
normalizado pra dígitos via `normalizeDocument()` (`src/lib/document.ts`).

### Sincronização

| Trigger | Quando | Como |
|---|---|---|
| Cron interno | hora-em-hora, minuto :05 (America/Sao_Paulo) | `registerCronJobs()` em `src/api/cron.ts` |
| Endpoint manual | sob demanda | `POST /api/v1/sync-customers` (auth X-Api-Key) |

O sync pagina `/customers` com `limit=100`, `offset` incrementando até
página vazia ou parcial. Pausa de 800ms entre páginas (rate limit
observado ~75 req/min). Customers sem `documentNumber` ou com formato
inválido (≠ 11 ou 14 dígitos após strip de máscara) vão pra contadores
`totalSkippedNoDocument` / `totalSkippedInvalidFormat` e ficam de fora.

Tempo típico com ~1300 customers: 10–15s.

### Resolução no webhook

```
Clint webhook recebe deal.custom_fields.cnpj (obrigatório).
                │
                ▼
    custom_fields.field_customer_id veio preenchido?
                │
        ┌───────┴───────┐
       sim              não
        │                │
        ▼                ▼
   usa direto       findFieldCustomerByDocument(cnpj)
   (fallback)            │
                  ┌──────┴──────┐
                achou        não achou
                  │              │
                  ▼              ▼
             cria OS    ignorado_customer_not_mapped
                        + log Supabase
                        + Telegram pro gestor
```

`field_customer_id` no payload da Clint vira **fallback opcional**, útil
quando um cliente acabou de ser cadastrado no Field e não foi
sincronizado ainda — o time CS preenche manual uma vez, e o cron pega
nos próximos 60min.

---

## Troubleshooting

### "Customer não mapeado" (status `ignorado_customer_not_mapped`)

Significa: webhook recebeu um CNPJ que não está em
`field_customer_mapping`. Possíveis causas:

1. **Cliente novo no Field, ainda não sincronizado.** Solução: rodar
   re-sync manual:
   ```bash
   curl -X POST -H "X-Api-Key: $API_INTERNAL_KEY" \
     https://senses-api.ifops.com.br/api/v1/sync-customers
   ```
   Resposta inclui `totalUpserted`, `durationMs`. Aí re-disparar o
   webhook.

2. **CNPJ digitado errado na Clint.** Conferir no painel da Clint vs.
   no Field. Mais comum em CNPJ com pontuação inconsistente — a
   normalização aceita qualquer máscara, mas dígitos errados ela não
   adivinha.

3. **Cliente não existe no Field.** Cadastrar primeiro no Field, rodar
   re-sync, retentar.

### Como rodar re-sync manualmente

```bash
# produção (Contabo)
curl -X POST -H "X-Api-Key: $API_INTERNAL_KEY" \
  https://senses-api.ifops.com.br/api/v1/sync-customers

# local
curl -X POST -H "X-Api-Key: $API_INTERNAL_KEY" \
  http://localhost:3000/api/v1/sync-customers
```

Resposta:
```json
{
  "totalScanned": 1259,
  "totalUpserted": 1247,
  "totalSkippedNoDocument": 8,
  "totalSkippedInvalidFormat": 4,
  "durationMs": 11342
}
```

### Inspecionar a tabela

```sql
SELECT count(*) FROM field_customer_mapping;
SELECT * FROM field_customer_mapping
  WHERE document_number = '12345678000190';   -- já normalizado
SELECT * FROM field_customer_mapping
  ORDER BY last_synced_at DESC LIMIT 10;     -- últimos mapeados
```

### Verificar que o cron está ativo

```bash
docker logs senses-os-api 2>&1 | grep cron_initialized
# {"cron":"field_customer_sync","expr":"5 * * * *","tz":"America/Sao_Paulo","msg":"cron_initialized"}

docker logs senses-os-api 2>&1 | grep "cron_sync_"
# ticks aparecem a cada hora no :05
```

O cron não dispara no startup do container — primeiro tick só depois do
próximo :05. Se quiser popular imediato após deploy, rodar
`POST /api/v1/sync-customers` uma vez.

---

## Trade-offs e alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Lookup direto no Field a cada webhook | API ignora filtros — teria que paginar 1300 customers a cada disparo (~10s + risco de rate limit). Inviável. |
| Cache em memória do microserviço | Perde no restart do container, hard de monitorar, sem auditoria. Mapping table dá tudo isso de graça. |
| Webhook IN do Field quando customer é criado | Field não expõe webhooks no plano atual (verificado painel 2026-05-22). |
| Sync mais frequente (a cada 10min) | Custo de 6× mais hits no Field. Hora-em-hora cobre o caso comum (cliente novo aparece poucas vezes por semana). Igor pode acelerar via endpoint manual quando precisar. |

## Próximas evoluções (não-bloqueantes)

- **Métrica de cache hit/miss** no log do webhook → permite acompanhar
  quantos disparos caem em `customer_not_mapped`.
- **Webhook auto-resync** quando customer not mapped: dispara sync
  on-the-fly e tenta de novo. Risco: latência > 5s pode estourar timeout
  da Clint. Manter manual por enquanto.
- **Index parcial em `customer_name`** se virar comum buscar por nome
  no Supabase Studio.
