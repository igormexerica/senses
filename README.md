# senses-os-automation

Automação de geração de Ordens de Serviço (OS) recorrentes para os clientes da Senses, integrando o **Clint CRM** (origem do gatilho) com o **Field Control** (execução das OS) através de workflows orquestrados no **n8n**. Cobre as pipelines de Onboarding Remoto (envios de refil a cada 60 dias com calendário ímpar) e Onboarding Presencial (visita técnica mensal com ancoragem no dia do contrato).

O gatilho é a etapa **Boas-Vindas** já existente nas pipelines da Clint: ao mover um card para essa etapa, o webhook é disparado e o n8n valida o checklist como gate de origem. Se completo, calcula o cronograma de OS, busca/cria o cliente no Field, cria as OS uma a uma com retry, atualiza o card e notifica via Telegram. Se incompleto (cliente caiu em Boas-Vindas por caminho lateral), registra silenciosamente no log de auditoria e não age. Toda a operação é idempotente — uma constraint única no Supabase em `clint_deal_id` para `status = 'success'` protege contra duplicidade.

## Stack

- **Runtime:** Node.js 20+ (ESM, TypeScript strict)
- **Validação:** Zod
- **HTTP:** Axios
- **Banco / auditoria:** Supabase (`@supabase/supabase-js`)
- **Orquestração:** n8n (self-hosted em VPS Contabo)
- **Testes:** Vitest
- **Notificações:** Telegram Bot API

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

## Estrutura

```
.
├── src/
│   ├── lib/            # clientes de API (Field, Supabase, Clint, Telegram)
│   ├── calculators/    # cálculo de datas (remoto: 60d / presencial: mensal)
│   └── scripts/        # discover-field-schema, e2e-test, utilitários
├── tests/              # testes unitários e de integração (vitest)
├── supabase/
│   └── migrations/     # DDL da tabela os_geracao_log
└── n8n-workflows/      # exports JSON dos workflows do n8n
```

## Documentos principais

- [`integracao-clint-field-senses.md`](./integracao-clint-field-senses.md) — spec técnico completo (arquitetura, payloads, cálculo de datas, ramos de erro)
- [`supabase/migrations/`](./supabase/migrations/) — schema do log de auditoria
- [`n8n-workflows/`](./n8n-workflows/) — workflows exportados (remoto, presencial, cancelamento, renovação, watchdog)
