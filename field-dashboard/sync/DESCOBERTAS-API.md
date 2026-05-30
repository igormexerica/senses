# DESCOBERTAS-API.md — formato real da API do Field Control

Descoberto na Etapa 2 (chamadas exploratórias reais), 2026-05-28.
Conta: `https://carchost.fieldcontrol.com.br` · auth `X-Api-Key`.
Envelope de lista: `{"items": [...], "totalCount": N}` · paginação `limit`/`offset` (limit ≤ 100).

> Regra de ouro: os paths abaixo foram confirmados contra a API. O código original
> (escrito a partir da doc) errava vários. `field_client.py` já foi corrigido; os
> `sync_*.py` ainda **não** (dependem das decisões no fim deste doc).

## Endpoints — confirmados vs inexistentes

| Recurso | Path REAL (200) | O que o código usava | Status |
|---|---|---|---|
| Clientes | `GET /customers` (1263) | `/customers` ✓ / `/clientes` | OK |
| Etiquetas do cliente | `GET /customers/{id}/labels` | `/customers/{id}/tags` | **404 → labels** |
| Ordens de serviço | `GET /orders` (27946) | `/orders` ✓ | OK |
| Etiquetas da OS | `GET /orders/{id}/labels` | `/orders/{id}/tags` | **404 → labels** |
| Formulários da OS (metadados) | `GET /orders/{id}/forms` | `/orders/{id}/forms` ✓ | OK |
| **Respostas do formulário** | `GET /orders/{oid}/forms/{fid}` | `GET /forms/{id}` | **404 → aninhado** |
| Tipos de serviço | `GET /services` (38) | — | descoberto |
| **Equipamentos** | `GET /equipments` (2328) | — | descoberto (inventário) |
| Etiquetas (global) | `GET /labels` (53) | `GET /tags` | **404 → labels** |
| Avaliações | `GET /ratings` (715) | `GET /reviews` | **404 → ratings** |
| Comentários da OS | `GET /orders/{id}/comments` | `/orders/{id}/comments` ✓ | OK |
| **Tarefas da OS (STATUS real)** | `GET /orders/{id}/tasks` | `/orders/{id}/activities` | **404 → tasks** |
| Detalhe da task | `GET /tasks/{id}` | — | descoberto (link p/ order + rating) |

## Campos reais por recurso

### `/customers`
`id, name, code, notes, documentNumber, primaryLocation{id}, archived, createdAt, external{id}, contact{email,phone}, address{...}, statistics{service{firstAt,lastAt,total}, rating{...}}`
- `id` = código Field (base64, ex `MjcyMjk4MTo1MjAyNQ==`). Use como `codigo_field`.
- **Sem campo de tags/tier/jornada no objeto.** Segmentação vem de `/customers/{id}/labels`.
- `code`, `documentNumber` geralmente `null`. Não há `contractStartDate` — só `createdAt` e `statistics.service.firstAt` (ver decisão D5).

### `/orders`
`id, link, archived, identifier, description, productsTotalValue, servicesTotalValue, totalValue, deadlineContract, createdAt, updatedAt, metadata, external{id}, customer{id}, service{id}, address{...}, ticket, location{id}`
- **Tipo da OS = nome do `service` (via `service.id` → `/services`).** Não existe `type`/`orderType`.
- `customer.id` → liga ao cliente.
- **NÃO existe campo `status` nem `finishedAt`/`closedAt`** no objeto (ver decisão D2).
- Tem `updatedAt` → sync incremental por data é viável.
- `metadata` quase sempre `{}`/`null`.

### `/services` (tipos de OS — 38)
`id, name, duration, archived`. Mapa relevante pro domínio:
- Presencial: `MANUTENÇÃO MENSAL`, `MANUTENÇÃO MENSAL MATERNIDADE`, `MANUTENÇÃO MENSAL MULTI EQUIPAMENTOS`, `INSTALAÇÃO PRESENCIAL`, `Chamado Técnico Presencial`
- **Refil/remoto: `ENVIO MENSAL DE RECARGA` (`MTI0NjYxOjUyMDI1`), `ENVIO BIMESTRAL DE RECARGA` (`Mzg0ODc3OjUyMDI1`)** — "recarga", não "refil". Bimestral = o refil a cada 2 meses do briefing.
- Remoto: `INSTALAÇÃO REMOTA`, `INSTALAÇÃO CONTRATO PILOTO REMOTO`, `Chamado Técnico Remoto`, `RETIRADA DE EQUIPAMENTOS (REMOTO)`
- Outros: instalação/retirada/chamado/troca de fragrância/upgrade/substituição/primeiro envio/comodato/laudos. Ruído interno: `ALMOÇO`, `DAILY`, `1:1`, `teste`, `Separação`.

### `/equipments` (equipamentos / inventário — 2328)
`id, name, number, type{id}, customer{id}, location{id}, archived, createdAt,
updatedAt, notes, qrCode, storage, avatarUrl, locationEnvironment, locationSector`.
- **`customer.id`** → liga ao cliente (`clientes.codigo_field`). Sempre presente (0 sem customer).
- **SEM filtro server-side:** `?customer=` é **ignorado** (devolve os 2328) e
  `GET /customers/{id}/equipments` dá **404** → varrer `/equipments` inteiro e agrupar
  por `customer.id` no banco.
- **`updatedAt` vem sempre `null`** → não dá incremental por data; sync é full,
  gateado por hora (`EQUIP_MIN_HORAS`, default 6h, no `run_sync.py`).
- **`type` vem só como `{id}`** (base64, sem nome) → inútil pra classificar; o modelo
  mora no `name`.
- **`name` é inconsistente:** ~65% trazem o modelo (`"SENSES BRISA - BRANCA"`,
  `"SENSES 35 - PRETA"`, `"SENSES NIMBUS II - PRETA"`); os outros ~35% foram nomeados
  pela **localização física** (`"RECEPÇÃO"`, `"BANHEIRO FEMININO"`, `"."`, `"REMOTO"`).
  `modelo`/`cor` são **derivados no ingest** (`sync_equipamentos.parse_modelo_cor`):
  modelo = 1º segmento depois de `SENSES` e antes de `-`; cor = `BRANCA`/`PRETA`
  (tolera typo `BRACA` e sufixo sem hífen `"BRISA BRANCA"`). Nome não-SENSES →
  `modelo=NULL` (conta como `NÃO IDENTIFICADO` nas views), máquina ainda é contada.
- **`archived`**: 540 dos 2328 estão arquivados (máquinas retiradas). As views de
  inventário filtram `archived=false` + cliente `ativo=TRUE`.
- Frota ativa (cliente ativo, não-archived): **1502 máquinas em 582 clientes**.
  Top modelos: BRISA 380, SERENA 136, BRUMA 128, NEBULA 90, STRATUS 70, "35" 60,
  NIMBUS II 35. (`VENTHUS`/`SERANA` = typos de `VENTUS`/`SERENA` no Field — não
  normalizados, ficam como modelos próprios.) Views: `v_inventario_modelo` (frota
  por modelo) + `v_inventario_cliente` (por cliente, breakdown jsonb `por_modelo`).

### `/ratings` (avaliações — 715)
`stars, comment, createdAt, task{id}`.
- `stars` = nota (1–5). `comment` (22% preenchidos). `task.id` = **id da OS** (não `order`).
- **NÃO há `id` próprio** → precisa de chave sintética (ver decisão D3).

### `/labels` (etiquetas — 53)
`id, name, color, type`. Mistura várias dimensões (nome exato como no Field):
- **Modalidade:** `Presencial`, `REMOTO`, `Remoto`, `Senses Car`
- **Jornada:** `Onboarding`, `Conexão`, `Consolidação`, `Recovery` (sem `fidelizado-dna`)
- **Tier:** `Star`, `Premium` (sem `growth`, sem `super-star` nos 40 vistos)
- **Operacionais/alerta:** `Alerta`, `Relacion. acionar`, `Retorno 15 dias`, `Cliente insatisfeito`, `Baixo consumo`, `Consumo elevado`, `Equi. desligado`, `equip. fora do local`, `Envio Ref incompleto`, `EM ANÁLISE`, `Imediata`, `Repos. Tecnologia`
- **Contrato/equip.:** `COMODATO`, `COMODATO EM USO`, `COMODATO DISPONÍVEL`, `AQUISIÇÃO`, `Permuta`, `Assinatura de Refil`, `Piloto`, `Base`, `Troca de equipamento`
- **Mês (agendamento):** `02/2026`…`06/2026`, `maio/junho`
- Campo `type` agrupa categorias de label (valores não inspecionados — candidato pra distinguir escopo cliente×os).
- Anexação: `GET /customers/{id}/labels` → 200; `GET /orders/{id}/labels` → 200 (`{items,totalCount}`).

### Formulários — respostas (onde mora o código de rastreio)
1. `GET /orders/{oid}/forms` → lista só metadados: `id, name, archived, createdAt, order{id}`. **Não traz respostas.**
2. `GET /orders/{oid}/forms/{fid}` → traz `questions[]` + `score`. Cada questão:
   `type, position, required, title, answer, options[], conditions[], answeredAt`.
3. `GET /forms/{id}` (sem o order) → **404**.

Forms vistos: `Avaliação Cliente`, `Fotos antes e depois`, `Programação Equipamentos`,
`Climatização`, `Programação Maquinas`, **`Código de rastreio.`**

**Código de rastreio (refil):** form com `name == "Código de rastreio."`, questão
`title == "Nº do código:"` (`short-answer`), `answer` = ex `"AB708035588BR"` (rastreio Correios).
Só **4 de 13** OS de recarga amostradas tinham esse form → o resto é "refil sem rastreio"
(alimenta `v_refis_sem_rastreio`). `match_expectativas_os` deve procurar o form pelo nome
`Código de rastreio.` e ler `questions[].answer`.

### `/orders/{id}/comments`
Endpoint 200; amostras vazias. Confirmar shape (`text`/`message`, `author`, `createdAt`) quando houver volume.

### Tasks — **o status real da execução** (descoberto 2026-05-29)
A `order` NÃO tem status. Quem tem é a **task**: cada order tem ~1 task
(`/tasks` global = 27887 ≈ 27954 orders). `GET /orders/{id}/tasks` lista as tasks;
`GET /tasks/{id}` traz o detalhe. Campos:
`id, status, startedAt, completedAt, statusDescription, ratingLink, employee{id},
order{id}, scheduling{type,date}, archived, viewedAt, receivedAt, ...`
- **`status`** = `'done'` (concluída) etc. → fonte do status da OS.
- **`completedAt`** → data de conclusão real (→ `concluida_em`).
- **`order{id}`** → liga task à OS. **`ratingLink`** → a avaliação (/ratings) gruda na task.
- Foi essa camada que destravou a cobertura: derivar status de "formulário preenchido"
  subestimava (só 153/636 OS de maio tinham form), enquanto `task.status='done'` é o sinal real.

## Divergências no código atual

`field_client.py` — **CORRIGIDO** nesta etapa:
- `listar_etiquetas` `/tags` → `/labels`
- `listar_etiquetas_cliente` `/customers/{id}/tags` → `/customers/{id}/labels`
- `listar_etiquetas_os` `/orders/{id}/tags` → `/orders/{id}/labels`
- `listar_avaliacoes` `/reviews` → `/ratings`
- respostas de form: novo `recuperar_formulario_os(order_id, form_id)` → `/orders/{oid}/forms/{fid}`; removido `/forms/{id}`
- `listar_atividades_os` removido (endpoint não existe)
- novo helper `listar_servicos()` (mapa tipo de OS)

`sync_*.py` — **REESCRITOS** conforme as regras de derivação abaixo.

## Regras de derivação (implementadas — SUPOSIÇÕES a validar com dados reais)

Estas regras compensam o que a API não entrega de forma estruturada. Igor deve
conferir contra a operação real e a gente ajusta.

- **Etiqueta → slug (D1=A):** `etiquetas.nome` guarda o slug canônico
  (`lower` + sem acento + `" - "`/espaço → `-`). Ex: `Conexão→conexao`,
  `Fidelizado - DNA→fidelizado-dna`, `Super Star→super-star`. As views casam esses
  slugs. Escopo definido pela origem: `/customers/{id}/labels`→`cliente`,
  `/orders/{id}/labels`→`os` (resolve D4, data-driven).
- **Tipo da OS:** serviço com "RECARGA" no nome → `tipo='refil'` (pro
  `match_expectativas_os` casar via `LIKE '%refil%'`); demais mantêm o nome real do
  serviço. *Looseness conhecida:* a cláusula de visita do match usa
  `tipo IS NOT NULL`, então QUALQUER OS concluída de um presencial no mês conta como
  visita — Igor pode querer apertar pra só MANUTENÇÃO MENSAL depois.
- **Status (D2=B, revisto p/ TASK em 2026-05-29):** vem de `/orders/{id}/tasks`:
    - `archived` → `inativa`
    - refil + rastreio preenchido → `concluida`
    - refil + task `done` SEM rastreio → `em_execucao` (enviado, código pendente → vira `dias_sem_rastreio`)
    - refil + task não-`done` → `pendente`
    - não-refil + task `done` → `concluida`; senão `pendente`
    - `concluida_em` = `max(task.completedAt)` das tasks `done`.
  A distinção refil com/sem rastreio (coração do controle) é preservada — o
  `match_expectativas_os` continua olhando `respostas_form` pro rastreio.
  *(Antes: status derivava de "formulário preenchido" → subestimava cobertura.)*
- **Forms (FORMS_SOMENTE_REFIL=True):** como o status agora vem da task, formulário só
  é buscado pra OS de refil (pegar o `Código de rastreio.`). `respostas_form` passa a
  conter só o rastreio. Decisão de velocidade (corta o backfill), reversível pelo flag
  no `sync_os.py` (=False volta a varrer todos os forms de toda OS).
- **respostas_form.campo** = `'<nome do form> — <pergunta>'` — garante que o form de
  rastreio caia no índice `campo ILIKE '%rastreio%'`.
- **Avaliação (D3, corrigido):** `nota=stars`; o vínculo é `rating.task.id` →
  `GET /tasks/{id}.order.id` → `ordens_servico.codigo_field`. Chave sintética
  `codigo_field = order.id|createdAt`; upsert por `os_id` (UNIQUE, 1 avaliação/OS).
  *(Bug anterior: assumia `task.id = order.id` → 715 puladas, 0 gravadas.)*
- **data_inicio_contrato (D5):** `createdAt` do cliente (truncado pra DATE).
- **Incremental:** sem filtro de data na API → lista todas as OS sempre; sub-chamadas
  só pras OS com `updatedAt > since`. Full sync é caro (sub-recursos por OS ativa);
  rodar fora de pico. Otimização futura: concorrência.

## Decisões (resolvidas com o Igor em 2026-05-28)

- **D1 — etiqueta → slug:** **(A)** normalizar no ingest, slug em `etiquetas.nome`. Sem
  tocar no schema. Confirmado: as 10 labels de segmentação existem todas (ver tabela de
  uso abaixo); só faltava normalizar caixa/acento.
- **D2 — status:** **(B)** derivar coarse, com a exceção do refil (rastreio = conclusão).
  Documentado acima como suposição a validar.
- **D3 — chave da avaliação:** `task.id|createdAt`. ✓
- **D4 — escopo de label:** resolvido data-driven (origem da chamada), não por lista hardcoded.
- **D5 — data_inicio_contrato:** `createdAt`. ✓
- **Confirmado pelo Igor:** todo cliente `remoto` recebe refil bimestral — a modalidade
  define sozinha, não depende de tipo de contrato. (Bate com `gerar_expectativas_mes`:
  refil pra `remoto` ativo em meses ímpares.)

## Uso real das etiquetas de cliente (1263 clientes, 564 com ≥1 label)

| dimensão | label (Field) → slug | clientes (ativos) |
|---|---|---|
| modalidade | Presencial → presencial | 318 (317) |
| modalidade | Remoto → remoto | 247 (247) |
| jornada | Fidelizado - DNA → fidelizado-dna | 211 (210) |
| jornada | Onboarding → onboarding | 140 |
| jornada | Consolidação → consolidacao | 102 |
| jornada | Conexão → conexao | 95 |
| tier | Growth → growth | 87 |
| tier | Premium → premium | 54 (53) |
| tier | Super Star → super-star | 38 |
| tier | Star → star | 34 |
| contrato/outros | Comodato (537), Base (335), Senses Car (13), Piloto (6), Assinatura de Refil (4), Permuta (2) | não-segmentação |

Labels em CAIXA-ALTA duplicadas (`COMODATO`, `REMOTO`…), meses (`02/2026`…) e operacionais
(`Alerta`, `Crítico`…) têm 0 clientes — são legado ou escopo-OS.
