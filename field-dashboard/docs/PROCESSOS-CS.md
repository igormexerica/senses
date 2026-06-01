# Como funciona o CS hoje (regras que o dashboard usa)

Referência das regras de negócio que o Field Dashboard encoda. Útil pra
onboarding e alinhamento. As regras vivem no banco (`03-functions.sql`,
`02-views.sql`); este doc é a versão em português.

## 1. Cobertura: o que cada cliente "deve" receber

O sistema gera **metas mensais** (chamadas *expectativas*) no dia 1 de cada mês:

- Cliente **presencial** → **1 visita por mês**.
- Cliente **remoto** → **1 refil a cada 2 meses** (meses ímpares: jan, mar, mai, jul, set, nov).

Os **gaps** são as metas ainda não cumpridas no mês. Cobertura = metas cumpridas ÷ metas.

## 2. Como uma meta é cumprida (status)

- **Visita:** concluída quando a *task* no Field está `done`.
- **Refil enviado:** existe a OS de recarga.
- **Refil concluído com rastreio:** o código de rastreio foi preenchido no
  formulário **"Código de rastreio."** do Field.
- **Refil sem rastreio:** enviado mas sem código → fica "em execução" = **risco
  invisível** (aba *Revisar*).

## 3. Agendado (puxado do Field, automático)

Se já existe uma OS **agendada** (marcada no Field, ainda não concluída) pro
cliente no mês, o gap aparece **"Agendado"** sozinho — o CS não registra nada à
mão. Só os gaps **sem agendamento** precisam de ação.

## 4. Jornada do cliente (etiqueta manual no Field)

Esperada pelo tempo de casa:

| Tempo de casa | Jornada esperada |
|---|---|
| 0–6 meses | onboarding |
| 6–12 meses | conexão |
| 12–24 meses | consolidação |
| 24+ meses | fidelizado-dna |

A etiqueta é **manual no Field**. Quando não bate com o tempo de casa, o
dashboard sinaliza (aba *Revisar*) pra gestora ajustar.

## 5. Tiers (valor do contrato)

`super-star`, `star`, `premium`, `growth` — etiquetas do Field usadas pra priorizar.

## 6. Criticidade de um gap

Combinação de **tier** (valor do cliente) × **risco** (jornada — quanto mais no
início, mais frágil):

- **Crítico:** tier alto (star/super-star) E cliente em fase inicial (onboarding/conexão).
- **Alto / Médio / Estável:** combinações intermediárias.

## 7. Avaliações e alertas

- Notas **≤ 3** são tratadas como críticas.
- Um **agente (Claude)** classifica comentários e avaliações e gera alertas
  críticos (`v_alertas_pendentes`), que o notificador empurra no Telegram do gestor.

## 8. De onde vêm os dados

Sincronizado do **Field Control a cada 30 min** (clientes, OS, avaliações,
equipamentos). **Cobertura e gaps são calculados aqui** — não existem no Field.
