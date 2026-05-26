# Pausa do projeto — Migração Senses pra Omie

Data: 2026-05-26
Decisão: pausa indefinida no desenvolvimento

## Contexto

Gestora da Senses informou que a empresa vai migrar do ERP atual pra Omie
em 1-3 meses. A integração Omie ↔ Field Control é nativa e cobre:
- Cadastro de clientes (Omie → Field automático)
- Sincronização de OSs (bidirecional)
- Sincronização de materiais

NÃO cobre (conforme doc oficial Omie store):
- Recorrências no Field

## Estado do projeto

- Microserviço Fastify operacional em senses-api.ifops.com.br
- 1053 customers Field mapeados no Supabase
- Cron de sincronização hora-em-hora rodando
- Webhook Clint configurado pra receber 2 disparos
- Worker Playwright pronto mas não validado E2E (parou no bug de seletor login)
- 5 commits da sessão de 2026-05-26 no main

## Por que pausa

Investir mais 4-8h pra concluir Playwright só pra descobrir em 1-3 meses
que Omie cobre boa parte do escopo = retrabalho.

## Próximos passos quando migração Omie definir

1. Mapear o que a integração Omie↔Field cobre na prática
2. Definir se Clint→Microserviço continua ou se vira Omie→Field direto
3. Adaptar microserviço pro novo cenário (provavelmente: mapping + Recorrência continuam, OS inicial sai)

## Containers parados

- senses-playwright-worker (parado pra liberar RAM)
- senses-redis (mantido — Microserviço continua usando)
- senses-os-api (continua rodando, recebe webhooks Clint)
- cloudflared (continua expondo senses-api.ifops.com.br)
