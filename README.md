# senses-os-automation

Automação de geração de Ordens de Serviço (OS) recorrentes para os clientes da Senses, integrando o **Clint CRM** (origem do gatilho) com o **Field Control** (execução das OS) através de workflows orquestrados no **n8n**. Cobre as pipelines de Onboarding Remoto (envios de refil a cada 60 dias com calendário ímpar) e Onboarding Presencial (visita técnica mensal com ancoragem no dia do contrato).

O gatilho é a etapa **Boas-Vindas** já existente nas pipelines da Clint: ao mover um card para essa etapa, o webhook é disparado e o n8n valida o checklist como gate de origem. Se completo, calcula o cronograma de OS, busca/cria o cliente no Field, cria as OS uma a uma com retry, atualiza o card e notifica via Telegram. Se incompleto (cliente caiu em Boas-Vindas por caminho lateral), registra silenciosamente no log de auditoria e não age. Toda a operação é idempotente — uma constraint única no Supabase em `clint_deal_id` para `status = 'success'` protege contra duplicidade.

## Stack

- **Runtime:** Node.js 20+ (ESM, TypeScript strict)
- **Microserviço HTTP:** Fastify + Pino + Zod
- **Validação:** Zod
- **HTTP (saída):** Axios
- **Banco / auditoria:** Supabase (`@supabase/supabase-js`)
- **Orquestração:** n8n (self-hosted em VPS Contabo)
- **Testes:** Vitest
- **Notificações:** Telegram Bot API
- **Containerização:** Docker + docker-compose

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# edite .env com as chaves reais (Field, Supabase, Clint, n8n, Telegram)

# 3. Rodar testes
npm test

# 4. Descobrir schema da API do Field Control (Prompt 2 do playbook)
npm run discover-schema

# 5. Teste end-to-end com cliente fictício
npm run e2e
```

## Como rodar o microserviço HTTP

O `src/api/` expõe a lógica de cálculo + criação de OS como API HTTP consumida pelo n8n (e outros sistemas internos). Três modos:

### 1. Dev local (tsx watch)

```bash
npm install
cp .env.example .env   # preenche FIELD_CONTROL_API_KEY, SUPABASE_*, API_INTERNAL_KEY (openssl rand -hex 32)
npm run api:dev        # hot-reload, logs pretty (pino-pretty)
```

### 2. Docker local

```bash
docker compose build
docker compose up -d
docker compose logs -f
docker compose down
```

### 3. Deploy Contabo

```bash
git pull
docker compose build
docker compose up -d
docker compose logs --tail 50
```

### Endpoints

Todos sob `/api/v1`. Exigem header `X-Api-Key: $API_INTERNAL_KEY` (exceto `/health`).

**`GET /api/v1/health`** — público, sem auth.
```bash
curl http://localhost:3000/api/v1/health
# {"status":"ok","uptime":12.34,"version":"0.1.0"}
```

**`POST /api/v1/calculate-os`** — dry-run, calcula datas sem efeitos colaterais.
```bash
curl -X POST http://localhost:3000/api/v1/calculate-os \
  -H "X-Api-Key: $API_INTERNAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline": "onboarding_remoto",
    "contratoInicio": "2026-03-17",
    "contratoFim": "2027-03-17"
  }'
# { "pipeline": "onboarding_remoto", "totalOs": 7, "items": [ ... ] }
```

**`POST /api/v1/create-orders`** — calcula + cria OS no Field + grava log no Supabase. **Idempotente** via `clintDealId`.
```bash
curl -X POST http://localhost:3000/api/v1/create-orders \
  -H "X-Api-Key: $API_INTERNAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clintDealId": "deal_abc123",
    "customerId": "MjcyMjk4MTo1MjAyNQ==",
    "pipeline": "onboarding_remoto",
    "contratoInicio": "2026-03-17",
    "contratoFim": "2027-03-17",
    "cnpj": "12345678000190",
    "clienteNome": "Indústria Tal S/A",
    "disparadoPor": "cs1@senses.com.br"
  }'
# { "clintDealId": "deal_abc123", "status": "success", "totalOs": 7, "createdOrderIds": [...] }
# Chamada repetida com mesmo clintDealId → { "status": "ignorado_duplicado", "totalOs": 0, ... }
```

## Estrutura

```
.
├── src/
│   ├── api/            # microserviço Fastify (server.ts, routes, middleware, schemas)
│   ├── lib/            # clientes de API (Field, Supabase, Clint, Telegram)
│   ├── calculators/    # cálculo de datas (remoto: 60d / presencial: mensal)
│   └── scripts/        # discover-field-schema, e2e-test, utilitários
├── tests/              # testes unitários e de integração (vitest)
├── supabase/
│   └── migrations/     # DDL da tabela os_geracao_log
├── n8n-workflows/      # exports JSON dos workflows do n8n
├── Dockerfile          # multi-stage build (deps + runtime)
└── docker-compose.yml  # local + produção
```

## Documentos principais

- [`integracao-clint-field-senses.md`](./integracao-clint-field-senses.md) — spec técnico completo (arquitetura, payloads, cálculo de datas, ramos de erro)
- [`supabase/migrations/`](./supabase/migrations/) — schema do log de auditoria
- [`n8n-workflows/`](./n8n-workflows/) — workflows exportados (remoto, presencial, cancelamento, renovação, watchdog)
