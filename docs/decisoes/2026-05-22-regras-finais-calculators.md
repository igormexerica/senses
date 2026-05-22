# Regras finais dos calculators — confirmadas com CS em 2026-05-22

Substitui as seções §4 e §5 do `integracao-clint-field-senses.md`. O commit
`7b15462` implementou regras incorretas (Remoto com dia 01, Presencial sem
dia 01). Este documento é a regra autoritativa daqui em diante.

## §4 ONBOARDING REMOTO

**Premissas operacionais:**
- Cliente recebe kit + refil **na data exata do fechamento do contrato**.
- Recorrência roda em **meses ímpares**, ancorada no dia do fechamento.
- **Quantidade de refil é controlada pela CS no Field** (não pela automação).

**Algoritmo:**

1. **OS inicial:** `nextBusinessDay(contratoInicio)`. Sempre gerada,
   independente de par/ímpar.

2. **OS de equalização** (só se mês de fechamento é PAR):
   - data calculada: mesmo dia do próximo mês (que será ímpar)
   - data efetiva: `nextBusinessDay(data calculada)`
   - **descrição enriquecida:** `"⚠️ EQUALIZAÇÃO — Cliente iniciou em mês par.
     Conferir qtde reduzida com CS."`
   - finalidade: entrar no calendário ímpar com quantidade ajustada.

3. **OSs recorrentes** (a cada 2 meses, no dia do fechamento):
   - Mês ímpar → primeira recorrente = `contratoInicio + 2 meses`
   - Mês par → primeira recorrente = `(contratoInicio + 1 mês) + 2 meses`
   - Próximas: anterior + 2 meses (via `addMonthsClampedUTC`)
   - Cada uma passa por `nextBusinessDay`.

**Tratamento de dia 31:** clamp via `addMonthsClampedUTC`. Ex: assinou 31/01
→ 31/03, 31/05, 30/06 (jun tem 30), 31/07, 30/09 (set tem 30), 30/11...

**Exemplos canônicos:**
- Assina 17/03/2026 (ímpar):
  inicial 17/03, recorrentes 17/05, 17/07, 17/09, 17/11, 17/01/2027...
- Assina 17/02/2026 (par):
  inicial 17/02, equalização 17/03 (com aviso), recorrentes 17/05, 17/07...
- Assina 31/01/2026 (ímpar):
  inicial 31/01, recorrentes 31/03, 31/05, 30/06 (clamp), 31/07...

## §5 ONBOARDING PRESENCIAL

**Premissas operacionais:**
- Primeira visita é a **instalação**, na data combinada com o cliente.
- Visitas recorrentes vão pro **dia 01 de cada mês** pra CS organizar agenda
  centralizadamente e atender urgências.
- Cadência: **mensal**.

**Algoritmo:**

1. **Visita inicial (instalação):** `nextBusinessDay(contratoInicio)`.
2. **Visitas recorrentes:** dia 01 do mês seguinte à instalação, mensal,
   até `contratoFim`. Cada uma via `nextBusinessDay`.

**Exemplos canônicos:**
- Instalação 15/03/2026: inicial 15/03, recorrentes 01/04, 02/05 (01/05
  feriado), 01/06...
- Instalação 31/01/2026: inicial 02/02 (31/01 sáb → 02/02 seg), recorrentes
  02/03 (01/03 dom), 01/04, 02/05...

---

### Notas de implementação 2026-05-22

Duas revisões técnicas aplicadas após a implementação inicial do Presencial:

1. **Primeira recorrente baseada no `contratoInicio` (calc fixo), não na
   efetiva da inicial.** A versão anterior calculava a primeira recorrente
   como `firstDayOfNextMonth(efetivaInicial)`. Isso tornava as datas
   calculadas de clientes existentes silenciosamente dependentes do
   calendário de feriados — se a tabela mudar no futuro (feriado retroativo,
   ajuste municipal), recorrentes de contratos antigos recalculariam
   sozinhas.

   **Solução:** calc primeira recorrente = `firstDayOfNextMonth(contratoInicio)`,
   determinístico em função do contrato. Pra evitar colisão quando a efetiva
   bate com a inicial (caso 31/01 sáb → inicial 02/02 + primeira calc 01/02
   dom → efetiva 02/02 = colisão), detecta explicitamente e pula 1 mês.
   A OS que sofreu o skip carrega na `descricao` o aviso
   `"Visita técnica mensal (data ajustada pra evitar colisão com instalação)"`
   — útil pra triagem da CS e pra auditoria.

   Trade-off considerado: o skip avança o cliente em 1 mês de cobertura
   (primeira mensal cai em mar/02 em vez de fev/01). Aceito porque (a) o
   cliente já recebeu o serviço pleno via instalação no mesmo período e
   (b) a alternativa (recorrente coincidir com a instalação no mesmo dia)
   geraria duas OS no mesmo dia, confundindo a CS.

2. **Removido helper interno `proximoDiaUm()`.** Combinava
   `toFirstDayOfMonthUTC` com `firstDayOfNextMonthUTC`, mas o output do
   segundo já é dia 01 — a composição era no-op matematicamente.
   Foi criado pra satisfazer critério de aceite anterior que estava
   equivocado. `presencial.ts` agora importa apenas `firstDayOfNextMonthUTC`
   do `_date.ts`.
