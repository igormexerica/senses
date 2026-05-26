# Cadastro de Recorrências via Playwright (worker headless)

**Data:** 2026-05-26
**Status:** ativo
**Sucede em parte:** [`2026-05-25-remove-n8n-direct-webhook.md`](./2026-05-25-remove-n8n-direct-webhook.md) — adiciona DISPARO #2 + bifurcação via query string

---

## Contexto

A API REST oficial do Field Control **não expõe o recurso "Recorrências"**
— confirmado pelo suporte do Field em 26/05/2026. Recorrência é o modelo
nativo do Field pra repetir OS automaticamente (frequência, dia, ignorar
fim de semana). Sem REST, restam 3 opções:

1. **Criar N OS avulsas via POST /orders** (caminho original do projeto):
   funciona, mas perdemos os benefícios de Recorrência (CS não consegue
   pausar todas de uma vez no app, dashboards do Field tratam como OS
   isoladas, e a quantidade de POSTs estoura o rate-limit pra contratos
   longos).
2. **Esperar Field expor REST:** sem prazo informado pelo suporte.
3. **Automação de UI via Playwright:** funciona hoje, dá os benefícios
   nativos, custo = manter selectors quando UI mudar.

## Decisão

Opção 3. Worker dedicado (`senses-playwright-worker`) consumindo fila
BullMQ no Redis (`senses-redis`), separado do microserviço Fastify por
3 razões:

- **Isolamento de dependências:** imagem Playwright pesa ~1GB; não
  queremos cada deploy do microserviço puxar isso de novo.
- **Concorrência controlada:** semáforo natural via `concurrency: 1`
  do BullMQ — uma instância de Chromium por vez, evita carga no Field.
- **Crash isolado:** se o Chromium travar, o microserviço continua
  servindo `/health`, `/webhook/*`, etc.

```
Clint webhook → Fastify (gatilho=disparo_2)
                   │
                   ▼
       insertLog status='queued_recurrence'
                   │
                   ▼
       enqueueRecurrence (BullMQ → senses-redis)
                                       │
                                       ▼
                   ┌──────────────────────────────┐
                   │ senses-playwright-worker     │
                   │  - chromium headless          │
                   │  - storage state persistido   │
                   │  - 1 job/vez                  │
                   └──────────────┬───────────────┘
                                  │
                                  ▼
                       https://app.fieldcontrol.com.br
                       /#/recorrencias/novo
```

## Arquitetura do fluxo de 2 disparos

A Clint dispara webhooks em **etapas diferentes** do pipeline:

| Disparo | Etapa-gatilho (saída) | Ação |
|---|---|---|
| 1 | Checklist Comercial | Cria 1 OS "envio inicial" via REST `POST /orders`, data = HOJE |
| 2 | Definição de Fragrância | Enfileira criação de Recorrência no Field via Playwright |

Distinção por **query string** `?gatilho=disparo_1|disparo_2`. Igor
configura 4 webhooks na Clint (2 pipelines × 2 disparos), todos
apontando pras 2 mesmas rotas existentes (`/api/v1/webhook/clint/onboarding-{remoto,presencial}`)
com a query string adequada.

**Stage check virou advisory:** antes o webhook bloqueava se
`deal.stage !== "Boas-Vindas"`. Agora só loga warn — o `gatilho` na URL
é a fonte de verdade.

## Trade-offs aceitos

| Risco | Mitigação |
|---|---|
| UI do Field muda → selectors quebram | Locators por label/role (não CSS). Screenshot automático + log em qualquer falha. Telegram alerta gestor. Igor revisa locators e re-deploya. |
| CAPTCHA aparece no login | Worker aborta + Telegram. Igor loga manualmente uma vez, storage state cacheia cookies por dias. |
| Sessão expira | `isLoggedIn()` testa antes de cada job. Se falhou, relogin automático + saveState. |
| Rate-limit Field | Concorrência 1 + retries com backoff (5s, 30s). |
| Job órfão na fila (worker down) | BullMQ persiste no Redis com volume; retoma quando worker subir. `removeOnComplete` mantém 1000 últimos por 7 dias pra auditoria. |

## Operação

### Subir o stack

```bash
# Pré-requisito: rede senses_default existe (já tem)
docker compose -f docker-compose.redis.yml up -d
docker compose -f docker-compose.playwright.yml up -d

# Verifica
docker ps --filter "name=senses-redis" --filter "name=senses-playwright-worker"
docker logs senses-playwright-worker --tail 30
```

### Atualizar credenciais do Field

```bash
nano /root/.field-login.env       # FIELD_LOGIN_EMAIL, FIELD_LOGIN_PASSWORD
docker compose -f docker-compose.playwright.yml restart senses-playwright-worker
```

Não precisa rebuildar a imagem — env_file é remontado no restart.

### Forçar relogin (rotacionar storage state)

Útil quando a Field mudou política de sessão ou suspeitamos de cookies
corrompidos:

```bash
docker compose -f docker-compose.playwright.yml down
docker volume rm senses_playwright_state
docker compose -f docker-compose.playwright.yml up -d
```

Próximo job vai falhar `isLoggedIn()`, refazer login, salvar novo state.

### Debug de falha (screenshot)

Todo job que falhar em qualquer etapa do `createRecurrence` tira
screenshot full-page antes de re-throw:

```bash
docker run --rm \
  -v senses_playwright_failures:/data \
  -v /tmp:/out \
  alpine cp -r /data /out/playwright-failures-$(date +%Y%m%d)
ls -la /tmp/playwright-failures-*/
```

Cada arquivo nomeado `${dealId}-${timestamp}.png`.

### Validar nome do tipo de OS no Field

Os nomes em `FIELD_SERVICE_NAMES` (em `src/lib/field-control.ts`) são
**placeholders** até serem confirmados na UI:

```ts
REMOTO_ENVIO_RECARGA:    'ENVIO BIMESTRAL DE RECARGA'
PRESENCIAL_MANUTENCAO:   'MANUTENÇÃO MENSAL'
```

Se a UI exibir nome diferente (variação de acento, plural, capitalização),
o `getByRole('option', { name: ... })` do worker não vai casar e o job
falha em `screenshot.png` mostrando dropdown aberto sem seleção. Conferir
abrindo manualmente https://app.fieldcontrol.com.br/#/recorrencias/novo e
ajustar a constante.

## Limitações conhecidas

- **Sem extração robusta do `field_recurrence_id`:** o regex pós-submit
  tenta `recorrencias/[base64]` na URL. Se o Field não navegar pra URL
  específica (volta pra listagem, por ex.), o ID fica `undefined`.
  Workaround manual: cruzar `created_at` na listagem do Field.
- **Headful debug:** `PLAYWRIGHT_HEADLESS=false` no `.env.playwright`
  + montar `:0` do host só funciona em ambiente com display. Em
  produção sempre headless.

## Estado pós-deploy esperado

```bash
$ docker ps --filter "name=senses-" --format "table {{.Names}}\t{{.Status}}"
NAMES                        STATUS
senses-os-api                Up (healthy)
senses-redis                 Up (healthy)
senses-playwright-worker     Up (healthy)
cloudflared                  Up

$ docker logs senses-playwright-worker --tail 5
{"level":30,"service":"senses-playwright-worker","queue":"field-recurrences","concurrency":1,"headless":true,"msg":"worker_started"}
```
