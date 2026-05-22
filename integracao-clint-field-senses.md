# Integração Clint CRM → n8n → Field Control
## Automação de OS de Recorrência — Senses

Documento de especificação técnica para implementação dos workflows de geração automática de OS recorrentes nas pipelines de Onboarding Remoto e Onboarding Presencial.

> **Versão 2 — Mudança principal:** o gate de disparo agora é a etapa **Boas-Vindas** existente na pipeline (não cria etapa nova). A validação do checklist atua como guarda: se completo, gera OS; se incompleto, ignora silenciosamente.

---

## 1. Visão Geral da Arquitetura

Dois workflows independentes no n8n, um por pipeline. Compartilham infraestrutura (Supabase, credenciais Field) mas têm lógicas de cálculo de datas distintas.

```
┌─────────────┐
│    Clint    │  Pipeline Onboarding Remoto    →  Webhook 1  ┐
│             │  (gate: etapa Boas-Vindas)                    │
│             │                                                │
│             │  Pipeline Onboarding Presencial →  Webhook 2  ┤
│             │  (gate: etapa Boas-Vindas)                    │
└─────────────┘                                                │
                                                                ▼
                                                  ┌───────────────────────┐
                                                  │         n8n           │
                                                  │  (Contabo VPS)        │
                                                  │                       │
                                                  │  Workflow Remoto      │
                                                  │  Workflow Presencial  │
                                                  └──────────┬────────────┘
                                                             │
                                  ┌──────────────────────────┼──────────────────────────┐
                                  ▼                          ▼                          ▼
                          ┌───────────────┐         ┌────────────────┐         ┌──────────────┐
                          │   Supabase    │         │ Field Control  │         │   Telegram   │
                          │  (log/audit)  │         │     API        │         │ (notificação)│
                          └───────────────┘         └────────────────┘         └──────────────┘
```

### Lógica do gate

Quando o card é movido para a etapa **Boas-Vindas**, a Clint dispara o webhook. O n8n recebe e valida o checklist:

- **Checklist completo** → cliente veio do caminho certo (checklist → Boas-Vindas). Gera OS, marca o card com tag "OS_gerada_OK", preenche campos customizados, deixa o card em Boas-Vindas (não move pra frente).
- **Checklist incompleto** → cliente caiu em Boas-Vindas por outro caminho (movido manualmente, vindo de outra etapa, etc). O n8n registra silenciosamente no log com status `ignorado_checklist_incompleto` e não age. Sem alerta, sem devolver card.

Essa abordagem usa o próprio checklist como marca da origem correta. Não precisa de tags intermediárias nem etapa nova.

---

## 2. Tabela Supabase (idempotência + auditoria)

```sql
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
```

A constraint `unique` em `clint_deal_id where status = 'success'` é a proteção contra duplicidade: se o workflow rodar duas vezes pra mesma OS por algum motivo, a segunda gravação vai falhar.

Os status com prefixo `ignorado_` são registros de auditoria: o sistema viu o disparo mas decidiu não agir. Útil pra entender depois "esse cliente deveria ter OS, por que não tem?".

---

## 3. Configuração na Clint

### 3.1 Estrutura de etapas

**Não cria etapa nova.** Usa a estrutura existente:

```
[Card de checklist] → [Boas-Vindas] → [próximas etapas existentes...]
                            ▲
                            │
                      Gate do webhook
```

### 3.2 Campos customizados obrigatórios no negócio

Esses campos precisam estar preenchidos para o checklist ser considerado completo. Marca todos como obrigatórios na Clint:

| Campo | Tipo | Exemplo |
|---|---|---|
| `cnpj` | texto | 12.345.678/0001-90 |
| `cliente_nome_razao` | texto | Indústria Tal S/A |
| `contrato_inicio` | data | 2026-02-15 |
| `contrato_fim` | data | 2027-02-15 |
| `endereco_completo` | texto | Rua X, 123 — Cidade/UF |
| `telefone_contato` | texto | (19) 99999-9999 |
| `email_contato` | email | cliente@empresa.com |
| `tecnico_padrao_id` | dropdown | (lista dos técnicos cadastrados no Field) |
| `os_field_ids_geradas` | texto longo | (preenchido pelo n8n após sucesso) |
| `disparo_status` | dropdown | pendente / sucesso / falha (preenchido pelo n8n) |

### 3.3 Configuração do webhook OUT na Clint

Na pipeline **Onboarding Remoto**:

```
Caminho: Configurações da origem → Integrações → Nova integração → Enviar Webhook
Gatilho: "Negócio entrou na etapa"
Etapa: "Boas-Vindas"
URL: https://<seu-n8n-contabo>/webhook/onboarding-remoto
Método: POST
Mapeamento: enviar TODOS os campos do negócio + checklist + dados do contato + usuário que disparou
```

Mesmo procedimento para a pipeline **Onboarding Presencial**, mudando a URL para `/webhook/onboarding-presencial`.

### 3.4 Payload esperado

Estrutura mínima do payload que o n8n vai receber:

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
      "endereco_completo": "Rua X, 123 - Rio Claro/SP",
      "telefone_contato": "+5519999999999",
      "email_contato": "cliente@empresa.com",
      "tecnico_padrao_id": "tech_field_456"
    },
    "checklist": [
      {"item": "Boas-vindas enviadas", "done": true},
      {"item": "Contrato assinado anexado", "done": true},
      {"item": "Cliente cadastrado no sistema", "done": true}
    ]
  },
  "contact": {
    "name": "João da Silva",
    "email": "joao@empresa.com",
    "phone": "+5519999999999"
  },
  "triggered_by": {
    "user_id": "user_clint_789",
    "user_email": "cs1@senses.com.br"
  },
  "triggered_at": "2026-05-21T14:30:00-03:00"
}
```

---

## 4. Function Node: Cálculo de Datas — ONBOARDING REMOTO

```javascript
// Input: $json.deal.custom_fields.contrato_inicio, contrato_fim
// Output: array de OS a serem criadas, com tipo e data

const contratoInicio = new Date($json.deal.custom_fields.contrato_inicio + 'T00:00:00');
const contratoFim = new Date($json.deal.custom_fields.contrato_fim + 'T00:00:00');

const osList = [];
const mesInicio = contratoInicio.getMonth() + 1; // 1-12
const ehImpar = mesInicio % 2 === 1;

let dataPrimeiroEnvio;

if (ehImpar) {
  // Onboarding em mês ímpar = primeiro envio na data do onboarding, já no calendário ímpar.
  dataPrimeiroEnvio = new Date(contratoInicio);
  osList.push({
    tipo: 'envio_refil_inicial',
    data: dataPrimeiroEnvio.toISOString().split('T')[0],
    descricao: 'Envio inicial (conclusão do onboarding)'
  });
} else {
  // Onboarding em mês par: gera envio inicial + equalização no próximo mês ímpar.
  // (Comportamento sujeito a confirmação — ver seção 9)
  dataPrimeiroEnvio = new Date(contratoInicio);
  osList.push({
    tipo: 'envio_refil_inicial',
    data: dataPrimeiroEnvio.toISOString().split('T')[0],
    descricao: 'Envio inicial (conclusão do onboarding)'
  });

  const proximoImpar = new Date(contratoInicio);
  proximoImpar.setMonth(proximoImpar.getMonth() + 1);
  proximoImpar.setDate(1);
  osList.push({
    tipo: 'envio_refil_equalizacao',
    data: proximoImpar.toISOString().split('T')[0],
    descricao: 'Envio de equalização (entrada no calendário ímpar)'
  });
  dataPrimeiroEnvio = proximoImpar;
}

// A partir do primeiro envio no calendário ímpar, soma 60 dias até o fim do contrato
let proxima = new Date(dataPrimeiroEnvio);
proxima.setDate(proxima.getDate() + 60);

while (proxima <= contratoFim) {
  osList.push({
    tipo: 'envio_refil_regular',
    data: proxima.toISOString().split('T')[0],
    descricao: 'Envio de refil recorrente'
  });
  proxima = new Date(proxima);
  proxima.setDate(proxima.getDate() + 60);
}

return [{ json: { os_a_criar: osList, total: osList.length } }];
```

---

## 5. Function Node: Cálculo de Datas — ONBOARDING PRESENCIAL

```javascript
// Mensal: primeira visita na data do disparo, depois mesmo dia do mês seguinte.

const contratoInicio = new Date($json.deal.custom_fields.contrato_inicio + 'T00:00:00');
const contratoFim = new Date($json.deal.custom_fields.contrato_fim + 'T00:00:00');
const diaAncoragem = contratoInicio.getDate();

const osList = [];

osList.push({
  tipo: 'visita_tecnica_inicial',
  data: contratoInicio.toISOString().split('T')[0],
  descricao: 'Visita técnica inicial (conclusão do onboarding presencial)'
});

let proxima = new Date(contratoInicio);
proxima.setMonth(proxima.getMonth() + 1);

while (proxima <= contratoFim) {
  const diaResultante = proxima.getDate();
  const deslizou = diaResultante !== diaAncoragem;

  osList.push({
    tipo: 'visita_tecnica_regular',
    data: proxima.toISOString().split('T')[0],
    descricao: deslizou
      ? `Visita técnica mensal (dia ajustado de ${diaAncoragem} para ${diaResultante})`
      : 'Visita técnica mensal'
  });

  proxima = new Date(proxima);
  proxima.setMonth(proxima.getMonth() + 1);
}

return [{ json: { os_a_criar: osList, total: osList.length } }];
```

---

## 6. Field Control — Endpoints e Payloads

### 6.1 Autenticação

```
X-Api-Key: <sua_chave_gerada_no_painel>
Content-Type: application/json
```

Gerar chave em: `https://app.fieldcontrol.com.br/#/configuracoes/configuracao-para-desenvolvedores`

### 6.2 Buscar ou criar cliente

```http
GET https://api.fieldcontrol.com.br/v3/clients?filter[document]=12345678000190
```

Se vazio, cria:

```http
POST https://api.fieldcontrol.com.br/v3/clients
```

```json
{
  "name": "Indústria Tal S/A",
  "document": "12345678000190",
  "phone": "+5519999999999",
  "email": "cliente@empresa.com",
  "address": {
    "street": "Rua X, 123",
    "city": "Rio Claro",
    "state": "SP"
  },
  "custom_fields": {
    "clint_deal_id": "deal_abc123",
    "pipeline_origem": "onboarding_remoto"
  }
}
```

### 6.3 Criar OS

```http
POST https://api.fieldcontrol.com.br/v3/service-orders
```

```json
{
  "client_id": "<id_retornado_acima>",
  "type": "envio_refil",
  "scheduled_date": "2026-03-15",
  "description": "Envio de refil recorrente — Contrato deal_abc123",
  "responsible_id": "tech_field_456",
  "tags": ["onboarding_remoto", "recorrencia_automatica"],
  "custom_fields": {
    "clint_deal_id": "deal_abc123",
    "os_sequencia": "3 de 12",
    "gerada_em": "2026-05-21T14:30:00-03:00"
  }
}
```

> **Importante:** nomes exatos de campos (`type`, `scheduled_date`, `responsible_id`) variam conforme a conta. Validar com `GET /v3/service-orders?limit=1` antes (ver Prompt 2 do playbook).

---

## 7. Workflow n8n — Estrutura de Nós

### 7.1 Sequência principal (15 nós)

1. **Webhook Trigger** — recebe POST da Clint
2. **Function: Validar Checklist** — todos itens `done === true`? Se não → ramo "ignorado_checklist_incompleto"
3. **Function: Validar Campos Obrigatórios** — CNPJ, datas, técnico, etc preenchidos? Se não → ramo "ignorado_campos_incompletos"
4. **Supabase: Checar Idempotência** — já existe log com `clint_deal_id` e status=success? Se sim → ramo "ignorado_duplicado"
5. **Function: Calcular Datas** — código da seção 4 ou 5
6. **HTTP: Buscar Cliente no Field** (por CNPJ)
7. **IF: Cliente existe?**
8. **HTTP: Criar Cliente no Field** (se necessário)
9. **Split In Batches** — itera sobre `os_a_criar`
10. **HTTP: Criar OS no Field** (com retry: 3 tentativas, backoff exponencial)
11. **Function: Consolidar Resultados** — monta array de `os_field_ids`
12. **Supabase: Inserir log** com status final
13. **HTTP: Atualizar Card na Clint** — adiciona tag "OS_gerada_OK", salva IDs em `os_field_ids_geradas`, seta `disparo_status` = "sucesso". **NÃO move o card de etapa** — deixa em Boas-Vindas pra CS continuar o processo normal.
14. **Telegram: Notificar gestor da CS** — resumo do que foi gerado
15. **Telegram: Notificar quem disparou** — confirmação

### 7.2 Ramos de erro

- **Checklist incompleto:** insere log no Supabase com `status='ignorado_checklist_incompleto'` e termina. Silencioso — sem alerta, sem mover card, sem tag. Auditoria fica registrada pra investigação posterior.

- **Campos obrigatórios faltando:** insere log com `status='ignorado_campos_incompletos'`. Como esse caso geralmente indica problema real (cliente avançou sem dados), envia Telegram **só pro gestor** (não pro operador) — comportamento configurável.

- **Idempotência hit:** insere log com `status='ignorado_duplicado'` e termina silenciosamente.

- **Field API falha:** insere log com `status='partial'` ou `failed`, adiciona tag "OS_falha_geracao" no card da Clint, Telegram urgente pro gestor com detalhes do erro pra retry manual. Card continua em Boas-Vindas.

---

## 8. Workflows Complementares

### 8.1 Cancelamento de contrato

```
Trigger: Webhook da Clint quando card recebe tag "Contrato Cancelado"
Ação: 
  1. Busca todas as OS futuras no Field com custom_field clint_deal_id = X
  2. Cancela cada uma via PATCH /v3/service-orders/{id} (status=cancelado)
  3. Atualiza log no Supabase
  4. Telegram pro gestor
```

### 8.2 Renovação de contrato

```
Trigger: Webhook da Clint quando card recebe tag "Renovação Confirmada"
Ação:
  1. Mesma lógica de Boas-Vindas mas com flag renovacao=true
  2. Usa a data fim NOVA do contrato
  3. Não cria cliente novo no Field, só novas OS
```

### 8.3 Watchdog semanal (cron)

```
Trigger: Cron toda segunda 8h
Ação:
  1. Lista todos os deals na Clint com tag "OS_gerada_OK" e contrato ativo
  2. Pra cada um, busca OS futuras no Field com aquele deal_id
  3. Se algum cliente está sem OS futura mas contrato ainda está ativo → alerta
  4. Gera relatório semanal: total OS geradas, falhas, próximas 30 dias
  5. Também lista deals em Boas-Vindas com status 'ignorado_checklist_incompleto'
     nos últimos 7 dias (cliente que chegou sem ter passado pelo caminho certo)
```

---

## 9. Pendências para Você Confirmar

**A. Regra de equalização no Onboarding Remoto.**  
Quando o cliente entra em mês par, o algoritmo atual gera DUAS OS: o "envio inicial" (na data do onboarding) + uma "equalização" no próximo mês ímpar. A alternativa: no mês par, o próprio onboarding *é* a equalização, e a próxima OS é só +60 dias depois.

**B. Comportamento se contrato fim < primeira OS regular.**  
Cliente assina contrato de 30 dias só. Cria só o envio inicial? Gera erro? Trava o disparo?

---

## 10. Checklist de Implementação

- [ ] Marcar campos customizados como obrigatórios em ambas as pipelines da Clint
- [ ] Criar tabela `os_geracao_log` no Supabase
- [ ] Gerar API key no Field Control
- [ ] Testar GET de cliente e POST de OS no Postman primeiro
- [ ] Criar workflow `onboarding-remoto` no n8n
- [ ] Criar workflow `onboarding-presencial` no n8n
- [ ] Configurar webhook OUT em cada pipeline da Clint (gatilho: etapa Boas-Vindas)
- [ ] Configurar bot Telegram pra notificações
- [ ] Teste end-to-end com cliente fictício antes de soltar pro time
- [ ] Treinar time CS no novo processo (explicar que mover pra Boas-Vindas dispara a geração)
- [ ] Criar workflows de cancelamento, renovação e watchdog
- [ ] Documentar processo pra time interno

---

*Versão 2 — 2026-05-21*
