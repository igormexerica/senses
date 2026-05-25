# Remoção do n8n e adoção de webhook direto no microserviço

**Data:** 2026-05-25
**Status:** ativo
**Sucede:** [`2026-05-25-n8n-setup.md`](./2026-05-25-n8n-setup.md) (n8n self-hosted, decisão revertida no mesmo dia)

---

## Contexto

Sexta-feira (2026-05-22) subimos n8n self-hosted no Contabo exposto via
Cloudflare Tunnel. A intenção era orquestrar os webhooks da Clint, validar
checklist e disparar a criação de OS no Field via HTTP request pro
microserviço `senses-os-api`.

Hoje, antes de criar qualquer workflow no n8n, questionei o valor real
dessa camada extra pro nosso caso de uso: **um único dev (eu), operação
Senses, 2 webhooks com lógica que já existe versionada e testada em
TypeScript**. O microserviço Fastify (`senses-os-api`) já tem schemas Zod,
testes vitest, atomic deploy via Docker, idempotência no Supabase — toda
a maturidade de plataforma que o n8n traz, eu já tinha em código.

## Decisão

Remover o n8n. Expor o microserviço `senses-os-api` diretamente pra Clint
via webhook em `senses-api.ifops.com.br`, no mesmo Cloudflare Tunnel já
configurado.

### Por que isso resolve sem perder nada

| Função do n8n | Onde fica agora |
|---|---|
| Receber webhook HTTP | rota `POST /api/v1/webhook/clint/onboarding-*` no Fastify |
| Validar checklist / stage / campos | função `handleWebhook` em `src/api/routes/webhook-clint.ts` |
| Auditoria de "disparos ignorados" | `logIgnorado()` no Supabase (já existia) |
| Idempotência | `checkIdempotency()` no Supabase (unique partial index em `clint_deal_id` WHERE `status='success'`, já existia) |
| Cron / watchdog semanal | TBD — fica em backlog. Primeira opção: `node-cron` dentro do mesmo microserviço, ou GitHub Actions schedule, ou Cloudflare Cron Triggers. Decisão quando virar real. |

### Vantagens medidas

- **−250 MB RAM** na VPS (n8n usa ~200 MB + Node node_modules)
- **−1 container** pra monitorar (n8n)
- **−1 banco SQLite** pra fazer backup (volume `n8n_data`)
- **Lógica versionada no git** — auditoria, code review, rollback granular
- **Testável** — `npm test` cobre fluxo completo; nada de "abrir UI e clicar"
- **Sem UI extra pra manter** — owner setup, RBAC, atualização do n8n, etc.

### Custo / trade-off

- Cron/scheduler ainda não está implementado. Quando precisar do watchdog
  semanal, adicionar como código (não voltar pro n8n só por isso).
- Mudanças no fluxo exigem deploy do container — não dá pra editar pela UI.
  Pro nosso caso (uma pessoa, mudanças raras), isso é vantagem, não custo.

---

## Configuração na Clint

Em ambas as pipelines (Onboarding Remoto e Onboarding Presencial):

```
Configurações da origem → Integrações → Nova integração → Enviar Webhook
Gatilho: "Negócio entrou na etapa"
Etapa:   "Boas-Vindas"

URL (Remoto):     https://senses-api.ifops.com.br/api/v1/webhook/clint/onboarding-remoto
URL (Presencial): https://senses-api.ifops.com.br/api/v1/webhook/clint/onboarding-presencial

Método: POST
Headers:
  Content-Type: application/json
  X-Webhook-Secret: <valor do WEBHOOK_SECRET no .env do microserviço>

Mapeamento: enviar TODOS os campos do negócio + checklist + dados do contato + usuário que disparou
```

## Schema do payload esperado

Ver `src/api/schemas/webhook-clint.ts`. Resumo:

```json
{
  "deal": {
    "id": "deal_abc123",
    "stage": "Boas-Vindas",
    "custom_fields": {
      "cnpj": "12345678000190",
      "cliente_nome_razao": "Indústria Tal S/A",
      "contrato_inicio": "2026-02-15",
      "contrato_fim": "2027-02-15",
      "field_customer_id": "MTIzNDU2Nzg5MA==",
      "endereco_completo": "...",
      "telefone_contato": "...",
      "email_contato": "...",
      "tecnico_padrao_id": "..."
    },
    "checklist": [
      { "item": "Boas-vindas enviadas", "done": true }
    ]
  },
  "contact":      { "name": "...", "email": "...", "phone": "..." },
  "triggered_by": { "user_id": "...", "user_email": "cs1@senses.com.br" },
  "triggered_at": "2026-05-25T14:30:00-03:00"
}
```

**Campos obrigatórios** pra disparar criação de OS: `cnpj`,
`cliente_nome_razao`, `contrato_inicio` (YYYY-MM-DD), `contrato_fim`
(YYYY-MM-DD), `field_customer_id`. Faltando qualquer um → status
`ignorado_campos_incompletos` + log no Supabase + alerta no Telegram pro
gestor (best-effort).

## Respostas possíveis

Sempre HTTP 200 (exceto 400 em payload mal-formado e 502 em falha do Field):

```json
{ "clintDealId": "...", "pipeline": "onboarding_remoto", "outcome": { "status": "success", "totalOs": 7, "createdOrderIds": [...] } }
{ "outcome": { "status": "ignorado_duplicado" } }
{ "outcome": { "status": "ignorado_etapa_errada", "stageRecebido": "..." } }
{ "outcome": { "status": "ignorado_checklist_incompleto", "itensFaltando": [...] } }
{ "outcome": { "status": "ignorado_campos_incompletos", "camposFaltando": [...] } }
{ "outcome": { "status": "failed", "totalOs": N, "createdOrderIds": [...], "motivo": "..." } }
```

---

## Segurança

### MVP atual: token compartilhado (X-Webhook-Secret)

- Header `X-Webhook-Secret` contém um secret de 64 hex chars
  (`openssl rand -hex 32`).
- Validação em tempo constante via `crypto.timingSafeEqual` pra evitar
  timing attacks.
- Sem header → 401. Header inválido → 403.
- Secret vive em `WEBHOOK_SECRET` no `.env` do microserviço (chmod 600).

### Próximo passo (quando confirmar suporte da Clint): HMAC

HMAC-SHA256 é estritamente melhor que token compartilhado:
- Cliente computa `HMAC(secret, request_body)` e envia em `X-Webhook-Signature`.
- Servidor recomputa e compara em tempo constante.
- Vantagem: garante que o **body** não foi alterado em trânsito (token
  compartilhado só prova que o caller conhece o secret).

Quando a Clint suportar (verificar painel da Clint > Integrações), trocar
`webhook-auth.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const provided = req.headers['x-webhook-signature'] as string;
const expected = createHmac('sha256', env.WEBHOOK_SECRET).update(rawBody).digest('hex');
if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return reply.code(403)...
```

Exige acessar o `rawBody` no Fastify (`onRequest` é cedo demais — usar
`preParsing` ou content-type parser custom).

---

## Limpeza realizada

```bash
# Container e volume removidos
docker compose -f docker-compose.n8n.yml --env-file .env.n8n down --volumes
# senses_n8n_data volume removed

# Arquivos removidos do repo
rm docker-compose.n8n.yml .env.n8n
rm -rf cloudflared/    # recriado limpo pro novo target

# Tunnel reaproveitado (mesmo token, mesmo tunnel ID),
# config.yml agora aponta pra senses-os-api:3000

# DNS Cloudflare: deletado n8n CNAME, criado senses-api CNAME
```

## Estado pós-migração

| Item | Antes | Depois |
|---|---|---|
| Containers | n8n, cloudflared-n8n, senses-os-api | cloudflared, senses-os-api |
| Hostname público | n8n.ifops.com.br | senses-api.ifops.com.br |
| Tunnel ID | 41c382f6-… | 41c382f6-… (mesmo) |
| Token CF | reaproveitado | reaproveitado |
| Auth de webhook | basic-auth/painel n8n | X-Webhook-Secret no microserviço |
| Validação de payload | UI do n8n (zero gates) | Zod schema versionado |
| Lógica de criação de OS | HTTP call do n8n pro microserviço | chamada in-process (`runCreateOrders`) |

## Validação pós-deploy (2026-05-25)

```
$ dig +short senses-api.ifops.com.br @1.1.1.1
104.21.87.27
172.67.168.174

$ curl -o /dev/null -w "HTTP %{http_code}\n" https://senses-api.ifops.com.br/api/v1/health
HTTP 200

$ curl -X POST -o /dev/null -w "HTTP %{http_code}\n" https://senses-api.ifops.com.br/api/v1/webhook/clint/onboarding-remoto
HTTP 401

$ curl -X POST -o /dev/null -w "HTTP %{http_code}\n" \
    -H "X-Webhook-Secret: errado" \
    https://senses-api.ifops.com.br/api/v1/webhook/clint/onboarding-remoto
HTTP 403

$ TEST_SCENARIO=wrong-stage WEBHOOK_URL=https://senses-api.ifops.com.br npx tsx src/scripts/test-webhook.ts
HTTP 200 — outcome.status = ignorado_etapa_errada
```
